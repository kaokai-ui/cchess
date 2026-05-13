import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DarkBoard from '../components/DarkBoard';
import { ensureAnonymousAuth } from '../firebase/app';
import {
  getCurrentUserId,
  getDarkValidMovesForRoom,
  getPlayerColor,
  getRoomPlayerCount,
  isPlayerTurn,
  leaveOnlineRoom,
  restartOnlineRoom,
  submitDarkFlip,
  submitDarkMove,
  subscribeToOnlineRoom,
} from '../online/service';
import type { OnlineRoom, PresenceSnapshot } from '../online/types';
import type { Position } from '../shared/types';

function getColorLabel(color: 'red' | 'black' | null) {
  if (color === 'red') {
    return '紅方';
  }

  if (color === 'black') {
    return '黑方';
  }

  return '未定';
}

function getConnectionLabel(
  uid: string | null,
  presence: Record<string, PresenceSnapshot>,
) {
  if (!uid) {
    return '待加入';
  }

  return presence[uid]?.connected ? '連線中' : '離線';
}

const OnlineDarkGame: React.FC = () => {
  const navigate = useNavigate();
  const { roomId = '' } = useParams();
  const [room, setRoom] = useState<OnlineRoom | null>(null);
  const [presence, setPresence] = useState<Record<string, PresenceSnapshot>>({});
  const [myUid, setMyUid] = useState('');
  const [selectedCell, setSelectedCell] = useState<Position | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [restarting, setRestarting] = useState(false);

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};

    const start = async () => {
      try {
        const user = await ensureAnonymousAuth();
        const uid = await getCurrentUserId();
        if (!active) {
          return;
        }

        setMyUid(uid || user.uid);
        unsubscribe = subscribeToOnlineRoom(roomId, (snapshot) => {
          if (!active) {
            return;
          }

          setRoom(snapshot.room);
          setPresence(snapshot.presence);
          setBusy(false);
        });
      } catch (caughtError) {
        if (!active) {
          return;
        }

        setBusy(false);
        setError(
          caughtError instanceof Error ? caughtError.message : '無法載入房間資料。',
        );
      }
    };

    void start();

    return () => {
      active = false;
      unsubscribe();
    };
  }, [roomId]);

  const activeSelection = useMemo(() => {
    if (!room || !selectedCell) {
      return null;
    }

    const piece = room.board[selectedCell.row]?.[selectedCell.col];
    if (!piece || !piece.revealed || piece.color !== room.currentPlayer) {
      return null;
    }

    return selectedCell;
  }, [room, selectedCell]);

  const validMoves = useMemo(() => {
    if (!room || !activeSelection || !isPlayerTurn(room, myUid)) {
      return [];
    }

    return getDarkValidMovesForRoom(
      room.board,
      activeSelection,
      room.currentPlayer,
      room.darkChessSettings,
    );
  }, [activeSelection, myUid, room]);

  const myColor = room ? getPlayerColor(room, myUid) : null;
  const waitingForGuest = room?.status === 'waiting';

  const handleLeave = async () => {
    if (room) {
      await leaveOnlineRoom(room.roomId);
    }
    navigate('/');
  };

  const handleCopyRoomId = async () => {
    if (!room) {
      return;
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(room.roomId);
      return;
    }

    const input = document.createElement('input');
    input.value = room.roomId;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
  };

  const handleCellClick = async (pos: Position) => {
    if (!room || !isPlayerTurn(room, myUid) || room.phase !== 'playing') {
      return;
    }

    const cell = room.board[pos.row][pos.col];

    if (cell && !cell.revealed) {
      try {
        setError('');
        setSelectedCell(null);
        await submitDarkFlip(room.roomId, pos);
      } catch (caughtError) {
        setError(
          caughtError instanceof Error ? caughtError.message : '翻棋失敗。',
        );
      }
      return;
    }

    const isValidTarget = validMoves.some(
      (candidate) => candidate.row === pos.row && candidate.col === pos.col,
    );

    if (activeSelection && isValidTarget) {
      try {
        setError('');
        await submitDarkMove(room.roomId, activeSelection, pos);
        setSelectedCell(null);
      } catch (caughtError) {
        setError(
          caughtError instanceof Error ? caughtError.message : '送出棋步失敗。',
        );
      }
      return;
    }

    if (cell && cell.revealed && cell.color === myColor) {
      setSelectedCell(pos);
      return;
    }

    setSelectedCell(null);
  };

  const handleRestart = async () => {
    if (!room) {
      return;
    }

    try {
      setRestarting(true);
      setError('');
      setSelectedCell(null);
      await restartOnlineRoom(room.roomId);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : '無法開始下一局。',
      );
    } finally {
      setRestarting(false);
    }
  };

  if (busy) {
    return (
      <div className="min-h-screen bg-amber-50 flex items-center justify-center text-xl text-amber-900">
        連線中...
      </div>
    );
  }

  if (!room) {
    return (
      <div className="min-h-screen bg-amber-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl p-8 text-center space-y-4 max-w-md w-full">
          <p className="text-xl text-red-700">找不到這個房間，或房間已被刪除。</p>
          <button
            className="w-full py-3 rounded-2xl bg-gray-700 text-white text-lg font-bold"
            onClick={() => navigate('/online/lobby?variant=dark')}
          >
            返回連線大廳
          </button>
        </div>
      </div>
    );
  }

  const turnText = room.isFlippingFirst
    ? '房主先翻第一顆棋子'
    : `${room.currentPlayer === 'red' ? '紅方' : '黑方'}的回合`;

  return (
    <div className="h-screen bg-gradient-to-b from-amber-50 to-amber-100 flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-3 py-2 sm:px-4 sm:py-3">
        <div className="max-w-4xl mx-auto space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              className="px-4 py-2 bg-gray-700 text-white rounded-xl text-lg font-bold"
              onClick={() => void handleLeave()}
            >
              離開房間
            </button>
            <div className="flex flex-wrap gap-2">
              <button
                className="px-4 py-2 bg-amber-600 text-white rounded-xl text-lg font-bold"
                onClick={() => void handleCopyRoomId()}
              >
                複製房號
              </button>
              <div className="px-4 py-2 bg-white rounded-xl shadow-sm">
                <label className="block text-xs text-gray-500 mb-1">房號</label>
                <input
                  className="w-28 sm:w-36 bg-transparent text-lg font-bold text-amber-900 outline-none select-all"
                  readOnly
                  value={room.roomId}
                  onFocus={(event) => event.currentTarget.select()}
                  onClick={(event) => event.currentTarget.select()}
                />
              </div>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="bg-white rounded-2xl px-4 py-3 shadow-sm">
              <p className="text-sm text-gray-500">你的身份</p>
              <p className="text-xl font-bold text-amber-900">{getColorLabel(myColor)}</p>
            </div>
            <div className="bg-white rounded-2xl px-4 py-3 shadow-sm">
              <p className="text-sm text-gray-500">房間狀態</p>
              <p className="text-xl font-bold text-amber-900">
                {waitingForGuest ? '等待對手加入' : turnText}
              </p>
            </div>
            <div className="bg-white rounded-2xl px-4 py-3 shadow-sm">
              <p className="text-sm text-gray-500">在線玩家</p>
              <p className="text-xl font-bold text-amber-900">
                {getRoomPlayerCount(room)} / 2
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="bg-white rounded-2xl px-4 py-3 shadow-sm">
              <p className="text-sm text-gray-500">房主</p>
              <p className="text-lg font-bold text-amber-900">
                {getColorLabel(getPlayerColor(room, room.hostUid))} · {getConnectionLabel(room.hostUid, presence)}
              </p>
            </div>
            <div className="bg-white rounded-2xl px-4 py-3 shadow-sm">
              <p className="text-sm text-gray-500">對手</p>
              <p className="text-lg font-bold text-amber-900">
                {getColorLabel(room.guestUid ? getPlayerColor(room, room.guestUid) : null)} · {getConnectionLabel(room.guestUid, presence)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex items-center justify-center min-h-0 px-2">
        <DarkBoard
          board={room.board}
          selectedCell={activeSelection}
          validMoves={validMoves}
          lastMove={room.lastMove}
          onCellClick={(pos) => void handleCellClick(pos)}
        />
      </div>

      <div className="flex-shrink-0 py-2 text-center px-4">
        <span className="inline-block px-4 py-2 bg-amber-100 rounded-xl text-sm sm:text-base text-amber-900">
          {room.message}
        </span>
        {error && (
          <div className="mt-2 inline-block px-4 py-2 bg-red-50 border border-red-300 rounded-xl text-sm sm:text-base text-red-700">
            {error}
          </div>
        )}
      </div>

      {(waitingForGuest || room.status === 'abandoned' || room.phase === 'gameOver') && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl shadow-2xl p-6 sm:p-8 max-w-sm w-full text-center space-y-4">
            <h2 className="text-2xl sm:text-3xl font-bold text-amber-900">
              {waitingForGuest
                ? '等待對手加入'
                : room.status === 'abandoned'
                  ? '房間已中斷'
                  : room.winner === myColor
                    ? '你贏了'
                    : room.winner
                      ? '你輸了'
                      : '對局結束'}
            </h2>
            <p className="text-base sm:text-lg text-gray-700">{room.message}</p>
            <div className="space-y-3">
              {waitingForGuest && (
                <div className="space-y-2">
                  <label className="block text-sm text-gray-500">房號</label>
                  <input
                    className="w-full rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-center text-xl font-bold tracking-[0.35em] text-amber-900 outline-none select-all"
                    readOnly
                    value={room.roomId}
                    onFocus={(event) => event.currentTarget.select()}
                    onClick={(event) => event.currentTarget.select()}
                  />
                  <button
                    className="w-full py-3 bg-amber-600 text-white text-lg font-bold rounded-2xl"
                    onClick={() => void handleCopyRoomId()}
                  >
                    複製房號邀請對手
                  </button>
                </div>
              )}
              {room.phase === 'gameOver' && room.status === 'finished' && (
                <button
                  className="w-full py-3 bg-emerald-600 text-white text-lg font-bold rounded-2xl disabled:opacity-60"
                  onClick={() => void handleRestart()}
                  disabled={restarting}
                >
                  {restarting ? '重新開始中...' : '繼續遊戲'}
                </button>
              )}
              <button
                className="w-full py-3 bg-gray-700 text-white text-lg font-bold rounded-2xl"
                onClick={() => void handleLeave()}
              >
                返回主選單
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OnlineDarkGame;
