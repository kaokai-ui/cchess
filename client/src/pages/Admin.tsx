import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ensureAnonymousAuth, isFirebaseConfigured } from '../firebase/app';
import { subscribeToAdminOverview } from '../online/service';
import type { AdminOverview } from '../online/types';

const emptyOverview: AdminOverview = {
  rooms: {},
  sessions: {},
};

const Admin: React.FC = () => {
  const navigate = useNavigate();
  const [roomIdFilter, setRoomIdFilter] = useState('');
  const [userIdFilter, setUserIdFilter] = useState('');
  const [error, setError] = useState('');
  const [overview, setOverview] = useState<AdminOverview>(emptyOverview);

  useEffect(() => {
    let unsubscribe = () => {};
    let active = true;

    const start = async () => {
      if (!isFirebaseConfigured) {
        return;
      }

      try {
        await ensureAnonymousAuth();
        unsubscribe = subscribeToAdminOverview((nextOverview) => {
          if (active) {
            setOverview(nextOverview);
          }
        });
      } catch {
        if (active) {
          setError('管理資料載入失敗，請先確認 Firebase 設定。');
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

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-100 to-amber-100 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="bg-white rounded-3xl shadow-2xl p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-amber-900">監看介面</h1>
              <p className="mt-2 text-base sm:text-lg text-amber-700">
                Spark 免費方案下保留即時監看；刪除房間與移除用戶改由 Firebase Console 手動處理。
              </p>
            </div>
            <button
              className="px-4 py-3 bg-gray-700 text-white rounded-2xl text-lg font-bold"
              onClick={() => navigate('/')}
            >
              返回主選單
            </button>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
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
          </div>

          <div className="mt-4 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-amber-900 space-y-2">
            <p className="font-bold">Spark 方案限制</p>
            <p className="text-sm sm:text-base">
              專案已移除需要 Blaze 的 Callable Functions。沒有受信任後端時，無法安全驗證前端輸入的管理 token，所以不再提供網頁端直接刪除。
            </p>
            <p className="text-sm sm:text-base">
              若需清除資料，請到 Firebase Console 的 Realtime Database 手動刪除 `rooms/{'{roomId}'}`、`roomPresence/{'{roomId}'}`、`userSessions/{'{uid}'}`。
            </p>
          </div>

          {!isFirebaseConfigured && (
            <div className="mt-4 rounded-2xl border border-red-300 bg-red-50 p-4 text-red-800">
              目前尚未設定 Firebase 環境變數，監看介面無法連線。
            </div>
          )}

          {error && (
            <div className="mt-4 rounded-2xl border border-red-300 bg-red-50 p-4 text-red-800">
              {error}
            </div>
          )}
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <section className="bg-white rounded-3xl shadow-xl p-6">
            <h2 className="text-2xl font-bold text-amber-900 mb-4">目前房間</h2>
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
                    <p className="text-sm text-amber-700">
                      {room.variant === 'bright' ? '明棋' : '暗棋'} · {room.status}
                    </p>
                  </div>
                  <p className="mt-2 text-sm text-gray-700">房主: {room.hostUid}</p>
                  <p className="text-sm text-gray-700">客方: {room.guestUid ?? '尚未加入'}</p>
                  <p className="text-sm text-gray-700">訊息: {room.message}</p>
                  <p className="mt-2 text-xs text-gray-500 break-all">
                    Console 路徑: rooms/{room.roomId}
                  </p>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white rounded-3xl shadow-xl p-6">
            <h2 className="text-2xl font-bold text-amber-900 mb-4">目前連線用戶</h2>
            <div className="space-y-3">
              {sessionEntries.length === 0 && (
                <p className="text-gray-500">目前沒有符合條件的連線用戶。</p>
              )}
              {sessionEntries.map(([uid, session]) => (
                <div
                  key={uid}
                  className="rounded-2xl border border-amber-200 bg-stone-50 p-4"
                >
                  <p className="text-sm break-all text-gray-800">{uid}</p>
                  <p className="mt-2 text-sm text-gray-700">
                    房號: {session.roomId} · 模式: {session.variant === 'bright' ? '明棋' : '暗棋'}
                  </p>
                  <p className="text-sm text-gray-700">
                    狀態: {session.connected ? '連線中' : '離線'}
                  </p>
                  <p className="mt-2 text-xs text-gray-500 break-all">
                    Console 路徑: userSessions/{uid}
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
