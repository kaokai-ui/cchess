import React from 'react';
import type { Cell, Position } from '../shared/types';
import DarkPiece from './DarkPiece';

interface DarkBoardProps {
  board: Cell[][];
  selectedCell: Position | null;
  validMoves: Position[];
  lastMove: { from: Position; to: Position } | null;
  onCellClick: (pos: Position) => void;
}

const DarkBoard: React.FC<DarkBoardProps> = ({
  board,
  selectedCell,
  validMoves,
  lastMove,
  onCellClick,
}) => {
  const isSelected = (row: number, col: number) =>
    selectedCell !== null &&
    selectedCell.row === row &&
    selectedCell.col === col;

  const isValidMove = (row: number, col: number) =>
    validMoves.some((m) => m.row === row && m.col === col);

  const isLastMoveTarget = (row: number, col: number) =>
    lastMove !== null &&
    lastMove !== undefined &&
    lastMove.to !== undefined &&
    lastMove.to.row === row &&
    lastMove.to.col === col;

  return (
    <div className="w-full max-w-4xl xl:max-w-[72rem] mx-auto p-1 sm:p-2">
      {/* Board Outer Border */}
      <div className="bg-[#5d4037] p-2 sm:p-3 rounded-xl shadow-2xl border-4 border-[#3e2723]">
        {/* Board Inner Background (Wood texture simulation) */}
        <div className="bg-[#d7ccc8] p-1 rounded-lg shadow-inner">
          <div className="grid grid-cols-8 gap-1 sm:gap-1.5">
            {board.map((row, rowIdx) =>
              row.map((cell, colIdx) => (
                <div
                  key={`${rowIdx}-${colIdx}`}
                  className="aspect-square relative"
                >
                  {/* Cell Background */}
                  <div className="absolute inset-0 bg-[#efebe9] rounded-sm border border-[#bcaaa4] opacity-80" />
                  
                  {/* Piece Container */}
                  <div className="relative z-10 p-1 sm:p-1.5 h-full">
                    <DarkPiece
                      piece={cell}
                      isSelected={isSelected(rowIdx, colIdx)}
                      isValidMove={isValidMove(rowIdx, colIdx)}
                      isLastMove={isLastMoveTarget(rowIdx, colIdx)}
                      onClick={() => onCellClick({ row: rowIdx, col: colIdx })}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DarkBoard;
