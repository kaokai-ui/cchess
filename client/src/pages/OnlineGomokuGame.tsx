import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import GomokuBoard from '../components/GomokuBoard';
import {
  getPlayerColor,
  isPlayerTurn,
  leaveOnlineRoom,
  reconnectOnlineRoom,
  restartOnlineRoom,
  submitGomokuMove,
  subscribeToOnlineRoom,
} from '../online/service';
import type { GomokuOnlineRoom, PresenceSnapshot } from '../online/types';
import { isGomokuOnlineRoom } from '../online/types';
import type { GomokuStone } from '../shared/gomoku/types';
import type { Position } from '../shared/types';

function getStoneLabel(stone: GomokuStone | null) {
  if (stone === 'black') {
    return '黑子';
  }

  if (stone === 'white') {
    return '白子';
  }

  return '未分配';
}

function getConnectionLabel(
  uid: string | null,
  presence: Record<string, PresenceSnapshot>,
) {
  if (!uid) {
    return '等待加入';
  }

  return presence[uid]?.connected ? '已連線' : '離線';
}

function getRelativeOpeningMessage(room: GomokuOnlineRoom, myUid: string) {
  if (!room.activePlayerUid) {
    return room.message;
  }

  if (room.activePlayerUid === myUid) {
    return '你先手';
  }

  return room.activePlayerUid === room.hostUid ? '屋主先手' : '對家先手';
}

const OnlineGomokuGame: React.FC = () => {
  const navigate = useNavigate();
  const { roomId = '' } = useParams();
  const [room, setRoom] = useState<GomokuOnlineRoom | null>(null);
  const [presence, setPresence] = useState<Record<string, PresenceSnapshot>>({});
  const [myUid, setMyUid] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);
  const [restarting, setRestarting] = useState(false);

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

          setRoom(isGomokuOnlineRoom(snapshot.room) ? snapshot.room : null);
          setPresence(snapshot.presence);
          setBusy(false);
        });
      } catch (caughtError) {
        if (!active) {
          return;
        }

        setBusy(false);
        setError(
          caughtError instanceof Error ? caughtError.message : '無法進入房間。',
        );
      }
    };

    void start();

    return () => {
      active = false;
      unsubscribe();
    };
  }, [roomId]);

  const myStone = room ? (getPlayerColor(room, myUid) as GomokuStone | null) : null;
  const waitingForGuest = room?.status === 'waiting';
  const currentPlayerLabel = room ? getStoneLabel(room.currentPlayer) : '';
  const canPlay = Boolean(room && isPlayerTurn(room, myUid) && room.phase === 'playing');
  const lastMove = room?.lastMove?.to ?? null;

  const statusMessage = useMemo(() => {
    if (!room) {
      return '';
    }

    if (waitingForGuest) {
      return '等待對手加入';
    }

    if (room.phase === 'playing' && room.lastMove === null) {
      return getRelativeOpeningMessage(room, myUid);
    }

    if (room.phase === 'playing') {
      return canPlay ? '輪到你落子' : '輪到對家落子';
    }

    return room.message;
  }, [canPlay, myUid, room, waitingForGuest]);

  const handleLeave = async () => {
    if (room) {
      await leaveOnlineRoom(room.roomId);
    }

    navigate('/');
  };

  const handleCellClick = async (pos: Position) => {
    if (!room || !canPlay) {
      return;
    }

    try {
      setError('');
      await submitGomokuMove(room.roomId, pos);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : '落子失敗，請稍後再試。',
      );
    }
  };

  const handleRestart = async () => {
    if (!room) {
      return;
    }

    try {
      setRestarting(true);
      setError('');
      await restartOnlineRoom(room.roomId);
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : '重新開始失敗，請稍後再試。',
      );
    } finally {
      setRestarting(false);
    }
  };

  if (busy) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-amber-50 text-xl text-amber-900">
        正在連線房間…
      </div>
    );
  }

  if (!room) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-amber-50 p-4">
        <div className="w-full max-w-md space-y-4 rounded-3xl bg-white p-8 text-center shadow-xl">
          <p className="text-xl text-red-700">找不到五子棋房間，或房間資料已失效。</p>
          <button
            className="w-full rounded-2xl bg-gray-700 py-3 text-lg font-black text-white"
            onClick={() => navigate('/online/lobby?variant=gomoku')}
          >
            返回連線大廳
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col overflow-hidden bg-[radial-gradient(circle_at_top,#fff4d5_0%,#f3d79a_42%,#e6bf7b_100%)]">
      <div className="flex-shrink-0 px-3 py-2 sm:px-5 sm:py-3">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <button
              className="rounded-xl bg-stone-700 px-4 py-2 text-base font-bold text-white transition-colors hover:bg-stone-800 sm:text-lg"
              onClick={() => void handleLeave()}
            >
              返回
            </button>

            <div className="flex gap-2">
              <button
                className="rounded-xl bg-amber-700 px-4 py-2 text-base font-bold text-white transition-colors hover:bg-amber-800 sm:text-lg"
                onClick={() => void handleRestart()}
                disabled={restarting || waitingForGuest}
              >
                {restarting ? '重開中…' : '重新開始'}
              </button>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_260px]">
            <div className="rounded-3xl border border-amber-200/70 bg-white/75 px-4 py-3 shadow-lg backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h1 className="text-xl font-black tracking-[0.08em] text-stone-900 sm:text-2xl">
                    五子棋連線
                  </h1>
                  <p className="mt-1 text-sm font-semibold text-stone-600 sm:text-base">
                    你執 {getStoneLabel(myStone)}，房號 {room.roomId}
                  </p>
                </div>

                <div className="rounded-2xl bg-amber-100 px-4 py-2 text-right shadow-inner">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-800 sm:text-sm">
                    Connection
                  </p>
                  <p className="text-sm font-black text-amber-950 sm:text-base">
                    對手 {getConnectionLabel(room.guestUid === myUid ? room.hostUid : room.guestUid, presence)}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-stone-200 bg-white/80 px-4 py-3 shadow-lg backdrop-blur">
              <p className="text-xl font-black text-stone-900">
                {waitingForGuest ? '等待對手加入' : `目前輪到${currentPlayerLabel}`}
              </p>
              <p className="mt-2 text-base font-semibold leading-7 text-stone-700">
                {statusMessage}
              </p>
            </div>
          </div>

          {error && (
            <div className="rounded-2xl border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 sm:text-base">
              {error}
            </div>
          )}
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-3 pb-3 sm:px-5 sm:pb-4">
        <GomokuBoard
          board={room.board}
          lastMove={lastMove}
          disabled={!canPlay}
          onCellClick={(pos) => void handleCellClick(pos)}
        />
      </div>

      {(waitingForGuest || room.status === 'abandoned' || room.phase === 'gameOver') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-sm rounded-[2rem] bg-white p-7 text-center shadow-2xl">
            <h2 className="text-3xl font-black text-stone-900 sm:text-4xl">
              {waitingForGuest
                ? '等待對手加入'
                : room.status === 'abandoned'
                ? '對手已離開'
                : room.winner === myStone
                ? '你贏了！'
                : room.winner
                ? '你輸了'
                : '平手'}
            </h2>
            <p className="mt-4 text-base leading-7 text-stone-600 sm:text-lg">
              {statusMessage}
            </p>

            <div className="mt-6 space-y-3">
              {room.phase === 'gameOver' && room.status === 'finished' && (
                <button
                  className="w-full rounded-2xl bg-emerald-600 py-3 text-xl font-black text-white transition-transform hover:scale-[1.02] hover:bg-emerald-700 disabled:opacity-60"
                  onClick={() => void handleRestart()}
                  disabled={restarting}
                >
                  {restarting ? '重新開始中…' : '再玩一局'}
                </button>
              )}
              <button
                className="w-full rounded-2xl bg-stone-700 py-3 text-xl font-black text-white transition-transform hover:scale-[1.02] hover:bg-stone-800"
                onClick={() => void handleLeave()}
              >
                返回選單
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default OnlineGomokuGame;
