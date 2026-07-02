import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import DarkBoard from '../components/DarkBoard';
import {
  getDarkValidMovesForRoom,
  getPlayerColor,
  getRoomPlayerCount,
  isPlayerTurn,
  reconnectOnlineRoom,
  restartOnlineRoom,
  submitDarkFlip,
  submitDarkMove,
  submitDarkSurrender,
  subscribeToOnlineRoom,
} from '../online/service';
import { leaveOnlineRoomThenNavigateHome } from '../online/leaveNavigation';
import { useSettingsStore } from '../stores/settingsStore';
import type { DarkOnlineRoom, PresenceSnapshot } from '../online/types';
import { isDarkOnlineRoom } from '../online/types';
import type { Position } from '../shared/types';

const FLIP_CUE_DURATION_MS = 700;

function isSamePosition(left: Position | null, right: Position | null) {
  return (
    left !== null &&
    right !== null &&
    left.row === right.row &&
    left.col === right.col
  );
}

function findRemoteFlipPosition(
  previousRoom: DarkOnlineRoom | null,
  nextRoom: DarkOnlineRoom | null,
  myUid: string,
): Position | null {
  if (!previousRoom || !nextRoom || !myUid) {
    return null;
  }

  if (previousRoom.variant !== 'dark' || nextRoom.variant !== 'dark') {
    return null;
  }

  if (previousRoom.activePlayerUid === null || previousRoom.activePlayerUid === myUid) {
    return null;
  }

  let flipPosition: Position | null = null;

  for (let row = 0; row < previousRoom.board.length; row += 1) {
    for (let col = 0; col < previousRoom.board[row].length; col += 1) {
      const previousCell = previousRoom.board[row][col];
      const nextCell = nextRoom.board[row]?.[col];

      const isFreshReveal =
        previousCell !== null &&
        nextCell !== null &&
        previousCell.revealed === false &&
        nextCell.revealed === true &&
        previousCell.type === nextCell.type &&
        previousCell.color === nextCell.color;

      if (isFreshReveal) {
        if (flipPosition) {
          return null;
        }

        flipPosition = { row, col };
      }
    }
  }

  return flipPosition;
}

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
  const flipRevealCueEnabled = useSettingsStore(
    (state) => state.ui.flipRevealCueEnabled,
  );
  const [room, setRoom] = useState<DarkOnlineRoom | null>(null);
  const [presence, setPresence] = useState<Record<string, PresenceSnapshot>>({});
  const [myUid, setMyUid] = useState('');
  const [selectedCell, setSelectedCell] = useState<Position | null>(null);
  const [flipCue, setFlipCue] = useState<Position | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [leaving, setLeaving] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [surrendering, setSurrendering] = useState(false);
  const previousRoomRef = useRef<DarkOnlineRoom | null>(null);
  const flipCueTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    let active = true;
    let unsubscribe = () => {};

    const start = async () => {
      try {
        const reconnectResult = await reconnectOnlineRoom(roomId);
        if (!active) {
          return;
        }

        setMyUid(reconnectResult.userId);
        unsubscribe = subscribeToOnlineRoom(roomId, (snapshot) => {
          if (!active) {
            return;
          }

          setRoom(isDarkOnlineRoom(snapshot.room) ? snapshot.room : null);
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

  useEffect(() => {
    const remoteFlip = findRemoteFlipPosition(previousRoomRef.current, room, myUid);
    previousRoomRef.current = room;

    if (!flipRevealCueEnabled || !remoteFlip) {
      return;
    }

    if (flipCueTimerRef.current) {
      clearTimeout(flipCueTimerRef.current);
    }

    setFlipCue(remoteFlip);
    flipCueTimerRef.current = setTimeout(() => {
      setFlipCue((currentCue) => (isSamePosition(currentCue, remoteFlip) ? null : currentCue));
      flipCueTimerRef.current = null;
    }, FLIP_CUE_DURATION_MS);
  }, [flipRevealCueEnabled, myUid, room]);

  useEffect(() => {
    return () => {
      if (flipCueTimerRef.current) {
        clearTimeout(flipCueTimerRef.current);
      }
    };
  }, []);

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

  const myColor = room ? (getPlayerColor(room, myUid) as 'red' | 'black' | null) : null;
  const waitingForGuest = room?.status === 'waiting';
  const waitingForReconnect = Boolean(
    room && waitingForGuest && room.guestUid && room.reconnectDeadlineAt,
  );
  const canSurrender = Boolean(
    room &&
      room.phase === 'playing' &&
      room.status === 'playing' &&
      myColor &&
      !waitingForGuest,
  );

  const handleLeave = async () => {
    if (leaving) {
      return;
    }

    setLeaving(true);
    setError('');
    await leaveOnlineRoomThenNavigateHome(room?.roomId, navigate);
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

  const handleSurrender = async () => {
    if (!room) {
      return;
    }

    try {
      setSurrendering(true);
      setError('');
      setSelectedCell(null);
      await submitDarkSurrender(room.roomId);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : '投降失敗，請稍後再試。',
      );
    } finally {
      setSurrendering(false);
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
    ? room.activePlayerUid === myUid
      ? '輪到你先翻第一顆棋子'
      : '輪到對手先翻第一顆棋子'
    : `${room.currentPlayer === 'red' ? '紅方' : '黑方'}的回合`;

  return (
    <div className="h-screen bg-gradient-to-b from-amber-50 to-amber-100 overflow-hidden">
      <div className="flex h-full min-h-0 flex-col gap-3 p-3 md:flex-row md:p-4">
        <aside className="flex-shrink-0 space-y-2 overflow-y-auto md:w-52 lg:w-56 xl:w-60">
          <div className="grid grid-cols-3 gap-2">
            <button
              className="w-full px-3 py-3 bg-gray-700 text-white rounded-xl text-sm font-bold sm:text-base"
              onClick={() => void handleLeave()}
              disabled={leaving}
            >
              {leaving ? '離開中...' : '離開房間'}
            </button>
            <button
              className="w-full px-3 py-3 bg-amber-600 text-white rounded-xl text-sm font-bold disabled:opacity-60 sm:text-base"
              onClick={() => void handleRestart()}
              disabled={restarting || waitingForGuest}
            >
              {restarting ? '重新開始中...' : '重新開始'}
            </button>
            <button
              className="w-full px-3 py-3 bg-rose-600 text-white rounded-xl text-sm font-bold disabled:opacity-60 sm:text-base"
              onClick={() => void handleSurrender()}
              disabled={restarting || surrendering || !canSurrender}
            >
              {surrendering ? '投降中...' : '投降'}
            </button>
          </div>

          <div className="space-y-3">

            <div className="px-3 py-2.5 bg-white rounded-xl shadow-sm">
              <label className="block text-xs text-gray-500 mb-1">房號</label>
              <input
                className="w-full bg-transparent text-base font-bold text-amber-900 outline-none select-all"
                readOnly
                value={room.roomId}
                onFocus={(event) => event.currentTarget.select()}
                onClick={(event) => event.currentTarget.select()}
              />
            </div>
          </div>

          <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-1">
            <div className="bg-white rounded-xl px-3 py-2.5 shadow-sm">
              <p className="text-xs text-gray-500">你的身份</p>
              <p className="text-base font-bold text-amber-900">{getColorLabel(myColor)}</p>
            </div>
            <div className="bg-white rounded-xl px-3 py-2.5 shadow-sm">
              <p className="text-xs text-gray-500">房間狀態</p>
              <p className="text-base font-bold text-amber-900">
                {waitingForGuest ? (waitingForReconnect ? '等待對手返回' : '等待對手加入') : turnText}
              </p>
            </div>
            <div className="bg-white rounded-xl px-3 py-2.5 shadow-sm">
              <p className="text-xs text-gray-500">在線玩家</p>
              <p className="text-base font-bold text-amber-900">
                {getRoomPlayerCount(room)} / 2
              </p>
            </div>
            <div className="bg-white rounded-xl px-3 py-2.5 shadow-sm">
              <p className="text-xs text-gray-500">房主</p>
              <p className="text-sm font-bold text-amber-900">
                {getColorLabel(getPlayerColor(room, room.hostUid) as 'red' | 'black' | null)} · {getConnectionLabel(room.hostUid, presence)}
              </p>
            </div>
            <div className="bg-white rounded-xl px-3 py-2.5 shadow-sm">
              <p className="text-xs text-gray-500">對手</p>
              <p className="text-sm font-bold text-amber-900">
                {getColorLabel(room.guestUid ? (getPlayerColor(room, room.guestUid) as 'red' | 'black' | null) : null)} · {getConnectionLabel(room.guestUid, presence)}
              </p>
            </div>
          </div>

          <div className="space-y-2 text-center md:text-left">
            <span className="block px-3 py-2 bg-amber-100 rounded-xl text-sm text-amber-900">
              {room.message}
            </span>
            {error && (
              <div className="px-3 py-2 bg-red-50 border border-red-300 rounded-xl text-sm text-red-700">
                {error}
              </div>
            )}
          </div>
        </aside>

        <main className="flex min-h-0 flex-1 items-center justify-center overflow-hidden">
          <DarkBoard
            board={room.board}
            selectedCell={activeSelection}
            validMoves={validMoves}
            lastMove={room.lastMove}
            flipCue={flipRevealCueEnabled ? flipCue : null}
            flipCueDurationMs={FLIP_CUE_DURATION_MS}
            onCellClick={(pos) => void handleCellClick(pos)}
          />
        </main>
      </div>

      {(waitingForGuest || room.status === 'abandoned' || room.phase === 'gameOver') && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl shadow-2xl p-6 sm:p-8 max-w-sm w-full text-center space-y-4">
            <h2 className="text-2xl sm:text-3xl font-bold text-amber-900">
              {waitingForGuest
                ? waitingForReconnect
                  ? '等待對手返回'
                  : '等待對手加入'
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
                disabled={leaving}
              >
                {leaving ? '離開中...' : '離開遊戲'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OnlineDarkGame;
