import React from 'react';
import type { Piece } from '../shared/types';
import { PIECE_LABELS } from '../shared/types';

interface DarkPieceProps {
  piece: Piece | null;
  isSelected: boolean;
  isValidMove: boolean;
  isLastMove: boolean;
  onClick: () => void;
}

const DarkPiece: React.FC<DarkPieceProps> = ({
  piece,
  isSelected,
  isValidMove,
  isLastMove,
  onClick,
}) => {
  // Empty cell with valid move indicator
  if (!piece) {
    return (
      <div
        className="w-full h-full flex items-center justify-center rounded-full transition-all duration-200"
        onClick={onClick}
      >
        {isValidMove && (
          <div className="w-4 h-4 rounded-full bg-green-500 opacity-60 shadow-sm" />
        )}
      </div>
    );
  }

  // Unrevealed piece (Back side)
  if (!piece.revealed) {
    return (
      <div
        className="w-full h-full rounded-full cursor-pointer transition-all duration-200 shadow-[0_4px_6px_rgba(0,0,0,0.4)] border-2 border-[#3e2723] bg-gradient-to-br from-[#5d4037] to-[#3e2723] hover:brightness-110 active:scale-95"
        onClick={onClick}
      />
    );
  }

  // Revealed piece
  const textColor = piece.color === 'red' ? '#d32f2f' : '#212121';
  const textShadow = piece.color === 'red' ? '0 1px 2px rgba(211, 47, 47, 0.3)' : '0 1px 2px rgba(0,0,0,0.2)';

  return (
    <div
      className={`w-full h-full flex items-center justify-center rounded-full cursor-pointer transition-all duration-200 shadow-[0_3px_5px_rgba(0,0,0,0.3)] border-[3px] relative overflow-hidden ${
        isSelected
          ? 'ring-4 ring-yellow-400 scale-105 z-10 border-yellow-500'
          : isLastMove
          ? 'ring-2 ring-blue-400 border-[#8d6e63]'
          : 'border-[#8d6e63] hover:shadow-[0_5px_8px_rgba(0,0,0,0.4)] hover:scale-102 active:scale-95'
      } bg-gradient-to-b from-[#fff8e1] to-[#ffe0b2]`}
      onClick={onClick}
    >
      {/* Inner circle for depth */}
      <div className="absolute inset-1 rounded-full border border-[#d7ccc8] opacity-60 pointer-events-none" />
      
      {/* Piece Label */}
      <span
        className="relative z-10 select-none font-serif font-bold"
        style={{
          color: textColor,
          textShadow: textShadow,
          fontSize: 'clamp(18px, 4vw, 32px)',
        }}
      >
        {PIECE_LABELS[piece.color][piece.type]}
      </span>
    </div>
  );
};

export default DarkPiece;
