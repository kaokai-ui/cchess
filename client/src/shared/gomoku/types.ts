export type GomokuStone = 'black' | 'white';

export type GomokuCell = GomokuStone | null;

export type GomokuBoard = GomokuCell[][];

export interface GomokuPosition {
  row: number;
  col: number;
}

export type GomokuPhase = 'playing' | 'gameOver';
