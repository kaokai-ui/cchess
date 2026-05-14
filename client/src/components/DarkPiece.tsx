import React from 'react';
import type { Piece } from '../shared/types';
import { PIECE_LABELS } from '../shared/types';

interface DarkPieceProps {
  piece: Piece | null;
  isSelected: boolean;
  isValidMove: boolean;
  isLastMove: boolean;
  showFlipCue: boolean;
  flipCueDurationMs: number;
  onClick: () => void;
}

const DarkPiece: React.FC<DarkPieceProps> = ({
  piece,
  isSelected,
  isValidMove,
  isLastMove,
  showFlipCue,
  flipCueDurationMs,
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
  const flipCueStyle = showFlipCue
    ? ({ animationDuration: `${flipCueDurationMs}ms` } satisfies React.CSSProperties)
    : undefined;

  return (
    <div
      className={`w-full h-full flex items-center justify-center rounded-full cursor-pointer transition-all duration-200 shadow-[0_3px_5px_rgba(0,0,0,0.3)] border-[3px] relative overflow-hidden ${
        isSelected
          ? 'ring-4 ring-yellow-400 scale-105 z-10 border-yellow-500'
          : showFlipCue
          ? 'ring-4 ring-amber-300 scale-105 z-10 border-amber-500 dark-piece-flip-glow'
          : isLastMove
          ? 'ring-2 ring-blue-400 border-[#8d6e63]'
          : 'border-[#8d6e63] hover:shadow-[0_5px_8px_rgba(0,0,0,0.4)] hover:scale-102 active:scale-95'
      } bg-gradient-to-b from-[#fff8e1] to-[#ffe0b2]`}
      style={flipCueStyle}
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

      {showFlipCue && (
        <>
          <div className="dark-flip-cue__hand" style={flipCueStyle}>
            <svg
              viewBox="0 0 64 64"
              aria-hidden="true"
              className="h-[72%] w-[72%] drop-shadow-[0_6px_12px_rgba(62,39,35,0.32)]"
            >
              <circle cx="17" cy="14" r="6" fill="none" stroke="#f6e7b4" strokeWidth="3" />
              <circle cx="17" cy="14" r="11" fill="none" stroke="#f6e7b4" strokeOpacity="0.45" strokeWidth="2.5" />
              <rect x="25" y="10" width="8" height="28" rx="4" fill="#fff7dc" stroke="#6d4c41" strokeWidth="2.5" />
              <rect x="33" y="17" width="7" height="23" rx="3.5" fill="#fff7dc" stroke="#6d4c41" strokeWidth="2.5" />
              <rect x="40" y="21" width="6" height="20" rx="3" fill="#fff7dc" stroke="#6d4c41" strokeWidth="2.5" />
              <rect x="46" y="25" width="5.5" height="17" rx="2.75" fill="#fff7dc" stroke="#6d4c41" strokeWidth="2.5" />
              <rect
                x="20"
                y="28"
                width="15"
                height="10"
                rx="5"
                fill="#fff7dc"
                stroke="#6d4c41"
                strokeWidth="2.5"
                transform="rotate(-30 20 28)"
              />
              <path
                d="M23 34c0-5.5 4.5-10 10-10h3c6.6 0 12 5.4 12 12v7.5c0 7.5-6 13.5-13.5 13.5h-2C25.6 57 20 51.4 20 44.5V40c0-3.3 2.7-6 6-6h3"
                fill="#fff7dc"
                stroke="#6d4c41"
                strokeWidth="2.5"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <div className="dark-flip-cue__cover" style={flipCueStyle} />
        </>
      )}
    </div>
  );
};

export default DarkPiece;
