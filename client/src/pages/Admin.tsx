import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  appCheckDebugTokenStorageKey,
  ensureAnonymousAuth,
  hasConfiguredAppCheckDebugToken,
  isAppCheckEnabled,
  isFirebaseConfigured,
} from '../firebase/app';
import {
  adminDeleteAllRooms,
  adminDeleteRoom,
  adminDeleteUser,
  isCurrentUserDatabaseAdmin,
  subscribeToAdminOverview,
} from '../online/service';
import type { AdminOverview } from '../online/types';

const emptyOverview: AdminOverview = {
  rooms: {},
  sessions: {},
};

function formatTime(value: number) {
  if (!value) {
    return '未知';
  }

  return new Date(value).toLocaleString();
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : '操作失敗，請確認 Firebase 規則與 App Check 設定。';
}

const Admin: React.FC = () => {
  const navigate = useNavigate();
  const [roomIdFilter, setRoomIdFilter] = useState('');
  const [userIdFilter, setUserIdFilter] = useState('');
  const [error, setError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const [currentUid, setCurrentUid] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [busyAction, setBusyAction] = useState('');
  const [overview, setOverview] = useState<AdminOverview>(emptyOverview);
  const debugTokenConfigured = hasConfiguredAppCheckDebugToken();

  useEffect(() => {
    let unsubscribe = () => {};
    let active = true;

    const start = async () => {
      if (!isFirebaseConfigured) {
        setIsLoading(false);
        return;
      }

      try {
        const user = await ensureAnonymousAuth();
        const admin = await isCurrentUserDatabaseAdmin();

        if (!active) {
          return;
        }

        setCurrentUid(user.uid);
        setIsAdmin(admin);
        setIsLoading(false);

        if (!admin) {
          setError(`目前 UID 尚未被授權為管理者，請在 Realtime Database 建立 admins/${user.uid} = true。`);
          return;
        }

        unsubscribe = subscribeToAdminOverview((nextOverview) => {
          if (active) {
            setOverview(nextOverview);
          }
        });
      } catch (caughtError) {
        if (active) {
          setIsLoading(false);
          setError(getErrorMessage(caughtError));
        }
      }
    };

    void start();

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const roomEntries = useMemo(
    () =>
      Object.values(overview.rooms)
        .filter((room) => !roomIdFilter || room.roomId.includes(roomIdFilter))
        .sort((left, right) => right.updatedAt - left.updatedAt),
    [overview.rooms, roomIdFilter],
  );

  const sessionEntries = useMemo(
    () =>
      Object.entries(overview.sessions)
        .filter(([uid]) => !userIdFilter || uid.includes(userIdFilter))
        .sort(([, left], [, right]) => right.lastSeen - left.lastSeen),
    [overview.sessions, userIdFilter],
  );

  const runAdminAction = async (label: string, action: () => Promise<void>) => {
    if (!isAdmin) {
      setError('目前 UID 尚未被授權為管理者，不能執行刪除。');
      return;
    }

    setError('');
    setActionMessage('');
    setBusyAction(label);

    try {
      await action();
      setActionMessage(`${label}完成。`);
    } catch (caughtError) {
      setError(getErrorMessage(caughtError));
    } finally {
      setBusyAction('');
    }
  };

  const handleDeleteRoom = (roomId: string) => {
    if (!window.confirm(`確定刪除房間 ${roomId}？`)) {
      return;
    }

    void runAdminAction(`刪除房間 ${roomId}`, () => adminDeleteRoom(roomId));
  };

  const handleDeleteUser = (uid: string) => {
    if (!window.confirm(`確定移除連線用戶 ${uid}？`)) {
      return;
    }

    void runAdminAction(`刪除用戶 ${uid}`, () => adminDeleteUser(uid));
  };

  const handleDeleteAllRooms = () => {
    const roomIds = Object.keys(overview.rooms);
    if (roomIds.length === 0) {
      setActionMessage('目前沒有房間需要刪除。');
      return;
    }

    if (!window.confirm(`確定刪除全部 ${roomIds.length} 個房間？`)) {
      return;
    }

    const roomIdSet = new Set(roomIds);
    const userIds = Object.entries(overview.sessions)
      .filter(([, session]) => roomIdSet.has(session.roomId))
      .map(([uid]) => uid);

    void runAdminAction('一鍵刪除所有房間', () => adminDeleteAllRooms(roomIds, userIds));
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-100 to-amber-100 p-4 sm:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="bg-white rounded-3xl shadow-2xl p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-amber-900">管理介面</h1>
              <p className="mt-2 text-base sm:text-lg text-amber-700">
                使用 App Check debug token 通過 App Check，並以 Realtime Database 的 admins UID 授權刪除。
              </p>
            </div>
            <button
              className="px-4 py-3 bg-gray-700 text-white rounded-2xl text-lg font-bold"
              onClick={() => navigate('/')}
            >
              返回主選單
            </button>
          </div>

          <div className="mt-6 grid gap-3 lg:grid-cols-4">
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs text-amber-700">Firebase</p>
              <p className={`text-lg font-bold ${isFirebaseConfigured ? 'text-emerald-700' : 'text-red-700'}`}>
                {isFirebaseConfigured ? '已設定' : '未設定'}
              </p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs text-amber-700">App Check</p>
              <p className={`text-lg font-bold ${isAppCheckEnabled ? 'text-emerald-700' : 'text-red-700'}`}>
                {isAppCheckEnabled ? '已啟用' : '未啟用'}
              </p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs text-amber-700">Debug Token</p>
              <p className={`text-lg font-bold ${debugTokenConfigured ? 'text-emerald-700' : 'text-red-700'}`}>
                {debugTokenConfigured ? '本機已設定' : '本機未設定'}
              </p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-xs text-amber-700">管理權限</p>
              <p className={`text-lg font-bold ${isAdmin ? 'text-emerald-700' : 'text-red-700'}`}>
                {isAdmin ? '已授權' : '未授權'}
              </p>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900 space-y-2">
            <p className="font-bold">設定提示</p>
            <p className="text-sm sm:text-base break-all">
              目前匿名 UID：{currentUid || (isLoading ? '讀取中...' : '尚未登入')}
            </p>
            <p className="text-sm sm:text-base">
              App Check debug token 不在本頁輸入。請在這台管理用瀏覽器設定 localStorage key：
              <span className="font-mono"> {appCheckDebugTokenStorageKey}</span>，然後重新整理頁面。
            </p>
            <p className="text-sm sm:text-base">
              刪除權限請在 Realtime Database 新增
              <span className="font-mono"> admins/{currentUid || '{你的UID}'} = true</span>。
            </p>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-[1fr_1fr_auto]">
            <input
              className="rounded-2xl border border-amber-200 px-4 py-3 text-lg uppercase focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="篩選房號"
              value={roomIdFilter}
              onChange={(event) => setRoomIdFilter(event.target.value.toUpperCase())}
            />
            <input
              className="rounded-2xl border border-amber-200 px-4 py-3 text-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              placeholder="篩選 Firebase UID"
              value={userIdFilter}
              onChange={(event) => setUserIdFilter(event.target.value)}
            />
            <button
              className="rounded-2xl bg-red-700 px-5 py-3 text-lg font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
              onClick={handleDeleteAllRooms}
              disabled={!isAdmin || busyAction !== ''}
            >
              {busyAction === '一鍵刪除所有房間' ? '刪除中...' : '一鍵刪除所有房間'}
            </button>
          </div>

          {!isFirebaseConfigured && (
            <div className="mt-4 rounded-2xl border border-red-300 bg-red-50 p-4 text-red-800">
              目前尚未設定 Firebase 環境變數，管理介面無法連線。
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-2xl border border-red-300 bg-red-50 p-4 text-red-800">
              {error}
            </div>
          )}

          {actionMessage && (
            <div className="mt-4 rounded-2xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-800">
              {actionMessage}
            </div>
          )}
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <section className="bg-white rounded-3xl shadow-xl p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-2xl font-bold text-amber-900">目前房間</h2>
              <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-amber-900">
                {roomEntries.length} 間
              </span>
            </div>
            <div className="space-y-3">
              {roomEntries.length === 0 && (
                <p className="text-gray-500">目前沒有符合條件的房間。</p>
              )}
              {roomEntries.map((room) => (
                <div
                  key={room.roomId}
                  className="rounded-2xl border border-amber-200 bg-amber-50 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-lg font-bold text-amber-900">房號 {room.roomId}</p>
                    <button
                      className="rounded-xl bg-red-700 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => handleDeleteRoom(room.roomId)}
                      disabled={!isAdmin || busyAction !== ''}
                    >
                      刪除房間
                    </button>
                  </div>
                  <div className="mt-3 grid gap-1 text-sm text-gray-700">
                    <p>模式: {room.variant === 'bright' ? '明棋' : '暗棋'} · 狀態: {room.status}</p>
                    <p>階段: {room.phase} · 回合: {room.currentPlayer === 'red' ? '紅方' : '黑方'}</p>
                    <p>房主: {room.hostUid}</p>
                    <p>客方: {room.guestUid ?? '尚未加入'}</p>
                    <p>目前行動 UID: {room.activePlayerUid ?? '無'}</p>
                    <p>勝方: {room.winner ?? '尚未結束'}</p>
                    <p>訊息: {room.message}</p>
                    <p>建立時間: {formatTime(room.createdAt)}</p>
                    <p>更新時間: {formatTime(room.updatedAt)}</p>
                    <p className="text-xs text-gray-500 break-all">路徑: rooms/{room.roomId}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white rounded-3xl shadow-xl p-6">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-2xl font-bold text-amber-900">目前連線用戶</h2>
              <span className="rounded-full bg-stone-100 px-3 py-1 text-sm font-bold text-stone-700">
                {sessionEntries.length} 人
              </span>
            </div>
            <div className="space-y-3">
              {sessionEntries.length === 0 && (
                <p className="text-gray-500">目前沒有符合條件的連線用戶。</p>
              )}
              {sessionEntries.map(([uid, session]) => (
                <div
                  key={uid}
                  className="rounded-2xl border border-amber-200 bg-stone-50 p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm break-all font-bold text-gray-800">{uid}</p>
                    <button
                      className="rounded-xl bg-red-700 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                      onClick={() => handleDeleteUser(uid)}
                      disabled={!isAdmin || busyAction !== ''}
                    >
                      刪除用戶
                    </button>
                  </div>
                  <p className="mt-2 text-sm text-gray-700">
                    房號: {session.roomId} · 模式: {session.variant === 'bright' ? '明棋' : '暗棋'}
                  </p>
                  <p className="text-sm text-gray-700">
                    狀態: {session.connected ? '連線中' : '離線'} · 最後活動: {formatTime(session.lastSeen)}
                  </p>
                  <p className="mt-2 text-xs text-gray-500 break-all">
                    路徑: userSessions/{uid}
                  </p>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default Admin;
