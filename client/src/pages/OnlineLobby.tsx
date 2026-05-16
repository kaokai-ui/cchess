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

function getVariantLabel(variant: GameVariant) {
  return variant === 'bright' ? '明棋' : '暗棋';
}

const OnlineLobby: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const variant = (searchParams.get('variant') === 'bright' ? 'bright' : 'dark') as GameVariant;
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
      `車吃子: ${darkChess.rookCaptureRange === 'adjacent' ? '僅相鄰' : '直線全範圍'}`,
      `砲吃子: ${darkChess.cannonCaptureRule === 'needJump' ? '需翻山' : '可直接吃'}`,
      `兵吃將: ${darkChess.soldierKillGeneral ? '允許' : '不允許'}`,
    ];
  }, [darkChess, variant]);

  const gamePath = (roomId: string, targetVariant: GameVariant = variant) =>
    targetVariant === 'bright'
      ? `/online/game/bright/${roomId}`
      : `/online/game/dark/${roomId}`;

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
        throw new Error('上次的連線牌局已不存在。');
      }

      if (!reconnectResult.isMember) {
        throw new Error('這台裝置目前無法取回這局的玩家身份。');
      }

      navigate(gamePath(reconnectResult.room.roomId, reconnectResult.room.variant));
    } catch (caughtError) {
      setError(
        caughtError instanceof Error ? caughtError.message : '回到上次牌局時發生錯誤。',
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-amber-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-6 sm:p-8 md:p-10 max-w-xl w-full space-y-6">
        <div className="text-center">
          <h1 className="text-3xl sm:text-4xl font-bold text-amber-900">
            雙人連線大廳
          </h1>
          <p className="mt-2 text-lg sm:text-xl text-amber-700">
            {getVariantLabel(variant)}模式
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <button
            className={`py-3 px-4 rounded-xl text-lg font-bold transition-all ${
              variant === 'bright'
                ? 'bg-amber-600 text-white shadow-lg'
                : 'bg-amber-100 text-amber-900 hover:bg-amber-200'
            }`}
            onClick={() => setSearchParams({ variant: 'bright' })}
          >
            明棋
          </button>
          <button
            className={`py-3 px-4 rounded-xl text-lg font-bold transition-all ${
              variant === 'dark'
                ? 'bg-amber-600 text-white shadow-lg'
                : 'bg-amber-100 text-amber-900 hover:bg-amber-200'
            }`}
            onClick={() => setSearchParams({ variant: 'dark' })}
          >
            暗棋
          </button>
        </div>

        {variant === 'dark' && settingsSummary && (
          <div className="rounded-2xl bg-amber-50 border border-amber-200 p-4">
            <h2 className="text-lg font-bold text-amber-900 mb-2">本局暗棋設定</h2>
            <div className="space-y-1 text-sm sm:text-base text-amber-800">
              {settingsSummary.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>
        )}

        {!isFirebaseConfigured && (
          <div className="rounded-2xl border border-red-300 bg-red-50 p-4 text-red-800 text-sm sm:text-base">
            尚未設定 Firebase 環境變數，請先完成 `client/.env` 設定後再使用連線模式。
          </div>
        )}

        {recentSession && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 space-y-3">
            <p className="text-base sm:text-lg font-bold text-emerald-900">
              上次牌局：{getVariantLabel(recentSession.variant)} {recentSession.roomId}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <button
                className="py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-lg font-bold rounded-2xl transition-all disabled:opacity-50"
                onClick={handleResumeRoom}
                disabled={busy || !isFirebaseConfigured}
              >
                回到上次牌局
              </button>
              <button
                className="py-3 px-4 bg-white hover:bg-emerald-100 text-emerald-900 text-lg font-bold rounded-2xl transition-all"
                onClick={() => {
                  clearRecentOnlineRoomSession(recentSession.roomId);
                  setRecentSession(null);
                }}
              >
                清除記錄
              </button>
            </div>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <button
            className="py-4 px-5 bg-green-600 hover:bg-green-700 text-white text-xl font-bold rounded-2xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleCreateRoom}
            disabled={busy || !isFirebaseConfigured}
          >
            建立房間
          </button>

          <div className="space-y-3">
            <input
              className="w-full rounded-2xl border border-amber-200 px-4 py-3 text-lg uppercase tracking-[0.3em] text-center focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="輸入房號"
              value={roomCode}
              maxLength={6}
              onChange={(event) => setRoomCode(event.target.value.toUpperCase())}
            />
            <button
              className="w-full py-4 px-5 bg-blue-600 hover:bg-blue-700 text-white text-xl font-bold rounded-2xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={handleJoinRoom}
              disabled={busy || !roomCode.trim() || !isFirebaseConfigured}
            >
              加入房間
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-red-300 bg-red-50 p-4 text-red-800 text-sm sm:text-base">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            className="flex-1 py-3 bg-amber-100 hover:bg-amber-200 text-amber-900 text-lg font-bold rounded-2xl transition-all"
            onClick={() => navigate('/settings')}
          >
            遊戲設定
          </button>
          <button
            className="flex-1 py-3 bg-gray-600 hover:bg-gray-700 text-white text-lg font-bold rounded-2xl transition-all"
            onClick={() => navigate('/')}
          >
            返回主選單
          </button>
        </div>
      </div>
    </div>
  );
};

export default OnlineLobby;
