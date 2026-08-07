import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ensureAnonymousAuth,
  getFirebaseAuth,
  getFirebaseDatabase,
  isAppCheckEnabled,
  isFirebaseConfigured,
} from '../firebase/app';
import type { GomokuAIDifficulty } from '../shared/gomoku/ai';
import { getDisplayAppVersion } from '../utils/appVersion';

type PlayMode = 'solo' | 'online';
type GameMode = 'bright' | 'dark' | 'gomoku';

const difficultyOptions: [GomokuAIDifficulty, string][] = [
  ['easy', '簡單'],
  ['normal', '普通'],
  ['hard', '困難'],
  ['master', '棋聖'],
  ['god', '棋神'],
  ['tianyuan', '天元'],
  ['wuji', '無極'],
];

// The two deep levels only exist for gomoku; bright / dark chess keep their own
// four-level ladder, so the picker hides them outside 五子棋.
const gomokuOnlyDifficulties: GomokuAIDifficulty[] = ['god', 'tianyuan', 'wuji'];

const gameModeLabels: Record<GameMode, string> = {
  bright: '明棋',
  dark: '暗棋',
  gomoku: '五子棋',
};

const Home: React.FC = () => {
  const navigate = useNavigate();
  const appVersion = getDisplayAppVersion();
  const [playMode, setPlayMode] = useState<PlayMode>('solo');
  const [gameMode, setGameMode] = useState<GameMode>('dark');
  const [difficulty, setDifficulty] = useState<GomokuAIDifficulty>('hard');
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

  const availableDifficulties = useMemo(
    () =>
      difficultyOptions.filter(
        ([key]) => gameMode === 'gomoku' || !gomokuOnlyDifficulties.includes(key),
      ),
    [gameMode],
  );

  // Switching to 明棋 / 暗棋 must not carry a gomoku-only level into their AI.
  // Derived rather than reset, so the choice comes back on returning to 五子棋.
  const effectiveDifficulty: GomokuAIDifficulty =
    gameMode === 'gomoku' || !gomokuOnlyDifficulties.includes(difficulty)
      ? difficulty
      : 'master';

  const statusClass = (enabled: boolean) =>
    enabled ? 'text-emerald-700' : 'text-rose-700';

  const startLabel = useMemo(() => {
    return playMode === 'solo' ? '開始單機遊戲' : '前往連線大廳';
  }, [playMode]);

  const handleStart = () => {
    if (playMode === 'online') {
      navigate(`/online/lobby?variant=${gameMode}`);
      return;
    }

    const routeByMode: Record<GameMode, string> = {
      bright: '/game/bright',
      dark: '/game/dark',
      gomoku: '/game/gomoku',
    };

    navigate(routeByMode[gameMode], {
      state: { difficulty: effectiveDifficulty },
    });
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,#fff3d4_0%,#f6deab_40%,#e9c688_100%)] p-4">
      <div className="w-full max-w-4xl rounded-[2rem] border border-amber-200/60 bg-white/90 p-6 shadow-2xl backdrop-blur sm:p-8 lg:p-10">
        <div className="text-center">
          <h1 className="text-4xl font-black tracking-[0.22em] text-amber-950 sm:text-5xl">
            中國棋類
          </h1>
          <p className="mt-3 text-lg font-semibold text-amber-800 sm:text-2xl">
            {playMode === 'solo' ? '單機模式' : '連線模式'}
          </p>
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px]">
          <div className="space-y-6">
            <section className="rounded-3xl border border-amber-100 bg-amber-50/70 p-5">
              <label className="mb-3 block text-lg font-black text-stone-800 sm:text-xl">
                遊玩方式
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  className={`rounded-2xl px-5 py-4 text-xl font-black transition-all ${
                    playMode === 'solo'
                      ? 'scale-[1.02] bg-amber-700 text-white shadow-lg'
                      : 'bg-white text-amber-900 shadow-sm hover:bg-amber-100'
                  }`}
                  onClick={() => setPlayMode('solo')}
                >
                  單機
                </button>
                <button
                  className={`rounded-2xl px-5 py-4 text-xl font-black transition-all ${
                    playMode === 'online'
                      ? 'scale-[1.02] bg-amber-700 text-white shadow-lg'
                      : 'bg-white text-amber-900 shadow-sm hover:bg-amber-100'
                  }`}
                  onClick={() => setPlayMode('online')}
                >
                  連線對戰
                </button>
              </div>
            </section>

            <section className="rounded-3xl border border-amber-100 bg-amber-50/70 p-5">
              <label className="mb-3 block text-lg font-black text-stone-800 sm:text-xl">
                遊戲模式
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                {(['bright', 'dark', 'gomoku'] as GameMode[]).map((mode) => {
                  const selected = gameMode === mode;
                  const showPending = playMode === 'online' && mode === 'gomoku';

                  return (
                    <button
                      key={mode}
                      className={`rounded-2xl px-4 py-4 text-lg font-black transition-all ${
                        selected
                          ? 'scale-[1.02] bg-stone-900 text-white shadow-lg'
                          : 'bg-white text-stone-800 shadow-sm hover:bg-stone-100'
                      }`}
                      onClick={() => setGameMode(mode)}
                    >
                      <span className="block">{gameModeLabels[mode]}</span>
                  <span className="mt-1 block text-sm font-semibold opacity-80">
                        {showPending ? '已可連線' : mode === 'gomoku' ? '新模式' : '已可遊玩'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </section>

            {playMode === 'solo' && (
              <section className="rounded-3xl border border-amber-100 bg-amber-50/70 p-5">
                <label className="mb-3 block text-lg font-black text-stone-800 sm:text-xl">
                  AI 難度
                </label>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  {availableDifficulties.map(([key, label]) => (
                    <button
                      key={key}
                      className={`rounded-2xl px-4 py-3 text-lg font-black transition-all ${
                        effectiveDifficulty === key
                          ? 'bg-amber-700 text-white shadow-lg'
                          : 'bg-white text-amber-900 shadow-sm hover:bg-amber-100'
                      }`}
                      onClick={() => setDifficulty(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-sm leading-7 text-stone-600 sm:text-base">
                  五子棋會使用自己的 AI 判型與攻防評估；明棋與暗棋的 AI 邏輯不會被共用或覆蓋。
                  {gameMode === 'gomoku'
                    ? '棋神會算穿連四殺棋，天元再加上活三連環殺與開局定式，兩者都在背景執行緒思考。'
                    : ''}
                </p>
              </section>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <button
                className="rounded-2xl bg-emerald-600 px-5 py-4 text-2xl font-black text-white shadow-lg transition-all hover:scale-[1.02] hover:bg-emerald-700 disabled:cursor-not-allowed disabled:bg-stone-400 disabled:hover:scale-100"
                onClick={handleStart}
                disabled={playMode === 'online' && !multiplayerReady}
              >
                {startLabel}
              </button>

              <button
                className="rounded-2xl bg-stone-700 px-5 py-4 text-xl font-black text-white transition-all hover:scale-[1.02] hover:bg-stone-800"
                onClick={() => navigate('/settings')}
              >
                設定
              </button>
            </div>
          </div>

          <aside className="rounded-[2rem] border border-stone-200 bg-stone-50 p-4 shadow-inner">
            <p className="text-sm font-black uppercase tracking-[0.2em] text-stone-500">
              Service Status
            </p>

            <div className="mt-4 space-y-3 text-base leading-7 sm:text-lg">
              <p className={`font-black ${statusClass(firebaseReady)}`}>
                {firebaseReady ? 'Firebase 已就緒' : 'Firebase 尚未設定'}
              </p>
              <p className={`font-bold ${statusClass(multiplayerReady)}`}>
                {multiplayerReady ? '連線功能可使用' : '連線功能尚未完成初始化'}
              </p>
              <p className={`font-bold ${statusClass(anonymousReady)}`}>
                匿名登入：{anonymousReady ? '已完成' : '尚未完成'}
              </p>
              <p className={`font-bold ${statusClass(isAppCheckEnabled)}`}>
                App Check：{isAppCheckEnabled ? '已啟用' : '未啟用'}
              </p>
            </div>

            <p className="mt-5 text-sm text-stone-500">版本：{appVersion}</p>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default Home;
