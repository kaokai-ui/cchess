import React from 'react';
import type { PieceColor, PieceType } from '../shared/types';
import { PIECE_LABELS } from '../shared/types';

interface DarkCapturedTrayProps {
  color: PieceColor;
  pieces: PieceType[];
}

const PIECE_SORT_ORDER: PieceType[] = [
  'general',
  'advisor',
  'elephant',
  'chariot',
  'horse',
  'cannon',
  'soldier',
];

const LABEL_CLASS_BY_COLOR: Record<PieceColor, string> = {
  red: 'text-red-700',
  black: 'text-stone-800',
};

const PANEL_CLASS_BY_COLOR: Record<PieceColor, string> = {
  red: 'border-red-200 bg-red-50/80',
  black: 'border-stone-300 bg-stone-100/80',
};

const TITLE_BY_COLOR: Record<PieceColor, string> = {
  red: '紅方陣亡',
  black: '黑方陣亡',
};

const DarkCapturedTray: React.FC<DarkCapturedTrayProps> = ({ color, pieces }) => {
  const sortedPieces = [...pieces].sort(
    (left, right) => PIECE_SORT_ORDER.indexOf(left) - PIECE_SORT_ORDER.indexOf(right),
  );

  return (
    <div
      className={`w-16 sm:w-20 md:w-24 flex-shrink-0 rounded-2xl border px-2 py-3 shadow-sm ${PANEL_CLASS_BY_COLOR[color]}`}
    >
      <p className="mb-2 text-center text-[11px] font-bold tracking-wide text-amber-900 sm:text-xs">
        {TITLE_BY_COLOR[color]}
      </p>

      <div className="grid grid-cols-2 gap-1.5">
        {sortedPieces.map((pieceType, index) => (
          <div
            key={`${color}-${pieceType}-${index}`}
            className="flex aspect-square items-center justify-center rounded-full border border-amber-200 bg-gradient-to-b from-[#fff8e1] to-[#ffe0b2] shadow-[0_2px_4px_rgba(0,0,0,0.15)]"
          >
            <span className={`select-none text-sm font-bold sm:text-base ${LABEL_CLASS_BY_COLOR[color]}`}>
              {PIECE_LABELS[color][pieceType]}
            </span>
          </div>
        ))}

        {sortedPieces.length === 0 && (
          <div className="col-span-2 rounded-xl border border-dashed border-amber-200 px-2 py-4 text-center text-[11px] text-amber-700 sm:text-xs">
            尚無
          </div>
        )}
      </div>
    </div>
  );
};

export default DarkCapturedTray;
