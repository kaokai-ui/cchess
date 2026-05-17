import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import GomokuBoard from '../components/GomokuBoard';
import { useGomokuGameStore } from '../stores/gomokuGameStore';
import type { GomokuAIDifficulty } from '../shared/gomoku/ai';

interface GomokuRouteState {
  difficulty?: GomokuAIDifficulty;
}

const GomokuGame: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const difficulty = (location.state as GomokuRouteState | null)?.difficulty ?? 'hard';

  const {
    aiDifficulty,
    board,
    currentPlayer,
    phase,
    winner,
    playerStone,
    aiStone,
    isAiThinking,
    lastMove,
    message,
    initGame,
    handleCellClick,
    resetGame,
    leaveGame,
    undo,
    canUndo,
  } = useGomokuGameStore();

  useEffect(() => {
    initGame(difficulty);
  }, [difficulty, initGame]);

  const currentPlayerLabel = currentPlayer === 'black' ? '黑子' : '白子';
  const difficultyLabelMap: Record<GomokuAIDifficulty, string> = {
    easy: '簡單',
    normal: '普通',
    hard: '困難',
    master: '棋聖',
  };

  return (
    <div className="flex min-h-screen flex-col overflow-hidden bg-[radial-gradient(circle_at_top,#fff4d5_0%,#f3d79a_42%,#e6bf7b_100%)]">
      <div className="flex-shrink-0 px-3 py-2 sm:px-5 sm:py-3">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <button
              className="rounded-xl bg-stone-700 px-4 py-2 text-base font-bold text-white transition-colors hover:bg-stone-800 sm:text-lg"
              onClick={() => {
                leaveGame();
                navigate('/');
              }}
            >
              返回
            </button>

            <div className="flex gap-2">
              <button
                className="rounded-xl bg-sky-600 px-4 py-2 text-base font-bold text-white transition-colors hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-50 sm:text-lg"
                disabled={!canUndo()}
                onClick={undo}
              >
                悔棋
              </button>
              <button
                className="rounded-xl bg-amber-700 px-4 py-2 text-base font-bold text-white transition-colors hover:bg-amber-800 sm:text-lg"
                onClick={resetGame}
              >
                重新開始
              </button>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_250px]">
            <div className="rounded-3xl border border-amber-200/70 bg-white/75 px-4 py-3 shadow-lg backdrop-blur">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h1 className="text-2xl font-black tracking-[0.12em] text-stone-900 sm:text-3xl">
                    五子棋
                  </h1>
                  <p className="mt-1 text-sm font-semibold text-stone-600 sm:text-base">
                    你執 {playerStone === 'black' ? '黑子' : '白子'}，AI 執{' '}
                    {aiStone === 'black' ? '黑子' : '白子'}
                  </p>
                </div>

                <div className="rounded-2xl bg-amber-100 px-4 py-2 text-right shadow-inner">
                  <p className="text-xs font-bold uppercase tracking-[0.2em] text-amber-800 sm:text-sm">
                    AI Difficulty
                  </p>
                  <p className="text-lg font-black text-amber-950 sm:text-xl">
                    {difficultyLabelMap[aiDifficulty]}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-stone-200 bg-white/80 px-4 py-3 shadow-lg backdrop-blur">
              <p className="text-2xl font-black text-stone-900">
                {isAiThinking ? 'AI 思考中' : `目前輪到${currentPlayerLabel}`}
              </p>
              <p className="mt-2 text-base font-semibold leading-7 text-stone-700">{message}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 items-center justify-center px-3 pb-3 sm:px-5 sm:pb-4">
        <GomokuBoard
          board={board}
          lastMove={lastMove}
          disabled={phase !== 'playing' || isAiThinking}
          onCellClick={handleCellClick}
        />
      </div>

      {phase === 'gameOver' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-sm rounded-[2rem] bg-white p-7 text-center shadow-2xl">
            <h2 className="text-3xl font-black text-stone-900 sm:text-4xl">
              {winner === playerStone ? '你贏了！' : winner === null ? '平手' : 'AI 獲勝'}
            </h2>
            <p className="mt-4 text-base leading-7 text-stone-600 sm:text-lg">
              {message}
            </p>

            <div className="mt-6 space-y-3">
              <button
                className="w-full rounded-2xl bg-emerald-600 py-3 text-xl font-black text-white transition-transform hover:scale-[1.02] hover:bg-emerald-700"
                onClick={resetGame}
              >
                再玩一局
              </button>
              <button
                className="w-full rounded-2xl bg-stone-700 py-3 text-xl font-black text-white transition-transform hover:scale-[1.02] hover:bg-stone-800"
                onClick={() => {
                  leaveGame();
                  navigate('/');
                }}
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

export default GomokuGame;
