import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useGameStore } from '../stores/darkGameStore';
import { useSettingsStore } from '../stores/settingsStore';
import DarkBoard from '../components/DarkBoard';
import type { AIDifficulty } from '../stores/darkGameStore';

const DarkGame: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { difficulty } = location.state as { difficulty: AIDifficulty };
  const flipRevealCueEnabled = useSettingsStore(
    (state) => state.ui.flipRevealCueEnabled,
  );

  const {
    board,
    currentPlayer,
    selectedCell,
    validMoves,
    phase,
    winner,
    playerColor,
    isFlippingFirst,
    lastMove,
    flipCue,
    isAiThinking,
    message,
    initGame,
    handleCellClick,
    resetGame,
    leaveGame,
    undo,
    canUndo,
  } = useGameStore();

  useEffect(() => {
    initGame(difficulty);
  }, [difficulty, initGame]);

  const playerColorLabel = playerColor ? (playerColor === 'red' ? '紅方' : '黑方') : '未定';
  const aiColorLabel = playerColor ? (playerColor === 'red' ? '黑方' : '紅方') : '未定';

  return (
    <div className="h-screen bg-gradient-to-b from-amber-50 to-amber-100 flex flex-col overflow-hidden">
      <div className="flex-shrink-0 px-2 py-1 sm:px-4 sm:py-2">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-3">
            <button
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-lg font-semibold"
              onClick={() => {
                leaveGame();
                navigate('/');
              }}
            >
              離開
            </button>
            <div className="flex gap-2">
              <button
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-lg font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={undo}
                disabled={!canUndo() || isFlippingFirst}
              >
                悔棋
              </button>
              <button
                className="px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors text-lg font-semibold"
                onClick={resetGame}
              >
                重新開始
              </button>
            </div>
          </div>

          <div className="text-center mb-3">
            <span className="text-lg sm:text-xl font-bold text-amber-900">
              {isFlippingFirst
                ? '翻開第一顆棋子'
                : `${currentPlayer === 'red' ? '紅方' : '黑方'}的回合`}
              {isAiThinking && ' (AI 思考中...)'}
            </span>
          </div>

          <div className="bg-white rounded-xl p-3 mb-3 shadow-md">
            <div className="flex justify-between text-base sm:text-lg">
              <span className={playerColor === 'red' ? 'text-red-700 font-bold' : playerColor === 'black' ? 'text-gray-800 font-bold' : 'text-gray-500'}>
                你: {playerColorLabel}
              </span>
              <span className={playerColor === 'black' ? 'text-red-700 font-bold' : playerColor === 'red' ? 'text-gray-800 font-bold' : 'text-gray-500'}>
                AI: {aiColorLabel}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Board Area */}
      <div className="flex-1 flex items-center justify-center min-h-0 px-2">
        <DarkBoard
          board={board}
          selectedCell={selectedCell}
          validMoves={validMoves}
          lastMove={lastMove}
          flipCue={flipRevealCueEnabled ? flipCue : null}
          onCellClick={handleCellClick}
        />
      </div>

      {/* Bottom Message */}
      <div className="flex-shrink-0 py-1 text-center">
        <span className="inline-block px-3 py-1 bg-amber-100 rounded-lg text-xs sm:text-base text-amber-800">
          {message}
        </span>
      </div>

      {phase === 'gameOver' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 max-w-sm w-full text-center">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              {winner === playerColor ? '你贏了！' : winner === null ? '平手！' : '你輸了！'}
            </h2>
            <p className="text-lg text-gray-600 mb-6">{message}</p>
            <div className="space-y-3">
              <button
                className="w-full py-3 bg-green-600 hover:bg-green-700 text-white text-xl font-bold rounded-xl transition-all hover:scale-105"
                onClick={() => {
                  resetGame();
                }}
              >
                繼續遊戲
              </button>
              <button
                className="w-full py-3 bg-gray-600 hover:bg-gray-700 text-white text-xl font-bold rounded-xl transition-all hover:scale-105"
                onClick={() => {
                  leaveGame();
                  navigate('/');
                }}
              >
                離開遊戲
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DarkGame;
