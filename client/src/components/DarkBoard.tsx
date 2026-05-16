import React from 'react';
import type { Cell, PieceColor, PieceType, Position } from '../shared/types';
import DarkPiece from './DarkPiece';
import DarkCapturedTray from './DarkCapturedTray';

const DARK_PIECE_TOTALS: Record<PieceType, number> = {
  general: 1,
  advisor: 2,
  elephant: 2,
  horse: 2,
  chariot: 2,
  cannon: 2,
  soldier: 5,
};

function getCapturedPieces(board: Cell[][], color: PieceColor): PieceType[] {
  const remaining = { ...DARK_PIECE_TOTALS };

  for (const row of board) {
    for (const cell of row) {
      if (cell?.color === color) {
        remaining[cell.type] -= 1;
      }
    }
  }

  return (Object.entries(remaining) as [PieceType, number][])
    .flatMap(([pieceType, count]) =>
      Array.from({ length: Math.max(0, count) }, () => pieceType),
    );
}

interface DarkBoardProps {
  board: Cell[][];
  selectedCell: Position | null;
  validMoves: Position[];
  lastMove: { from: Position; to: Position } | null;
  flipCue: Position | null;
  flipCueDurationMs: number;
  onCellClick: (pos: Position) => void;
}

const DarkBoard: React.FC<DarkBoardProps> = ({
  board,
  selectedCell,
  validMoves,
  lastMove,
  flipCue,
  flipCueDurationMs,
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

  const isFlipCueTarget = (row: number, col: number) =>
    flipCue !== null &&
    flipCue.row === row &&
    flipCue.col === col;

  const capturedBlackPieces = getCapturedPieces(board, 'black');
  const capturedRedPieces = getCapturedPieces(board, 'red');

  return (
    <div className="mx-auto flex w-full max-w-6xl items-stretch justify-center gap-2 p-1 sm:gap-3 sm:p-2">
      <DarkCapturedTray color="black" pieces={capturedBlackPieces} />

      <div className="min-w-0 flex-1">
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
                        showFlipCue={isFlipCueTarget(rowIdx, colIdx)}
                        flipCueDurationMs={flipCueDurationMs}
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

      <DarkCapturedTray color="red" pieces={capturedRedPieces} />
    </div>
  );
};

export default DarkBoard;
