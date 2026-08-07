// Search engine behind the 棋神 / 天元 / 無極 levels. See `GOMOKU_AI.md`.
//
// Layers, cheapest first — each one only runs when the previous one found
// nothing, so easy positions cost almost nothing:
//
//   1. opening book (天元 / 無極)
//   2. immediate win / forced block
//   3. VCF   - victory by continuous fours: every attacking move is a four, so
//              the defender's reply is forced and the tree stays razor thin
//   4. VCT   - victory by continuous threats: fours *and* open threes, with the
//              defender allowed a small set of refutations (天元 / 無極)
//   5. iterative-deepening alpha-beta (PVS) with a transposition table,
//              killer moves, history ordering and forced-reply extensions
//
// Everything is bounded by a wall-clock deadline *and* a node limit, and the
// deepening loop keeps the best move from the last completed iteration, so a
// slow device just searches shallower instead of freezing.

import {
  AREA,
  FLAG_FIVE,
  FLAG_FOUR,
  FLAG_OPEN_FOUR,
  FLAG_OPEN_THREE,
  FLAG_FORK,
  GomokuBitboard,
  WHITE,
  colOf,
  indexOf,
  opposite,
  rowOf,
  toStoneCode,
} from './bitboard';
import { GOMOKU_BOARD_SIZE } from './engine';
import { lookupOpeningMove } from './openingBook';
import type { GomokuBoard, GomokuPosition, GomokuStone } from './types';

export interface GomokuSearchConfig {
  /** Upper bound for the iterative deepening loop (plies). */
  maxDepth: number;
  /** Wall-clock budget for the whole move, before device scaling. */
  timeBudgetMs: number;
  /** Hard node ceiling for the alpha-beta part. */
  nodeLimit: number;
  /** Branching width indexed by remaining depth (wider closer to the root). */
  widths: number[];
  /** Ply budget for the VCF solver; 0 disables it. */
  vcfDepth: number;
  /** Attack/defence pairs for the VCT solver; 0 disables it. */
  vctDepth: number;
  /** Fraction of the time budget the threat solvers may consume. */
  threatShare: number;
  vcfNodeLimit: number;
  vctNodeLimit: number;
  useOpeningBook: boolean;
  /**
   * Which part of the pipeline to run. 無極 splits the work across workers:
   * one runs `search` with the whole clock while others hunt for a proven win
   * in `threats` mode, instead of the two phases sharing one budget.
   */
  mode?: 'full' | 'search' | 'threats';
}

export interface GomokuSearchResult {
  index: number;
  score: number;
  depth: number;
  nodes: number;
  elapsedMs: number;
  via: 'book' | 'win' | 'block' | 'vcf' | 'vct' | 'search' | 'fallback' | 'none';
}

export const WIN_SCORE = 1_000_000_000;
const INFINITY_SCORE = WIN_SCORE * 2;
const MATE_BOUND = WIN_SCORE - 10_000;

const MAX_PLY = 64;
const MAX_THREAT_LEVEL = 48;
const THREAT_WIDTH = 24;
const VCT_ATTACK_WIDTH = 12;
const MAX_DEFENSE_WIDTH = 12;

const TT_BITS = 18;
const TT_SIZE = 1 << TT_BITS;
const TT_MASK = TT_SIZE - 1;
const TT_EMPTY = 0;
const TT_EXACT = 1;
const TT_LOWER = 2;
const TT_UPPER = 3;

const SIDE_KEY_A = 0x5bf03635 | 0;
const SIDE_KEY_B = 0x2545f491 | 0;

const ttKey = new Int32Array(TT_SIZE);
const ttScore = new Int32Array(TT_SIZE);
const ttMove = new Int16Array(TT_SIZE);
const ttDepth = new Int8Array(TT_SIZE);
const ttFlag = new Uint8Array(TT_SIZE);
const ttGeneration = new Uint8Array(TT_SIZE);
let currentGeneration = 0;

const MAX_BLOCKS = 8;
const blockBuf = new Int32Array(MAX_BLOCKS);
const moveBuf = new Int32Array(MAX_PLY * AREA);
const orderBuf = new Float64Array(MAX_PLY * AREA);
const threatBuf = new Int32Array(MAX_THREAT_LEVEL * THREAT_WIDTH);
const threatOrderBuf = new Float64Array(MAX_THREAT_LEVEL * THREAT_WIDTH);
const killers = new Int32Array(MAX_PLY * 2);
const history = new Int32Array(AREA * 3);

// Small nudge so the opening does not wander off into a corner when every
// candidate is otherwise worth zero.
const CENTER_BONUS = new Float64Array(AREA);

for (let index = 0; index < AREA; index += 1) {
  const center = (GOMOKU_BOARD_SIZE - 1) / 2;
  const distance = Math.abs(rowOf(index) - center) + Math.abs(colOf(index) - center);
  CENTER_BONUS[index] = Math.max(0, 14 - distance) * 4;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * Wipes the memory shared between searches (transposition table, killers,
 * history). Play keeps it on purpose — it is what makes the next move in a game
 * cheaper — but a test that wants a reproducible game has to start from a clean
 * table, otherwise the result depends on whatever ran before it.
 */
export function resetSearchMemory(): void {
  ttKey.fill(0);
  ttScore.fill(0);
  ttMove.fill(0);
  ttDepth.fill(0);
  ttFlag.fill(0);
  ttGeneration.fill(0);
  killers.fill(-1);
  history.fill(0);
  currentGeneration = 0;
}

// Mate scores are stored relative to the node they were found in, otherwise a
// transposition hit at a different ply would report the wrong mate distance.
function toStoredScore(score: number, ply: number): number {
  if (score > MATE_BOUND) {
    return score + ply;
  }
  if (score < -MATE_BOUND) {
    return score - ply;
  }
  return score;
}

function fromStoredScore(score: number, ply: number): number {
  if (score > MATE_BOUND) {
    return score - ply;
  }
  if (score < -MATE_BOUND) {
    return score + ply;
  }
  return score;
}

class GomokuSearcher {
  private readonly board: GomokuBitboard;
  private readonly color: number;
  private readonly enemy: number;
  private readonly config: GomokuSearchConfig;

  private deadline = 0;
  private threatDeadline = 0;
  private nodes = 0;
  private threatNodes = 0;
  private threatNodeLimit = 0;
  private aborted = false;
  private threatAborted = false;
  private generatedWin = false;
  private generatedForced = false;
  private fiveCount = 0;
  private firstFive = -1;
  private secondFive = -1;

  constructor(board: GomokuBitboard, color: number, config: GomokuSearchConfig) {
    this.board = board;
    this.color = color;
    this.enemy = opposite(color);
    this.config = config;
  }

  run(): GomokuSearchResult {
    const startedAt = now();
    this.deadline = startedAt + this.config.timeBudgetMs;

    const finish = (
      index: number,
      score: number,
      depth: number,
      via: GomokuSearchResult['via'],
    ): GomokuSearchResult => ({
      index,
      score,
      depth,
      nodes: this.nodes + this.threatNodes,
      elapsedMs: now() - startedAt,
      via,
    });

    const mode = this.config.mode ?? 'full';

    if (this.config.useOpeningBook && mode !== 'threats') {
      const bookMove = lookupOpeningMove(this.board, this.color);

      if (bookMove >= 0) {
        return finish(bookMove, 0, 0, 'book');
      }
    }

    if (this.board.stoneCount === 0) {
      const center = (GOMOKU_BOARD_SIZE - 1) / 2;
      return finish(indexOf(center, center), 0, 0, 'book');
    }

    const winning = this.findFlagged(this.color, FLAG_FIVE);

    if (winning >= 0) {
      return finish(winning, WIN_SCORE, 0, 'win');
    }

    // A single forced block needs no search at all; two of them mean the game
    // is already lost, so take the most useful one and play on.
    this.scanFives(this.enemy);

    if (this.fiveCount === 1) {
      return finish(this.firstFive, 0, 0, 'block');
    }

    if (this.fiveCount >= 2) {
      const scores = this.board.scoreOf(this.color);
      const pick =
        scores[this.firstFive] >= scores[this.secondFive] ? this.firstFive : this.secondFive;
      return finish(pick, -WIN_SCORE, 0, 'block');
    }

    if (mode !== 'search') {
      this.threatDeadline = Math.min(
        this.deadline,
        startedAt + this.config.timeBudgetMs * this.config.threatShare,
      );

      if (this.config.vcfDepth > 0) {
        this.beginThreatSearch(this.config.vcfNodeLimit);
        const vcfMove = this.vcf(this.color, this.config.vcfDepth, 0);

        if (vcfMove >= 0) {
          return finish(vcfMove, WIN_SCORE, this.config.vcfDepth, 'vcf');
        }
      }

      if (this.config.vctDepth > 0) {
        this.beginThreatSearch(this.config.vctNodeLimit);
        const vctMove = this.vct(this.color, this.config.vctDepth, 0);

        if (vctMove >= 0) {
          return finish(vctMove, WIN_SCORE, this.config.vctDepth, 'vct');
        }
      }
    }

    if (mode === 'threats') {
      // Nothing proven: the caller has a full search running elsewhere.
      return finish(-1, 0, 0, 'none');
    }

    currentGeneration = (currentGeneration + 1) & 0xff;
    killers.fill(-1);

    for (let i = 0; i < history.length; i += 1) {
      history[i] >>= 3;
    }

    let bestIndex = this.staticBest();
    let bestScore = 0;
    let bestDepth = 0;
    // Budget the deepening loop against the time the threat solvers left behind,
    // not against the whole move, or a long VCT would starve the main search.
    const searchStartedAt = now();
    const searchBudget = Math.max(0, this.deadline - searchStartedAt);

    for (let depth = 2; depth <= this.config.maxDepth; depth += 2) {
      // Do not start an iteration we almost certainly cannot finish.
      if (depth > 2 && now() - searchStartedAt > searchBudget * 0.5) {
        break;
      }

      const iteration = this.rootSearch(depth, bestIndex);

      if (iteration) {
        bestIndex = iteration.index;
        bestScore = iteration.score;
        bestDepth = depth;
      }

      if (this.aborted || bestScore > MATE_BOUND || bestScore < -MATE_BOUND) {
        break;
      }
    }

    if (bestIndex < 0) {
      return finish(this.staticBest(), 0, 0, 'fallback');
    }

    return finish(bestIndex, bestScore, bestDepth, 'search');
  }

  private beginThreatSearch(nodeLimit: number): void {
    this.threatNodes = 0;
    this.threatNodeLimit = nodeLimit;
    this.threatAborted = false;
  }

  private outOfBudget(): boolean {
    return this.nodes >= this.config.nodeLimit || now() >= this.deadline;
  }

  private outOfThreatBudget(): boolean {
    return this.threatNodes >= this.threatNodeLimit || now() >= this.threatDeadline;
  }

  private widthFor(depth: number): number {
    const widths = this.config.widths;
    const clamped = depth < 0 ? 0 : depth >= widths.length ? widths.length - 1 : depth;
    return widths[clamped];
  }

  /** Best move by static shape value only — the safety net for a timeout. */
  private staticBest(): number {
    const own = this.board.scoreOf(this.color);
    const enemy = this.board.scoreOf(this.enemy);
    let best = -1;
    let bestValue = -1;

    for (let index = 0; index < AREA; index += 1) {
      if (!this.board.isCandidate(index)) {
        continue;
      }

      const value = own[index] + enemy[index] * 0.9 + CENTER_BONUS[index];

      if (value > bestValue) {
        bestValue = value;
        best = index;
      }
    }

    return best;
  }

  private findFlagged(color: number, mask: number): number {
    const flags = this.board.flagsOf(color);

    for (let index = 0; index < AREA; index += 1) {
      if (this.board.isCandidate(index) && (flags[index] & mask) !== 0) {
        return index;
      }
    }

    return -1;
  }

  /** Records up to two points where `color` completes five. */
  private scanFives(color: number): void {
    const flags = this.board.flagsOf(color);
    this.fiveCount = 0;
    this.firstFive = -1;
    this.secondFive = -1;

    for (let index = 0; index < AREA; index += 1) {
      if (!this.board.isCandidate(index) || (flags[index] & FLAG_FIVE) === 0) {
        continue;
      }

      this.fiveCount += 1;

      if (this.firstFive < 0) {
        this.firstFive = index;
      } else if (this.secondFive < 0) {
        this.secondFive = index;
        return;
      }
    }
  }

  private selectThreats(
    color: number,
    mask: number,
    offset: number,
    limit: number,
  ): number {
    const flags = this.board.flagsOf(color);
    const scores = this.board.scoreOf(color);
    let count = 0;

    for (let index = 0; index < AREA; index += 1) {
      if (!this.board.isCandidate(index) || (flags[index] & mask) === 0) {
        continue;
      }

      const value = scores[index];

      if (count < limit) {
        let position = count;

        while (position > 0 && threatOrderBuf[offset + position - 1] < value) {
          threatOrderBuf[offset + position] = threatOrderBuf[offset + position - 1];
          threatBuf[offset + position] = threatBuf[offset + position - 1];
          position -= 1;
        }

        threatOrderBuf[offset + position] = value;
        threatBuf[offset + position] = index;
        count += 1;
      } else if (value > threatOrderBuf[offset + limit - 1]) {
        let position = limit - 1;

        while (position > 0 && threatOrderBuf[offset + position - 1] < value) {
          threatOrderBuf[offset + position] = threatOrderBuf[offset + position - 1];
          threatBuf[offset + position] = threatBuf[offset + position - 1];
          position -= 1;
        }

        threatOrderBuf[offset + position] = value;
        threatBuf[offset + position] = index;
      }
    }

    return count;
  }

  /**
   * Victory by continuous fours. Every attacking move threatens five, so the
   * defender has exactly one reply and the tree barely branches.
   */
  private vcf(color: number, depth: number, level: number): number {
    if (depth <= 0 || level >= MAX_THREAT_LEVEL - 2 || this.threatAborted || this.aborted) {
      return -1;
    }

    this.threatNodes += 1;

    if ((this.threatNodes & 63) === 0 && this.outOfThreatBudget()) {
      this.threatAborted = true;
      return -1;
    }

    const board = this.board;
    const enemy = opposite(color);
    const immediate = this.findFlagged(color, FLAG_FIVE);

    if (immediate >= 0) {
      return immediate;
    }

    // The defender completes five before any of our fours can land.
    if (this.findFlagged(enemy, FLAG_FIVE) >= 0) {
      return -1;
    }

    const offset = level * THREAT_WIDTH;
    const count = this.selectThreats(color, FLAG_FOUR, offset, THREAT_WIDTH);

    for (let i = 0; i < count; i += 1) {
      const move = threatBuf[offset + i];
      board.place(move, color);

      if (this.findFlagged(enemy, FLAG_FIVE) >= 0) {
        board.undo();
        continue;
      }

      this.scanFives(color);

      if (this.fiveCount === 0) {
        board.undo();
        continue;
      }

      if (this.fiveCount >= 2) {
        // Open four (or double four) and the defender has no five of their own.
        board.undo();
        return move;
      }

      board.place(this.firstFive, enemy);
      const continuation = this.vcf(color, depth - 1, level + 1);
      board.undo();
      board.undo();

      if (continuation >= 0) {
        return move;
      }

      if (this.threatAborted || this.aborted) {
        return -1;
      }
    }

    return -1;
  }

  /**
   * Defender replies that must be refuted for a threat move to be a real win.
   * Returns 0 when nothing stops the threat and -1 when the set is too wide to
   * prove (treated as "not a win" rather than assuming one).
   */
  private collectDefenses(attacker: number, defender: number, offset: number): number {
    this.scanFives(attacker);

    if (this.fiveCount >= 2) {
      return 0;
    }

    if (this.fiveCount === 1) {
      threatBuf[offset] = this.firstFive;
      return 1;
    }

    const attackerFlags = this.board.flagsOf(attacker);
    const defenderFlags = this.board.flagsOf(defender);
    let count = 0;

    for (let index = 0; index < AREA; index += 1) {
      if (!this.board.isCandidate(index)) {
        continue;
      }

      // Squares that carry the attack (would become an open four or a four on
      // the threat line) plus the defender's own counter-fours: occupying one of
      // these is the only way to change what the attacker is threatening.
      const relevant =
        (attackerFlags[index] & (FLAG_OPEN_FOUR | FLAG_FOUR)) !== 0 ||
        (defenderFlags[index] & FLAG_FOUR) !== 0;

      if (!relevant) {
        continue;
      }

      if (count >= MAX_DEFENSE_WIDTH) {
        return -1;
      }

      threatBuf[offset + count] = index;
      count += 1;
    }

    return count === 0 ? -1 : count;
  }

  /**
   * Victory by continuous threats: fours, open threes and forks. The defender
   * gets a bounded set of refutations; if it cannot be bounded we give up on
   * proving this line instead of claiming a win we cannot back up.
   */
  private vct(color: number, depth: number, level: number): number {
    if (
      depth <= 0 ||
      level >= MAX_THREAT_LEVEL - 3 ||
      this.threatAborted ||
      this.aborted
    ) {
      return -1;
    }

    this.threatNodes += 1;

    if ((this.threatNodes & 63) === 0 && this.outOfThreatBudget()) {
      this.threatAborted = true;
      return -1;
    }

    const board = this.board;
    const enemy = opposite(color);
    const immediate = this.findFlagged(color, FLAG_FIVE);

    if (immediate >= 0) {
      return immediate;
    }

    if (this.findFlagged(enemy, FLAG_FIVE) >= 0) {
      return -1;
    }

    const forcedWin = this.vcf(color, Math.min(this.config.vcfDepth, depth * 2), level);

    if (forcedWin >= 0) {
      return forcedWin;
    }

    const offset = level * THREAT_WIDTH;
    const count = this.selectThreats(
      color,
      FLAG_FOUR | FLAG_OPEN_THREE | FLAG_FORK,
      offset,
      VCT_ATTACK_WIDTH,
    );

    for (let i = 0; i < count; i += 1) {
      const move = threatBuf[offset + i];
      board.place(move, color);
      let proven = false;

      if (this.findFlagged(enemy, FLAG_FIVE) < 0) {
        const defenseOffset = (level + 1) * THREAT_WIDTH;
        const defenseCount = this.collectDefenses(color, enemy, defenseOffset);

        if (defenseCount === 0) {
          proven = true;
        } else if (defenseCount > 0) {
          proven = true;

          for (let j = 0; j < defenseCount; j += 1) {
            board.place(threatBuf[defenseOffset + j], enemy);
            const continuation = this.vct(color, depth - 1, level + 2);
            board.undo();

            if (continuation < 0) {
              proven = false;
              break;
            }
          }
        }
      }

      board.undo();

      if (proven) {
        return move;
      }

      if (this.threatAborted || this.aborted) {
        return -1;
      }
    }

    return -1;
  }

  private generate(ply: number, color: number, ttMoveIndex: number, limit: number): number {
    const board = this.board;
    const enemy = opposite(color);
    const ownFlags = board.flagsOf(color);
    const enemyFlags = board.flagsOf(enemy);
    const ownScore = board.scoreOf(color);
    const enemyScore = board.scoreOf(enemy);
    const offset = ply * AREA;

    this.generatedWin = false;
    this.generatedForced = false;

    const killerA = killers[ply * 2];
    const killerB = killers[ply * 2 + 1];
    const historyBase = color * AREA;
    let blocks = 0;
    let count = 0;

    // One pass over the board: spot an immediate win, remember every point where
    // the enemy would complete five, and order the rest as we go.
    for (let index = 0; index < AREA; index += 1) {
      if (!board.isCandidate(index)) {
        continue;
      }

      if ((ownFlags[index] & FLAG_FIVE) !== 0) {
        moveBuf[offset] = index;
        this.generatedWin = true;
        return 1;
      }

      if ((enemyFlags[index] & FLAG_FIVE) !== 0) {
        if (blocks < MAX_BLOCKS) {
          blockBuf[blocks] = index;
        }
        blocks += 1;
        continue;
      }

      let value =
        ownScore[index] +
        enemyScore[index] * 0.9 +
        CENTER_BONUS[index] +
        history[historyBase + index] * 0.002;

      if (index === ttMoveIndex) {
        value += 1e12;
      } else if (index === killerA) {
        value += 5e5;
      } else if (index === killerB) {
        value += 4e5;
      }

      if (count < limit) {
        let position = count;

        while (position > 0 && orderBuf[offset + position - 1] < value) {
          orderBuf[offset + position] = orderBuf[offset + position - 1];
          moveBuf[offset + position] = moveBuf[offset + position - 1];
          position -= 1;
        }

        orderBuf[offset + position] = value;
        moveBuf[offset + position] = index;
        count += 1;
      } else if (value > orderBuf[offset + limit - 1]) {
        let position = limit - 1;

        while (position > 0 && orderBuf[offset + position - 1] < value) {
          orderBuf[offset + position] = orderBuf[offset + position - 1];
          moveBuf[offset + position] = moveBuf[offset + position - 1];
          position -= 1;
        }

        orderBuf[offset + position] = value;
        moveBuf[offset + position] = index;
      }
    }

    if (blocks > 0) {
      // Only occupying the point helps: a counter-four still loses the race.
      const kept = blocks > MAX_BLOCKS ? MAX_BLOCKS : blocks;

      for (let i = 0; i < kept; i += 1) {
        moveBuf[offset + i] = blockBuf[i];
      }

      this.generatedForced = blocks === 1;
      return kept;
    }

    return count;
  }

  private rootSearch(depth: number, preferred: number): { index: number; score: number } | null {
    const board = this.board;
    const count = this.generate(0, this.color, preferred, this.widthFor(depth));

    if (count === 0) {
      return null;
    }

    if (this.generatedWin) {
      return { index: moveBuf[0], score: WIN_SCORE };
    }

    const extension = this.generatedForced ? 1 : 0;
    let alpha = -INFINITY_SCORE;
    let best = -INFINITY_SCORE;
    let bestIndex = moveBuf[0];

    for (let i = 0; i < count; i += 1) {
      const move = moveBuf[i];
      const childDepth = depth - 1 + extension;
      board.place(move, this.color);

      let score: number;

      if (i === 0) {
        score = -this.negamax(childDepth, -INFINITY_SCORE, -alpha, 1, this.enemy);
      } else {
        score = -this.negamax(childDepth, -alpha - 1, -alpha, 1, this.enemy);

        if (!this.aborted && score > alpha) {
          score = -this.negamax(childDepth, -INFINITY_SCORE, -alpha, 1, this.enemy);
        }
      }

      board.undo();

      if (this.aborted) {
        break;
      }

      if (score > best) {
        best = score;
        bestIndex = move;
      }

      if (score > alpha) {
        alpha = score;
      }
    }

    if (best <= -INFINITY_SCORE) {
      return null;
    }

    return { index: bestIndex, score: best };
  }

  private negamax(
    depth: number,
    alpha: number,
    beta: number,
    ply: number,
    color: number,
  ): number {
    if (this.aborted) {
      return 0;
    }

    this.nodes += 1;

    if ((this.nodes & 255) === 0 && this.outOfBudget()) {
      this.aborted = true;
      return 0;
    }

    const board = this.board;

    if (ply >= MAX_PLY - 1) {
      return board.evaluate(color);
    }

    const slot = (board.hashA ^ (color === WHITE ? SIDE_KEY_A : 0)) & TT_MASK;
    const verify = (board.hashB ^ (color === WHITE ? SIDE_KEY_B : 0)) | 0;
    let ttMoveIndex = -1;

    if (ttFlag[slot] !== TT_EMPTY && ttKey[slot] === verify) {
      ttMoveIndex = ttMove[slot];

      if (ttDepth[slot] >= depth) {
        const stored = fromStoredScore(ttScore[slot], ply);
        const flag = ttFlag[slot];

        if (
          flag === TT_EXACT ||
          (flag === TT_LOWER && stored >= beta) ||
          (flag === TT_UPPER && stored <= alpha)
        ) {
          return stored;
        }
      }
    }

    if (depth <= 0) {
      const evaluation = board.evaluate(color);
      return evaluation > MATE_BOUND
        ? MATE_BOUND
        : evaluation < -MATE_BOUND
          ? -MATE_BOUND
          : evaluation;
    }

    const count = this.generate(ply, color, ttMoveIndex, this.widthFor(depth));

    if (count === 0) {
      return 0;
    }

    if (this.generatedWin) {
      return WIN_SCORE - ply;
    }

    const offset = ply * AREA;
    const enemy = opposite(color);
    // A single forced reply costs no real depth, so let the line run deeper.
    const extension = this.generatedForced && ply < MAX_PLY - 8 ? 1 : 0;
    const originalAlpha = alpha;
    let best = -INFINITY_SCORE;
    let bestMove = moveBuf[offset];

    for (let i = 0; i < count; i += 1) {
      const move = moveBuf[offset + i];
      const childDepth = depth - 1 + extension;
      board.place(move, color);

      let score: number;

      if (i === 0) {
        score = -this.negamax(childDepth, -beta, -alpha, ply + 1, enemy);
      } else {
        score = -this.negamax(childDepth, -alpha - 1, -alpha, ply + 1, enemy);

        if (!this.aborted && score > alpha && score < beta) {
          score = -this.negamax(childDepth, -beta, -alpha, ply + 1, enemy);
        }
      }

      board.undo();

      if (this.aborted) {
        return best > -INFINITY_SCORE ? best : 0;
      }

      if (score > best) {
        best = score;
        bestMove = move;
      }

      if (score > alpha) {
        alpha = score;
      }

      if (alpha >= beta) {
        if (killers[ply * 2] !== move) {
          killers[ply * 2 + 1] = killers[ply * 2];
          killers[ply * 2] = move;
        }

        history[color * AREA + move] += depth * depth;
        break;
      }
    }

    const flag = best <= originalAlpha ? TT_UPPER : best >= beta ? TT_LOWER : TT_EXACT;

    if (ttGeneration[slot] !== currentGeneration || ttDepth[slot] <= depth) {
      ttKey[slot] = verify;
      ttScore[slot] = toStoredScore(best, ply) | 0;
      ttMove[slot] = bestMove;
      ttDepth[slot] = depth;
      ttFlag[slot] = flag;
      ttGeneration[slot] = currentGeneration;
    }

    return best;
  }
}

function deviceScale(): number {
  const cores =
    typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency === 'number'
      ? navigator.hardwareConcurrency
      : 0;

  if (cores <= 0) {
    return 1;
  }

  if (cores <= 2) {
    return 0.45;
  }

  if (cores <= 4) {
    return 0.65;
  }

  return 1;
}

/** Applies device scaling to a level's budget. Depth is left alone: the clock
 *  already limits how deep a slow device gets. */
export function scaleConfig(config: GomokuSearchConfig): GomokuSearchConfig {
  const scale = deviceScale();

  if (scale === 1) {
    return config;
  }

  return {
    ...config,
    timeBudgetMs: Math.round(config.timeBudgetMs * scale),
    nodeLimit: Math.round(config.nodeLimit * scale),
    vcfNodeLimit: Math.round(config.vcfNodeLimit * scale),
    vctNodeLimit: Math.round(config.vctNodeLimit * scale),
  };
}

export function searchBestMove(
  board: GomokuBoard,
  stone: GomokuStone,
  config: GomokuSearchConfig,
): GomokuSearchResult | null {
  const bitboard = GomokuBitboard.fromBoard(board);
  const color = toStoneCode(stone);

  if (bitboard.stoneCount > 0 && !bitboard.hasCandidates()) {
    return null;
  }

  // A `threats` run legitimately comes back empty (via 'none'); callers decide
  // what to do with that, so the result is passed through as-is.
  return new GomokuSearcher(bitboard, color, config).run();
}

export function toPosition(index: number): GomokuPosition {
  return { row: rowOf(index), col: colOf(index) };
}
