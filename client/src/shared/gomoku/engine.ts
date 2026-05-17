import type { GomokuBoard, GomokuPosition, GomokuStone } from './types';

export const GOMOKU_BOARD_SIZE = 15;
export const GOMOKU_WIN_LENGTH = 5;

const DIRECTIONS = [
  { row: 1, col: 0 },
  { row: 0, col: 1 },
  { row: 1, col: 1 },
  { row: 1, col: -1 },
] as const;

export function createInitialBoard(): GomokuBoard {
  return Array.from({ length: GOMOKU_BOARD_SIZE }, () =>
    Array<GomokuStone | null>(GOMOKU_BOARD_SIZE).fill(null),
  );
}

export function cloneBoard(board: GomokuBoard): GomokuBoard {
  return board.map((row) => [...row]);
}

export function isInBounds(pos: GomokuPosition): boolean {
  return (
    pos.row >= 0 &&
    pos.row < GOMOKU_BOARD_SIZE &&
    pos.col >= 0 &&
    pos.col < GOMOKU_BOARD_SIZE
  );
}

export function isValidMove(board: GomokuBoard, pos: GomokuPosition): boolean {
  return isInBounds(pos) && board[pos.row][pos.col] === null;
}

export function placeStone(
  board: GomokuBoard,
  pos: GomokuPosition,
  stone: GomokuStone,
): GomokuBoard {
  if (!isValidMove(board, pos)) {
    return board;
  }

  const nextBoard = cloneBoard(board);
  nextBoard[pos.row][pos.col] = stone;
  return nextBoard;
}

export function isBoardFull(board: GomokuBoard): boolean {
  return board.every((row) => row.every((cell) => cell !== null));
}

function countDirection(
  board: GomokuBoard,
  pos: GomokuPosition,
  stone: GomokuStone,
  rowStep: number,
  colStep: number,
) {
  let total = 0;
  let row = pos.row + rowStep;
  let col = pos.col + colStep;

  while (
    row >= 0 &&
    row < GOMOKU_BOARD_SIZE &&
    col >= 0 &&
    col < GOMOKU_BOARD_SIZE &&
    board[row][col] === stone
  ) {
    total += 1;
    row += rowStep;
    col += colStep;
  }

  return total;
}

export function getLineLength(
  board: GomokuBoard,
  pos: GomokuPosition,
  stone: GomokuStone,
  rowStep: number,
  colStep: number,
): number {
  return (
    1 +
    countDirection(board, pos, stone, rowStep, colStep) +
    countDirection(board, pos, stone, -rowStep, -colStep)
  );
}

export function checkWinner(
  board: GomokuBoard,
  lastMove?: GomokuPosition | null,
): GomokuStone | null {
  if (lastMove) {
    const stone = board[lastMove.row][lastMove.col];

    if (!stone) {
      return null;
    }

    for (const direction of DIRECTIONS) {
      if (
        getLineLength(board, lastMove, stone, direction.row, direction.col) >=
        GOMOKU_WIN_LENGTH
      ) {
        return stone;
      }
    }

    return null;
  }

  for (let row = 0; row < GOMOKU_BOARD_SIZE; row += 1) {
    for (let col = 0; col < GOMOKU_BOARD_SIZE; col += 1) {
      const stone = board[row][col];

      if (!stone) {
        continue;
      }

      for (const direction of DIRECTIONS) {
        if (
          getLineLength(board, { row, col }, stone, direction.row, direction.col) >=
          GOMOKU_WIN_LENGTH
        ) {
          return stone;
        }
      }
    }
  }

  return null;
}

export function getCenterMove(): GomokuPosition {
  const center = Math.floor(GOMOKU_BOARD_SIZE / 2);
  return { row: center, col: center };
}

export function hasAnyStone(board: GomokuBoard): boolean {
  return board.some((row) => row.some((cell) => cell !== null));
}

export function getCandidateMoves(board: GomokuBoard, radius = 2): GomokuPosition[] {
  if (!hasAnyStone(board)) {
    return [getCenterMove()];
  }

  const moveMap = new Map<string, GomokuPosition>();

  for (let row = 0; row < GOMOKU_BOARD_SIZE; row += 1) {
    for (let col = 0; col < GOMOKU_BOARD_SIZE; col += 1) {
      if (board[row][col] === null) {
        continue;
      }

      for (let rowDelta = -radius; rowDelta <= radius; rowDelta += 1) {
        for (let colDelta = -radius; colDelta <= radius; colDelta += 1) {
          const candidate = { row: row + rowDelta, col: col + colDelta };

          if (!isValidMove(board, candidate)) {
            continue;
          }

          moveMap.set(`${candidate.row}:${candidate.col}`, candidate);
        }
      }
    }
  }

  return [...moveMap.values()];
}
