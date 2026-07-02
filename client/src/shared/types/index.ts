export type PieceType = 'general' | 'advisor' | 'elephant' | 'horse' | 'chariot' | 'cannon' | 'soldier';
export type PieceColor = 'red' | 'black';

export function oppositeColor(color: PieceColor): PieceColor {
  return color === 'red' ? 'black' : 'red';
}

export interface Piece {
  type: PieceType;
  color: PieceColor;
  revealed: boolean;
}

export type Cell = Piece | null;

export type Board = Cell[][];

export interface Position {
  row: number;
  col: number;
}

export type GamePhase = 'playing' | 'gameOver';

export interface GameState {
  board: Board;
  currentPlayer: PieceColor;
  selectedCell: Position | null;
  validMoves: Position[];
  phase: GamePhase;
  winner: PieceColor | null;
  firstPlayerColor: PieceColor | null;
  isFlippingFirst: boolean;
  lastMove: { from: Position; to: Position } | null;
}

export const PIECE_RANK: Record<PieceType, number> = {
  general: 7,
  advisor: 6,
  elephant: 5,
  chariot: 4,
  horse: 3,
  cannon: 2,
  soldier: 1,
};

export const PIECE_LABELS: Record<PieceColor, Record<PieceType, string>> = {
  red: {
    general: '帥',
    advisor: '仕',
    elephant: '相',
    horse: '傌',
    chariot: '俥',
    cannon: '炮',
    soldier: '兵',
  },
  black: {
    general: '將',
    advisor: '士',
    elephant: '象',
    horse: '馬',
    chariot: '車',
    cannon: '砲',
    soldier: '卒',
  },
};
