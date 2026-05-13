import React from 'react';
import type { Cell, Position } from '../shared/types';
import BrightPiece from './BrightPiece';

interface BrightBoardProps {
  board: Cell[][];
  selectedCell: Position | null;
  validMoves: Position[];
  lastMove: { from: Position; to: Position } | null;
  onCellClick: (pos: Position) => void;
}

const BrightBoard: React.FC<BrightBoardProps> = ({
  board,
  selectedCell,
  validMoves,
  lastMove,
  onCellClick,
}) => {
  const isSelected = (row: number, col: number) =>
    selectedCell !== null && selectedCell.row === row && selectedCell.col === col;

  const isValidMove = (row: number, col: number) =>
    validMoves.some((m) => m.row === row && m.col === col);

  const isLastMoveTarget = (row: number, col: number) =>
    lastMove !== null &&
    lastMove !== undefined &&
    lastMove.to !== undefined &&
    lastMove.to.row === row &&
    lastMove.to.col === col;

  // Grid represents intersections. Pieces sit in the center of each cell.
  // Lines are drawn connecting the centers.
  return (
    <div
      className="w-full mx-auto"
      style={{ maxWidth: 'min(100%, calc((100dvh - 2rem) * 0.78), 880px)' }}
    >
      <div className="bg-[#e8d5b7] p-3 sm:p-4 rounded-lg shadow-2xl border-2 border-[#5d4037] relative">
        
        {/* SVG Board Lines */}
        {/* viewBox 0 0 9 10 matches the 9x10 grid. Centers are at x+0.5, y+0.5 */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none z-0"
          viewBox="0 0 9 10"
          preserveAspectRatio="none"
        >
          {/* Horizontal lines */}
          {Array.from({ length: 10 }).map((_, i) => (
            <line key={`h-${i}`} x1="0.5" y1={i + 0.5} x2="8.5" y2={i + 0.5} stroke="#5d4037" strokeWidth="0.05" />
          ))}
          {/* Vertical lines */}
          {Array.from({ length: 9 }).map((_, i) => (
            <React.Fragment key={`v-${i}`}>
              {i === 0 || i === 8 ? (
                // Outer borders go all the way
                <line x1={i + 0.5} y1="0.5" x2={i + 0.5} y2="9.5" stroke="#5d4037" strokeWidth="0.05" />
              ) : (
                <>
                  <line x1={i + 0.5} y1="0.5" x2={i + 0.5} y2="4.5" stroke="#5d4037" strokeWidth="0.05" />
                  <line x1={i + 0.5} y1="5.5" x2={i + 0.5} y2="9.5" stroke="#5d4037" strokeWidth="0.05" />
                </>
              )}
            </React.Fragment>
          ))}
          
          {/* Palace diagonals */}
          <line x1="3.5" y1="0.5" x2="5.5" y2="2.5" stroke="#5d4037" strokeWidth="0.05" />
          <line x1="5.5" y1="0.5" x2="3.5" y2="2.5" stroke="#5d4037" strokeWidth="0.05" />
          <line x1="3.5" y1="7.5" x2="5.5" y2="9.5" stroke="#5d4037" strokeWidth="0.05" />
          <line x1="5.5" y1="7.5" x2="3.5" y2="9.5" stroke="#5d4037" strokeWidth="0.05" />

          {/* River Text */}
          <text x="2" y="5" fontSize="0.5" fill="#5d4037" textAnchor="middle" dominantBaseline="central" fontFamily="serif">楚 河</text>
          <text x="7" y="5" fontSize="0.5" fill="#5d4037" textAnchor="middle" dominantBaseline="central" fontFamily="serif">漢 界</text>
        </svg>

        {/* Piece Grid - 10 rows x 9 columns */}
        <div className="grid grid-rows-10 grid-cols-9 gap-0 relative z-10">
          {board.map((row, rowIdx) =>
            row.map((cell, colIdx) => (
              <div
                key={`${rowIdx}-${colIdx}`}
                className="aspect-square relative flex items-center justify-center"
              >
                <BrightPiece
                  piece={cell}
                  isSelected={isSelected(rowIdx, colIdx)}
                  isValidMove={isValidMove(rowIdx, colIdx)}
                  isLastMove={isLastMoveTarget(rowIdx, colIdx)}
                  onClick={() => onCellClick({ row: rowIdx, col: colIdx })}
                />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

export default BrightBoard;
