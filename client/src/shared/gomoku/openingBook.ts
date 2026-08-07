// Compact opening guidance for the strongest levels.
//
// A full free-style opening database would be a project of its own, and the
// search is already strong once there are shapes on the board. What the search
// is genuinely bad at is the first ply or two, where every candidate evaluates
// to roughly nothing and the move is decided by a tie-break. These three rules
// cover exactly that gap:
//
//   * empty board            -> 天元 (the centre)
//   * one enemy stone        -> take the centre if it is free and the enemy
//                               drifted away from it, otherwise answer with a
//                               diagonal contact move (斜指), which keeps our
//                               stone working on two lines at once
//   * our stone + one enemy  -> extend our own stone diagonally, away from the
//                               enemy stone
//
// Returns -1 when the book has nothing to say, which hands the move back to the
// search.

import { AREA, EMPTY, GomokuBitboard, colOf, indexOf, opposite, rowOf } from './bitboard';
import { GOMOKU_BOARD_SIZE } from './engine';

const CENTER = (GOMOKU_BOARD_SIZE - 1) / 2;
const DIAGONALS = [
  [-1, -1],
  [-1, 1],
  [1, -1],
  [1, 1],
] as const;

function centerDistance(row: number, col: number): number {
  return Math.abs(row - CENTER) + Math.abs(col - CENTER);
}

function findStones(board: GomokuBitboard, color: number): number[] {
  const found: number[] = [];

  for (let index = 0; index < AREA; index += 1) {
    if (board.cells[index] === color) {
      found.push(index);
    }
  }

  return found;
}

/** Diagonal neighbour of `index` that is empty and scores best on `rank`. */
function bestDiagonal(
  board: GomokuBitboard,
  index: number,
  rank: (row: number, col: number) => number,
): number {
  const row = rowOf(index);
  const col = colOf(index);
  let best = -1;
  let bestRank = -Infinity;

  for (const [rowStep, colStep] of DIAGONALS) {
    const nextRow = row + rowStep;
    const nextCol = col + colStep;

    if (
      nextRow < 0 ||
      nextRow >= GOMOKU_BOARD_SIZE ||
      nextCol < 0 ||
      nextCol >= GOMOKU_BOARD_SIZE
    ) {
      continue;
    }

    const candidate = indexOf(nextRow, nextCol);

    if (board.cells[candidate] !== EMPTY) {
      continue;
    }

    const value = rank(nextRow, nextCol);

    if (value > bestRank) {
      bestRank = value;
      best = candidate;
    }
  }

  return best;
}

export function lookupOpeningMove(board: GomokuBitboard, color: number): number {
  if (board.stoneCount === 0) {
    return indexOf(CENTER, CENTER);
  }

  if (board.stoneCount > 2) {
    return -1;
  }

  const enemy = opposite(color);
  const ownStones = findStones(board, color);
  const enemyStones = findStones(board, enemy);

  if (ownStones.length === 0 && enemyStones.length === 1) {
    const enemyIndex = enemyStones[0];
    const centerIndex = indexOf(CENTER, CENTER);

    if (
      board.cells[centerIndex] === EMPTY &&
      centerDistance(rowOf(enemyIndex), colOf(enemyIndex)) >= 2
    ) {
      return centerIndex;
    }

    // Contact play, biased towards the middle of the board.
    return bestDiagonal(board, enemyIndex, (row, col) => -centerDistance(row, col));
  }

  if (ownStones.length === 1 && enemyStones.length === 1) {
    const ownIndex = ownStones[0];
    const enemyRow = rowOf(enemyStones[0]);
    const enemyCol = colOf(enemyStones[0]);

    // Grow our own stone diagonally, preferring the side the enemy is not on.
    return bestDiagonal(
      board,
      ownIndex,
      (row, col) =>
        Math.abs(row - enemyRow) + Math.abs(col - enemyCol) - centerDistance(row, col) * 0.5,
    );
  }

  return -1;
}
