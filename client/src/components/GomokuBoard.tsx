import React from 'react';
import { GOMOKU_BOARD_SIZE } from '../shared/gomoku/engine';
import type {
  GomokuBoard as GomokuBoardState,
  GomokuPosition,
} from '../shared/gomoku/types';

interface GomokuBoardProps {
  board: GomokuBoardState;
  lastMove: GomokuPosition | null;
  disabled?: boolean;
  onCellClick: (pos: GomokuPosition) => void;
}

const STAR_POINTS = [
  { row: 3, col: 3 },
  { row: 3, col: 7 },
  { row: 3, col: 11 },
  { row: 7, col: 3 },
  { row: 7, col: 7 },
  { row: 7, col: 11 },
  { row: 11, col: 3 },
  { row: 11, col: 7 },
  { row: 11, col: 11 },
];

const GomokuBoard: React.FC<GomokuBoardProps> = ({
  board,
  lastMove,
  disabled = false,
  onCellClick,
}) => {
  return (
    <div className="gomoku-board-shell mx-auto w-full">
      <div className="relative rounded-[1.75rem] border-[3px] border-[#6d4c41] bg-gradient-to-br from-[#f8e1a8] via-[#efc77b] to-[#dea34f] p-3 shadow-2xl sm:p-4">
        <svg
          className="pointer-events-none absolute inset-0 z-0 h-full w-full"
          viewBox={`0 0 ${GOMOKU_BOARD_SIZE} ${GOMOKU_BOARD_SIZE}`}
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          {Array.from({ length: GOMOKU_BOARD_SIZE }).map((_, index) => (
            <React.Fragment key={index}>
              <line
                x1="0.5"
                y1={index + 0.5}
                x2={GOMOKU_BOARD_SIZE - 0.5}
                y2={index + 0.5}
                stroke="#6d4c41"
                strokeWidth="0.04"
              />
              <line
                x1={index + 0.5}
                y1="0.5"
                x2={index + 0.5}
                y2={GOMOKU_BOARD_SIZE - 0.5}
                stroke="#6d4c41"
                strokeWidth="0.04"
              />
            </React.Fragment>
          ))}

          {STAR_POINTS.map((point) => (
            <circle
              key={`${point.row}-${point.col}`}
              cx={point.col + 0.5}
              cy={point.row + 0.5}
              r="0.14"
              fill="#5d4037"
            />
          ))}
        </svg>

        <div
          className="relative z-10 grid"
          style={{
            gridTemplateColumns: `repeat(${GOMOKU_BOARD_SIZE}, minmax(0, 1fr))`,
          }}
        >
          {board.map((row, rowIndex) =>
            row.map((cell, colIndex) => {
              const isLastMove =
                lastMove !== null &&
                lastMove.row === rowIndex &&
                lastMove.col === colIndex;

              return (
                <button
                  key={`${rowIndex}-${colIndex}`}
                  type="button"
                  aria-label={`第 ${rowIndex + 1} 列，第 ${colIndex + 1} 行`}
                  className="group relative aspect-square bg-transparent p-0"
                  disabled={disabled}
                  onClick={() => onCellClick({ row: rowIndex, col: colIndex })}
                >
                  <div className="absolute inset-[18%] rounded-full transition-all duration-150 group-enabled:group-hover:bg-white/20" />

                  {cell && (
                    <div
                      className={`absolute inset-[14%] rounded-full shadow-[0_6px_14px_rgba(0,0,0,0.28)] transition-transform duration-150 ${
                        cell === 'black'
                          ? 'border border-stone-900 bg-gradient-to-br from-stone-700 via-stone-900 to-black'
                          : 'border border-stone-300 bg-gradient-to-br from-white via-stone-100 to-stone-300'
                      } ${isLastMove ? 'scale-105 ring-4 ring-amber-300/90' : ''}`}
                    >
                      <div
                        className={`absolute inset-[14%] rounded-full ${
                          cell === 'black'
                            ? 'border border-white/10'
                            : 'border border-stone-200/90'
                        }`}
                      />
                    </div>
                  )}

                  {isLastMove && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      <div className="h-2.5 w-2.5 rounded-full bg-rose-500 shadow-[0_0_0_3px_rgba(255,255,255,0.85)]" />
                    </div>
                  )}
                </button>
              );
            }),
          )}
        </div>
      </div>
    </div>
  );
};

export default GomokuBoard;
