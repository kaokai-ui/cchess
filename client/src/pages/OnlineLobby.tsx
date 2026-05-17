import React, { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ensureAnonymousAuth, isFirebaseConfigured } from '../firebase/app';
import {
  clearRecentOnlineRoomSession,
  createOnlineRoom,
  getRecentOnlineRoomSession,
  joinOnlineRoom,
  reconnectOnlineRoom,
} from '../online/service';
import type { GameVariant, RecentOnlineRoomSession } from '../online/types';
import { useSettingsStore } from '../stores/settingsStore';

function normalizeVariant(value: string | null): GameVariant {
  if (value === 'bright' || value === 'dark' || value === 'gomoku') {
    return value;
  }

  return 'dark';
}

function getVariantLabel(variant: GameVariant) {
  if (variant === 'bright') {
    return '明棋';
  }

  if (variant === 'gomoku') {
    return '五子棋';
  }

  return '暗棋';
}

const OnlineLobby: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const variant = normalizeVariant(searchParams.get('variant'));
  const [roomCode, setRoomCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [recentSession, setRecentSession] = useState<RecentOnlineRoomSession | null>(
    () => getRecentOnlineRoomSession(),
  );
  const { darkChess } = useSettingsStore();

  const settingsSummary = useMemo(() => {
    if (variant !== 'dark') {
      return null;
    }

    return [
      `車吃子：${darkChess.rookCaptureRange === 'adjacent' ? '僅相鄰' : '直線全範圍'}`,
      `砲吃子：${darkChess.cannonCaptureRule === 'needJump' ? '需翻山' : '可直接吃'}`,
      `兵吃帥：${darkChess.soldierKillGeneral ? '允許' : '不允許'}`,
    ];
  }, [darkChess, variant]);

  const gamePath = (roomId: string, targetVariant: GameVariant = variant) => {
    if (targetVariant === 'bright') {
      return `/online/game/bright/${roomId}`;
    }

    if (targetVariant === 'gomoku') {
      return `/online/game/gomoku/${roomId}`;
    }

    return `/online/game/dark/${roomId}`;
  };

  const handleCreateRoom = async () => {
    try {
      setBusy(true);
      setError('');
      await ensureAnonymousAuth();
      const roomId = await createOnlineRoom(
        variant,
        variant === 'dark' ? darkChess : null,
      );
      navigate(gamePath(roomId));
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : '建立房間失敗，請稍後再試。',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleJoinRoom = async () => {
    try {
      setBusy(true);
      setError('');
      await ensureAnonymousAuth();
      const roomId = await joinOnlineRoom(roomCode);
      navigate(gamePath(roomId));
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : '加入房間失敗，請稍後再試。',
      );
    } finally {
      setBusy(false);
    }
  };

  const handleResumeRoom = async () => {
    if (!recentSession) {
      return;
    }

    try {
      setBusy(true);
      setError('');
      const reconnectResult = await reconnectOnlineRoom(recentSession.roomId);

      if (!reconnectResult.room) {
        clearRecentOnlineRoomSession(recentSession.roomId);
        setRecentSession(null);
        throw new Error('找不到先前房間，可能已被刪除。');
      }

      if (!reconnectResult.isMember) {
        throw new Error('你不是這個房間的玩家，無法直接返回。');
      }

      navigate(gamePath(reconnectResult.room.roomId, reconnectResult.room.variant));
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : '無法回到先前房間。',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#fff3d4_0%,#f6deab_40%,#e9c688_100%)] p-4">
      <div className="w-full max-w-xl space-y-6 rounded-[2rem] border border-amber-200/60 bg-white/92 p-6 shadow-2xl sm:p-8 md:p-10">
        <div className="text-center">
          <h1 className="text-3xl font-black text-amber-950 sm:text-4xl">
            連線對戰大廳
          </h1>
          <p className="mt-2 text-lg font-semibold text-amber-700 sm:text-xl">
            {getVariantLabel(variant)}
          </p>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {(['bright', 'dark', 'gomoku'] as GameVariant[]).map((candidate) => (
            <button
              key={candidate}
              className={`rounded-2xl px-4 py-3 text-lg font-black transition-all ${
                variant === candidate
                  ? 'bg-amber-700 text-white shadow-lg'
                  : 'bg-amber-100 text-amber-900 hover:bg-amber-200'
              }`}
              onClick={() => setSearchParams({ variant: candidate })}
            >
              {getVariantLabel(candidate)}
            </button>
          ))}
        </div>

        {variant === 'dark' && settingsSummary && (
          <div className="rounded-3xl border border-amber-200 bg-amber-50 p-4">
            <h2 className="mb-2 text-lg font-black text-amber-900">本局暗棋規則</h2>
            <div className="space-y-1 text-sm text-amber-800 sm:text-base">
              {settingsSummary.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>
        )}

        {variant === 'gomoku' && (
          <div className="rounded-3xl border border-sky-200 bg-sky-50 p-4 text-sm leading-7 text-sky-900 sm:text-base">
            五子棋連線採用獨立房間與落子同步流程。
            <br />
            黑子先手，兩位玩家會分別固定為黑子與白子。
          </div>
        )}

        {!isFirebaseConfigured && (
          <div className="rounded-3xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 sm:text-base">
            Firebase 尚未設定完成，請先補齊 `client/.env` 後再使用連線模式。
          </div>
        )}

        {recentSession && (
          <div className="space-y-3 rounded-3xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-base font-black text-emerald-900 sm:text-lg">
              最近房間：{getVariantLabel(recentSession.variant)} / {recentSession.roomId}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                className="rounded-2xl bg-emerald-600 px-4 py-3 text-lg font-black text-white transition-all hover:bg-emerald-700 disabled:opacity-50"
                onClick={handleResumeRoom}
                disabled={busy || !isFirebaseConfigured}
              >
                回到房間
              </button>
              <button
                className="rounded-2xl bg-white px-4 py-3 text-lg font-black text-emerald-900 transition-all hover:bg-emerald-100"
                onClick={() => {
                  clearRecentOnlineRoomSession(recentSession.roomId);
                  setRecentSession(null);
                }}
              >
                清除紀錄
              </button>
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <button
            className="rounded-2xl bg-green-600 px-5 py-4 text-xl font-black text-white shadow-lg transition-all hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
            onClick={handleCreateRoom}
            disabled={busy || !isFirebaseConfigured}
          >
            建立房間
          </button>

          <div className="space-y-3">
            <input
              className="w-full rounded-2xl border border-amber-200 px-4 py-3 text-center text-lg uppercase tracking-[0.3em] text-amber-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="輸入房號"
              value={roomCode}
              maxLength={6}
              onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
            />
            <button
              className="w-full rounded-2xl bg-blue-600 px-5 py-4 text-xl font-black text-white shadow-lg transition-all hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
              onClick={handleJoinRoom}
              disabled={busy || !roomCode.trim() || !isFirebaseConfigured}
            >
              加入房間
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-3xl border border-red-300 bg-red-50 p-4 text-sm text-red-800 sm:text-base">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            className="flex-1 rounded-2xl bg-amber-100 py-3 text-lg font-black text-amber-900 transition-all hover:bg-amber-200"
            onClick={() => navigate('/settings')}
          >
            設定
          </button>
          <button
            className="flex-1 rounded-2xl bg-stone-700 py-3 text-lg font-black text-white transition-all hover:bg-stone-800"
            onClick={() => navigate('/')}
          >
            返回選單
          </button>
        </div>
      </div>
    </div>
  );
};

export default OnlineLobby;
