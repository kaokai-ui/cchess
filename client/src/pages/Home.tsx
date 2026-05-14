import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ensureAnonymousAuth,
  getFirebaseAuth,
  getFirebaseDatabase,
  isAppCheckEnabled,
  isFirebaseConfigured,
} from '../firebase/app';
import type { AIDifficulty } from '../stores/darkGameStore';

const Home: React.FC = () => {
  const navigate = useNavigate();
  const [playMode, setPlayMode] = useState<'solo' | 'online'>('solo');
  const [gameMode, setGameMode] = useState<'bright' | 'dark'>('dark');
  const [difficulty, setDifficulty] = useState<AIDifficulty>('hard');
  const [anonymousReady, setAnonymousReady] = useState(false);

  const firebaseReady =
    isFirebaseConfigured &&
    getFirebaseAuth() !== null &&
    getFirebaseDatabase() !== null;
  const multiplayerReady = firebaseReady && anonymousReady;

  useEffect(() => {
    let cancelled = false;

    if (!isFirebaseConfigured) {
      return () => {
        cancelled = true;
      };
    }

    void ensureAnonymousAuth()
      .then(() => {
        if (!cancelled) {
          setAnonymousReady(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setAnonymousReady(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleStart = () => {
    if (playMode === 'online') {
      navigate(`/online/lobby?variant=${gameMode}`);
      return;
    }

    navigate(gameMode === 'dark' ? '/game/dark' : '/game/bright', {
      state: { difficulty },
    });
  };

  const statusClass = (enabled: boolean) =>
    enabled ? 'text-emerald-600' : 'text-red-600';

  return (
    <div className="min-h-screen bg-gradient-to-b from-amber-50 to-amber-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 md:p-10 max-w-md w-full">
        <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-center text-amber-900 mb-2">
          中國象棋
        </h1>
        <h2 className="text-xl sm:text-2xl text-center text-amber-700 mb-8">
          {playMode === 'solo' ? '單機模式' : '雙人連線模式'}
        </h2>

        <div className="space-y-6">
          <div>
            <label className="block text-lg font-semibold text-gray-700 mb-3">
              遊玩方式
            </label>
            <div className="grid grid-cols-2 gap-4">
              <button
                className={`py-4 px-6 rounded-xl text-xl font-bold transition-all ${
                  playMode === 'solo'
                    ? 'bg-amber-600 text-white shadow-lg scale-105'
                    : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                }`}
                onClick={() => setPlayMode('solo')}
              >
                單機
              </button>
              <button
                className={`py-4 px-6 rounded-xl text-xl font-bold transition-all ${
                  playMode === 'online'
                    ? 'bg-amber-600 text-white shadow-lg scale-105'
                    : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                }`}
                onClick={() => setPlayMode('online')}
              >
                連線對戰
              </button>
            </div>
          </div>

          <div>
            <label className="block text-lg font-semibold text-gray-700 mb-3">
              棋種模式
            </label>
            <div className="grid grid-cols-2 gap-4">
              <button
                className={`py-4 px-6 rounded-xl text-xl font-bold transition-all ${
                  gameMode === 'bright'
                    ? 'bg-amber-600 text-white shadow-lg scale-105'
                    : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                }`}
                onClick={() => setGameMode('bright')}
              >
                明棋
              </button>
              <button
                className={`py-4 px-6 rounded-xl text-xl font-bold transition-all ${
                  gameMode === 'dark'
                    ? 'bg-amber-600 text-white shadow-lg scale-105'
                    : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                }`}
                onClick={() => setGameMode('dark')}
              >
                暗棋
              </button>
            </div>
          </div>

          {playMode === 'solo' && (
            <div>
              <label className="block text-lg font-semibold text-gray-700 mb-3">
                AI 難度
              </label>
              <div className="grid grid-cols-2 gap-3">
                {([
                  ['easy', '簡單'],
                  ['normal', '普通'],
                  ['hard', '困難'],
                  ['master', '棋聖'],
                ] as [AIDifficulty, string][]).map(([key, label]) => (
                  <button
                    key={key}
                    className={`py-3 px-4 rounded-lg text-lg font-semibold transition-all ${
                      difficulty === key
                        ? 'bg-amber-600 text-white shadow-md'
                        : 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                    }`}
                    onClick={() => setDifficulty(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button
            className="w-full py-4 bg-green-600 hover:bg-green-700 text-white text-2xl font-bold rounded-xl shadow-lg transition-all hover:scale-105 active:scale-95"
            onClick={handleStart}
          >
            {playMode === 'solo' ? '開始遊戲' : '進入連線大廳'}
          </button>

          <button
            className="w-full py-3 bg-gray-600 hover:bg-gray-700 text-white text-lg font-bold rounded-xl transition-all hover:scale-105"
            onClick={() => navigate('/settings')}
          >
            遊戲設定
          </button>

          <div className="rounded-xl border border-stone-200 bg-stone-50 px-4 py-4 text-base sm:text-lg leading-8">
            <p className={`font-bold ${statusClass(firebaseReady)}`}>
              {firebaseReady ? 'Firebase 已連線' : 'Firebase 未連線'}
            </p>
            <p className={`font-semibold ${statusClass(multiplayerReady)}`}>
              {multiplayerReady
                ? '已啟用匿名登入與房間即時同步。'
                : '匿名登入或房間即時同步未啟用。'}
            </p>
            <p className={`font-semibold ${statusClass(anonymousReady)}`}>
              匿名登入：{anonymousReady ? '已就緒' : '未啟用'}
            </p>
            <p className={`font-semibold ${statusClass(isAppCheckEnabled)}`}>
              App Check：{isAppCheckEnabled ? '已啟用' : '未啟用'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
