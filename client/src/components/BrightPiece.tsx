import React from 'react';
import type { Piece } from '../shared/types';
import { PIECE_LABELS } from '../shared/types';

interface BrightPieceProps {
  piece: Piece | null;
  isSelected: boolean;
  isValidMove: boolean;
  isLastMove: boolean;
  onClick: () => void;
}

const BrightPiece: React.FC<BrightPieceProps> = ({
  piece,
  isSelected,
  isValidMove,
  isLastMove,
  onClick,
}) => {
  if (!piece) {
    return (
      <div
        className="w-full h-full flex items-center justify-center relative cursor-pointer"
        onClick={onClick}
      >
        {isValidMove && (
          <div className="w-3 h-3 rounded-full bg-green-500 opacity-60" />
        )}
      </div>
    );
  }

  const textColor = piece.color === 'red' ? '#d32f2f' : '#212121';
  const borderColor = piece.color === 'red' ? '#d32f2f' : '#212121';

  return (
    <div
      className={`w-full h-full flex items-center justify-center rounded-full cursor-pointer transition-all duration-200 shadow-[0_2px_4px_rgba(0,0,0,0.3)] border-2 relative ${
        isSelected
          ? 'ring-4 ring-yellow-400 scale-110 z-10'
          : isLastMove
          ? 'ring-2 ring-blue-400'
          : 'hover:shadow-lg'
      } bg-gradient-to-b from-[#fff8e1] to-[#ffe0b2]`}
      style={{ borderColor }}
      onClick={onClick}
    >
      {/* Inner circle */}
      <div className="absolute inset-1 rounded-full border border-[#d7ccc8] opacity-60 pointer-events-none" />
      
      {/* Label */}
      <span
        className="relative z-10 select-none font-serif font-bold"
        style={{
          color: textColor,
          fontSize: 'clamp(18px, 4vw, 32px)',
        }}
      >
        {PIECE_LABELS[piece.color][piece.type]}
      </span>
    </div>
  );
};

export default BrightPiece;
