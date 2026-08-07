// Flat, mutable board representation used by the strong gomoku levels.
//
// The legacy heuristic AI clones a 15x15 array of strings for every candidate it
// looks at, which caps it at a few thousand evaluations per move. This board
// instead uses make/unmake on typed arrays and keeps three things incremental:
//
//   * `codes`   - the 9-cell window code per point per direction (see patterns.ts)
//   * `score`   - per point, per colour: "how good is it to play here", O(1) read
//   * `near`    - how many stones sit within the candidate radius of a point
//
// Placing or taking back a stone only touches the 32 points that share a line
// with it, so a make/unmake pair costs a few hundred operations and a leaf
// evaluation costs nothing at all (running totals are maintained as we go).

import { GOMOKU_BOARD_SIZE } from './engine';
import {
  CELL_WALL,
  PATTERN_FIVE,
  PATTERN_FOUR,
  PATTERN_OPEN_FOUR,
  PATTERN_OPEN_THREE,
  PATTERN_OPEN_TWO,
  PATTERN_SLEEP_THREE,
  PATTERN_TWO,
  POW4,
  WINDOW_CENTER,
  WINDOW_SIZE,
  getPatternTable,
} from './patterns';
import type { GomokuBoard, GomokuStone } from './types';

export const AREA = GOMOKU_BOARD_SIZE * GOMOKU_BOARD_SIZE;
export const EMPTY = 0;
export const BLACK = 1;
export const WHITE = 2;

export const CANDIDATE_RADIUS = 2;

// Shape values. The thresholds double as classifiers: a point scoring
// SCORE_FIVE wins on the spot, anything at or above SCORE_DOUBLE_THREE is a
// fork that usually wins by force.
export const SCORE_FIVE = 10_000_000;
export const SCORE_OPEN_FOUR = 1_000_000;
export const SCORE_DOUBLE_FOUR = 900_000;
export const SCORE_FOUR_THREE = 800_000;
export const SCORE_DOUBLE_THREE = 100_000;
export const SCORE_FOUR = 20_000;
export const SCORE_OPEN_THREE = 8_000;
export const SCORE_SLEEP_THREE = 1_200;
export const SCORE_OPEN_TWO = 600;
export const SCORE_TWO = 100;

// Contribution cap for the running totals, so one unstoppable point cannot
// swamp the positional part of the evaluation (mate is handled by the search).
const EVAL_CAP = SCORE_OPEN_FOUR;

export const FLAG_FIVE = 1;
export const FLAG_OPEN_FOUR = 2;
export const FLAG_FOUR = 4;
export const FLAG_OPEN_THREE = 8;
export const FLAG_FORK = 16;

const DIRECTIONS = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
] as const;

export function indexOf(row: number, col: number): number {
  return row * GOMOKU_BOARD_SIZE + col;
}

export function rowOf(index: number): number {
  return (index / GOMOKU_BOARD_SIZE) | 0;
}

export function colOf(index: number): number {
  return index % GOMOKU_BOARD_SIZE;
}

export function opposite(color: number): number {
  return color === BLACK ? WHITE : BLACK;
}

export function toStoneCode(stone: GomokuStone): number {
  return stone === 'black' ? BLACK : WHITE;
}

export function toStone(color: number): GomokuStone {
  return color === BLACK ? 'black' : 'white';
}

// LINE[(index * 4 + direction) * WINDOW_SIZE + slot] = board index of the cell
// (slot - WINDOW_CENTER) steps away along `direction`, or -1 when off-board.
const LINE = new Int16Array(AREA * 4 * WINDOW_SIZE);

for (let row = 0; row < GOMOKU_BOARD_SIZE; row += 1) {
  for (let col = 0; col < GOMOKU_BOARD_SIZE; col += 1) {
    const index = indexOf(row, col);

    for (let direction = 0; direction < 4; direction += 1) {
      const [rowStep, colStep] = DIRECTIONS[direction];

      for (let slot = 0; slot < WINDOW_SIZE; slot += 1) {
        const offset = slot - WINDOW_CENTER;
        const nextRow = row + rowStep * offset;
        const nextCol = col + colStep * offset;
        const inBounds =
          nextRow >= 0 &&
          nextRow < GOMOKU_BOARD_SIZE &&
          nextCol >= 0 &&
          nextCol < GOMOKU_BOARD_SIZE;

        LINE[(index * 4 + direction) * WINDOW_SIZE + slot] = inBounds
          ? indexOf(nextRow, nextCol)
          : -1;
      }
    }
  }
}

// Empty-board window codes: every off-board slot already carries the wall digit.
const INITIAL_CODES = new Int32Array(AREA * 4);

for (let index = 0; index < AREA; index += 1) {
  for (let direction = 0; direction < 4; direction += 1) {
    let code = 0;

    for (let slot = 0; slot < WINDOW_SIZE; slot += 1) {
      if (slot === WINDOW_CENTER) {
        continue;
      }

      if (LINE[(index * 4 + direction) * WINDOW_SIZE + slot] < 0) {
        code += CELL_WALL * POW4[slot];
      }
    }

    INITIAL_CODES[index * 4 + direction] = code;
  }
}

// Zobrist keys from a seeded xorshift so replays and tests stay reproducible.
const ZOBRIST_A = new Int32Array(AREA * 3);
const ZOBRIST_B = new Int32Array(AREA * 3);

let seed = 0x9e3779b9;

function nextRandomInt(): number {
  seed ^= seed << 13;
  seed ^= seed >>> 17;
  seed ^= seed << 5;
  return seed | 0;
}

for (let i = 0; i < AREA * 3; i += 1) {
  ZOBRIST_A[i] = nextRandomInt();
  ZOBRIST_B[i] = nextRandomInt();
}

function capped(value: number): number {
  return value > EVAL_CAP ? EVAL_CAP : value;
}

// The four direction patterns of one point are packed into a 12-bit key (3 bits
// each), so combining them into a score plus threat flags is a single table
// lookup instead of a branch chain — and a stone only ever changes one of the
// four patterns of a neighbour, which keeps the incremental update tiny.
const COMBINE_SIZE = 1 << 12;
const COMBINE_SCORE = new Int32Array(COMBINE_SIZE);
const COMBINE_FLAGS = new Uint8Array(COMBINE_SIZE);

for (let key = 0; key < COMBINE_SIZE; key += 1) {
  let five = 0;
  let openFour = 0;
  let four = 0;
  let openThree = 0;
  let sleepThree = 0;
  let openTwo = 0;
  let two = 0;

  for (let direction = 0; direction < 4; direction += 1) {
    switch ((key >> (direction * 3)) & 7) {
      case PATTERN_FIVE:
        five += 1;
        break;
      case PATTERN_OPEN_FOUR:
        openFour += 1;
        four += 1;
        break;
      case PATTERN_FOUR:
        four += 1;
        break;
      case PATTERN_OPEN_THREE:
        openThree += 1;
        break;
      case PATTERN_SLEEP_THREE:
        sleepThree += 1;
        break;
      case PATTERN_OPEN_TWO:
        openTwo += 1;
        break;
      case PATTERN_TWO:
        two += 1;
        break;
      default:
        break;
    }
  }

  let flags = 0;

  if (five > 0) {
    flags |= FLAG_FIVE;
  }
  if (openFour > 0) {
    flags |= FLAG_OPEN_FOUR;
  }
  if (four > 0) {
    flags |= FLAG_FOUR;
  }
  if (openThree > 0) {
    flags |= FLAG_OPEN_THREE;
  }
  if (four >= 2 || (four >= 1 && openThree >= 1) || openThree >= 2) {
    flags |= FLAG_FORK;
  }

  COMBINE_FLAGS[key] = flags;

  if (five > 0) {
    COMBINE_SCORE[key] = SCORE_FIVE;
  } else if (openFour > 0) {
    COMBINE_SCORE[key] = SCORE_OPEN_FOUR;
  } else if (four >= 2) {
    COMBINE_SCORE[key] = SCORE_DOUBLE_FOUR;
  } else if (four >= 1 && openThree >= 1) {
    COMBINE_SCORE[key] = SCORE_FOUR_THREE;
  } else if (openThree >= 2) {
    COMBINE_SCORE[key] = SCORE_DOUBLE_THREE;
  } else {
    COMBINE_SCORE[key] =
      four * SCORE_FOUR +
      openThree * SCORE_OPEN_THREE +
      sleepThree * SCORE_SLEEP_THREE +
      openTwo * SCORE_OPEN_TWO +
      two * SCORE_TWO;
  }
}

// Built on first use rather than at import time: the two 256 KB shape tables
// cost a few dozen milliseconds, and inside a worker that lands off the UI
// thread instead of on page load.
let BLACK_PATTERNS: Uint8Array = new Uint8Array(0);
let WHITE_PATTERNS: Uint8Array = new Uint8Array(0);

function ensurePatternTables(): void {
  if (BLACK_PATTERNS.length === 0) {
    BLACK_PATTERNS = getPatternTable(BLACK);
    WHITE_PATTERNS = getPatternTable(WHITE);
  }
}

export class GomokuBitboard {
  readonly cells = new Uint8Array(AREA);
  stoneCount = 0;
  hashA = 0;
  hashB = 0;

  private readonly codes = new Int32Array(INITIAL_CODES);
  private readonly near = new Uint8Array(AREA);
  // Packed 4-direction pattern key per point, maintained for every point (even
  // occupied ones) so a take-back restores the point without a full recompute.
  private readonly keyBlack = new Uint16Array(AREA);
  private readonly keyWhite = new Uint16Array(AREA);
  private readonly scoreBlack = new Int32Array(AREA);
  private readonly scoreWhite = new Int32Array(AREA);
  private readonly flagBlack = new Uint8Array(AREA);
  private readonly flagWhite = new Uint8Array(AREA);
  private readonly playedStack: number[] = [];
  private totalBlack = 0;
  private totalWhite = 0;

  constructor() {
    ensurePatternTables();
  }

  static fromBoard(board: GomokuBoard): GomokuBitboard {
    const bitboard = new GomokuBitboard();

    for (let row = 0; row < GOMOKU_BOARD_SIZE; row += 1) {
      for (let col = 0; col < GOMOKU_BOARD_SIZE; col += 1) {
        const cell = board[row]?.[col] ?? null;

        if (cell) {
          bitboard.place(indexOf(row, col), toStoneCode(cell));
        }
      }
    }

    // The setup moves are not part of the search tree and must not be undone.
    bitboard.playedStack.length = 0;
    return bitboard;
  }

  scoreOf(color: number): Int32Array {
    return color === BLACK ? this.scoreBlack : this.scoreWhite;
  }

  flagsOf(color: number): Uint8Array {
    return color === BLACK ? this.flagBlack : this.flagWhite;
  }

  totalOf(color: number): number {
    return color === BLACK ? this.totalBlack : this.totalWhite;
  }

  isEmpty(index: number): boolean {
    return this.cells[index] === EMPTY;
  }

  // A point is worth looking at once a stone sits within CANDIDATE_RADIUS.
  isCandidate(index: number): boolean {
    return this.cells[index] === EMPTY && this.near[index] > 0;
  }

  hasCandidates(): boolean {
    for (let index = 0; index < AREA; index += 1) {
      if (this.isCandidate(index)) {
        return true;
      }
    }

    return false;
  }

  place(index: number, color: number): void {
    this.cells[index] = color;
    this.stoneCount += 1;
    this.playedStack.push(index);

    const zobristSlot = index * 3 + color;
    this.hashA ^= ZOBRIST_A[zobristSlot];
    this.hashB ^= ZOBRIST_B[zobristSlot];

    this.clearScore(index);
    this.updateLines(index, color);
    this.updateNear(index, 1);
  }

  undo(): void {
    const index = this.playedStack.pop();

    if (index === undefined) {
      return;
    }

    const color = this.cells[index];
    this.cells[index] = EMPTY;
    this.stoneCount -= 1;

    const zobristSlot = index * 3 + color;
    this.hashA ^= ZOBRIST_A[zobristSlot];
    this.hashB ^= ZOBRIST_B[zobristSlot];

    this.updateLines(index, -color);
    this.updateNear(index, -1);
    // The point's own window never changed while it was occupied, so its packed
    // pattern keys are still valid and the score comes straight back.
    this.applyScore(index);
  }

  // Evaluation from `color`'s point of view. Deliberately antisymmetric —
  // evaluate(black) === -evaluate(white) — because negamax negates the child
  // score: weighting the enemy side even slightly heavier makes the two sides
  // disagree about the same position and the search plays measurably worse.
  evaluate(color: number): number {
    const own = color === BLACK ? this.totalBlack : this.totalWhite;
    const enemy = color === BLACK ? this.totalWhite : this.totalBlack;
    return own - enemy;
  }

  // `delta` is the colour digit when placing and its negation when taking back;
  // the window of a neighbour holds this stone at the mirrored slot. Only the
  // one direction that the stone lies on changes for each neighbour.
  private updateLines(index: number, delta: number): void {
    for (let direction = 0; direction < 4; direction += 1) {
      const lineBase = (index * 4 + direction) * WINDOW_SIZE;
      const shift = direction * 3;

      for (let slot = 0; slot < WINDOW_SIZE; slot += 1) {
        if (slot === WINDOW_CENTER) {
          continue;
        }

        const neighbor = LINE[lineBase + slot];

        if (neighbor < 0) {
          continue;
        }

        const codeIndex = neighbor * 4 + direction;
        const code = this.codes[codeIndex] + delta * POW4[WINDOW_SIZE - 1 - slot];
        this.codes[codeIndex] = code;

        const mask = ~(7 << shift);
        this.keyBlack[neighbor] =
          (this.keyBlack[neighbor] & mask) | (BLACK_PATTERNS[code] << shift);
        this.keyWhite[neighbor] =
          (this.keyWhite[neighbor] & mask) | (WHITE_PATTERNS[code] << shift);

        if (this.cells[neighbor] === EMPTY) {
          this.applyScore(neighbor);
        }
      }
    }
  }

  private updateNear(index: number, delta: number): void {
    const row = rowOf(index);
    const col = colOf(index);
    const minRow = Math.max(0, row - CANDIDATE_RADIUS);
    const maxRow = Math.min(GOMOKU_BOARD_SIZE - 1, row + CANDIDATE_RADIUS);
    const minCol = Math.max(0, col - CANDIDATE_RADIUS);
    const maxCol = Math.min(GOMOKU_BOARD_SIZE - 1, col + CANDIDATE_RADIUS);

    for (let r = minRow; r <= maxRow; r += 1) {
      for (let c = minCol; c <= maxCol; c += 1) {
        this.near[indexOf(r, c)] += delta;
      }
    }
  }

  /** Recomputes a point's score and flags from its packed pattern keys. */
  private applyScore(index: number): void {
    const nextBlack = COMBINE_SCORE[this.keyBlack[index]];
    const nextWhite = COMBINE_SCORE[this.keyWhite[index]];

    this.totalBlack += capped(nextBlack) - capped(this.scoreBlack[index]);
    this.totalWhite += capped(nextWhite) - capped(this.scoreWhite[index]);
    this.scoreBlack[index] = nextBlack;
    this.scoreWhite[index] = nextWhite;
    this.flagBlack[index] = COMBINE_FLAGS[this.keyBlack[index]];
    this.flagWhite[index] = COMBINE_FLAGS[this.keyWhite[index]];
  }

  /** An occupied point can never be played, so it contributes nothing. */
  private clearScore(index: number): void {
    this.totalBlack -= capped(this.scoreBlack[index]);
    this.totalWhite -= capped(this.scoreWhite[index]);
    this.scoreBlack[index] = 0;
    this.scoreWhite[index] = 0;
    this.flagBlack[index] = 0;
    this.flagWhite[index] = 0;
  }
}
