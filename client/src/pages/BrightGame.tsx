import React, { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useBrightGameStore } from '../stores/brightGameStore';
import BrightBoard from '../components/BrightBoard';
import type { PieceColor } from '../shared/types';
import type { AIDifficulty } from '../stores/brightGameStore';

const BrightGame: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { playerColor: routePlayerColor, difficulty } = location.state as {
    playerColor?: PieceColor;
    difficulty: AIDifficulty;
  };

  // Default to red if not provided
  const playerColor = routePlayerColor || 'red';

  const {
    board,
    currentPlayer,
    selectedCell,
    validMoves,
    phase,
    winner,
    playerColor: storedPlayerColor,
    lastMove,
    isAiThinking,
    message,
    initGame,
    handleCellClick,
    resetGame,
    leaveGame,
    executeAiTurn,
    undo,
    canUndo,
  } = useBrightGameStore();

  useEffect(() => {
    initGame(playerColor, difficulty);
    
    // If player is black, AI (red) goes first
    if (playerColor === 'black') {
      const timer = setTimeout(() => {
        executeAiTurn();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [playerColor, difficulty, initGame, executeAiTurn]);

  const playerColorLabel = storedPlayerColor === 'red' ? '紅方' : '黑方';
  const aiColorLabel = storedPlayerColor === 'red' ? '黑方' : '紅方';

  return (
    <div className="h-screen bg-gradient-to-b from-amber-50 to-amber-100 flex flex-col overflow-hidden">
      {/* Top Bar */}
      <div className="flex-shrink-0 px-2 py-1 sm:px-4 sm:py-2">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <button
            className="px-3 py-1 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm sm:text-base font-semibold"
            onClick={() => {
              leaveGame();
              navigate('/');
            }}
          >
            離開
          </button>
          <div className="flex gap-2">
            <button
              className="px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm sm:text-base font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              onClick={undo}
              disabled={!canUndo()}
            >
              悔棋
            </button>
            <button
              className="px-3 py-1 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors text-sm sm:text-base font-semibold"
              onClick={resetGame}
            >
              重新開始
            </button>
          </div>
        </div>
        <div className="max-w-5xl mx-auto mt-1 text-center">
          <span className="text-sm sm:text-lg font-bold text-amber-900">
            {`${currentPlayer === 'red' ? '紅方' : '黑方'}的回合`}
            {isAiThinking && ' (AI 思考中...)'}
          </span>
        </div>
        <div className="max-w-5xl mx-auto mt-1 bg-white rounded-lg px-3 py-1 shadow-sm">
          <div className="flex justify-between text-xs sm:text-base">
            <span className={storedPlayerColor === 'red' ? 'text-red-700 font-bold' : 'text-gray-800 font-bold'}>
              你: {playerColorLabel}
            </span>
            <span className={storedPlayerColor === 'black' ? 'text-red-700 font-bold' : 'text-gray-800 font-bold'}>
              AI: {aiColorLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Board Area */}
      <div className="flex-1 flex items-center justify-center min-h-0 px-2">
        <BrightBoard
          board={board}
          selectedCell={selectedCell}
          validMoves={validMoves}
          lastMove={lastMove}
          onCellClick={handleCellClick}
        />
      </div>

      {/* Bottom Message */}
      <div className="flex-shrink-0 py-1 text-center">
        <span className="inline-block px-3 py-1 bg-amber-100 rounded-lg text-xs sm:text-base text-amber-800">
          {message}
        </span>
      </div>

      {/* Game Over Modal */}
      {phase === 'gameOver' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8 max-w-sm w-full text-center">
            <h2 className="text-2xl sm:text-4xl font-bold mb-4">
              {winner === storedPlayerColor ? '你贏了！' : '你輸了！'}
            </h2>
            <p className="text-base sm:text-lg text-gray-600 mb-6">{message}</p>
            <div className="space-y-3">
              <button
                className="w-full py-3 bg-green-600 hover:bg-green-700 text-white text-lg sm:text-xl font-bold rounded-xl transition-all hover:scale-105"
                onClick={() => {
                  resetGame();
                }}
              >
                繼續遊戲
              </button>
              <button
                className="w-full py-3 bg-gray-600 hover:bg-gray-700 text-white text-lg sm:text-xl font-bold rounded-xl transition-all hover:scale-105"
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

export default BrightGame;
