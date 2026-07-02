import type {
  Board,
  PieceColor,
  Position,
} from '../types';
import { oppositeColor } from '../types';
import {
  getValidMoves,
  movePiece,
  checkWinner,
  isInCheck,
} from './engine';

const ROWS = 10;
const COLS = 9;

export interface AIMove {
  from: Position;
  to: Position;
}

const PIECE_VALUES: Record<string, number> = {
  general: 10000,
  chariot: 900,
  cannon: 450,
  horse: 400,
  elephant: 200,
  advisor: 200,
  soldier: 100,
};

// Score returned when a side's general is captured, at search depth 0. minimax
// adds the remaining depth so faster mates outrank slower ones.
const TERMINAL_WIN_SCORE = 100000;

const SOLDIER_PST: number[][] = [
  [0,  0,  0,  0,  0,  0,  0,  0,  0],
  [10, 10, 10, 12, 14, 12, 10, 10, 10],
  [10, 10, 10, 12, 14, 12, 10, 10, 10],
  [14, 16, 18, 20, 24, 20, 18, 16, 14],
  [16, 20, 24, 28, 32, 28, 24, 20, 16],
  [16, 20, 24, 28, 32, 28, 24, 20, 16],
  [14, 16, 18, 20, 24, 20, 18, 16, 14],
  [10, 10, 10, 12, 14, 12, 10, 10, 10],
  [10, 10, 10, 12, 14, 12, 10, 10, 10],
  [0,   0,  0,  0,  0,  0,  0,  0,  0],
];

const HORSE_PST: number[][] = [
  [0, -4,  0,  4,  8,  4,  0, -4,  0],
  [0,  4,  8, 10, 12, 10,  8,  4,  0],
  [4,  8, 12, 14, 16, 14, 12,  8,  4],
  [4,  8, 12, 14, 16, 14, 12,  8,  4],
  [4,  8, 12, 14, 16, 14, 12,  8,  4],
  [4,  8, 12, 14, 16, 14, 12,  8,  4],
  [4,  8, 12, 14, 16, 14, 12,  8,  4],
  [4,  8, 12, 14, 16, 14, 12,  8,  4],
  [0,  4,  8, 10, 12, 10,  8,  4,  0],
  [0, -4,  0,  4,  8,  4,  0, -4,  0],
];

const CANNON_PST: number[][] = [
  [0,  0,  0, -2,  0, -2,  0,  0,  0],
  [0,  0,  0,  0,  0,  0,  0,  0,  0],
  [0,  0,  0,  2,  4,  2,  0,  0,  0],
  [0,  0,  0,  2,  4,  2,  0,  0,  0],
  [0,  0,  0,  0,  0,  0,  0,  0,  0],
  [0,  0,  0,  0,  0,  0,  0,  0,  0],
  [0,  0,  0,  2,  4,  2,  0,  0,  0],
  [0,  0,  0,  2,  4,  2,  0,  0,  0],
  [0,  0,  0,  0,  0,  0,  0,  0,  0],
  [0,  0,  0, -2,  0, -2,  0,  0,  0],
];

const CHARIOT_PST: number[][] = [
  [0,  0,  0,  2,  4,  2,  0,  0,  0],
  [0,  0,  0,  2,  4,  2,  0,  0,  0],
  [0,  0,  0,  2,  4,  2,  0,  0,  0],
  [0,  0,  0,  2,  4,  2,  0,  0,  0],
  [0,  0,  0,  2,  4,  2,  0,  0,  0],
  [0,  0,  0,  2,  4,  2,  0,  0,  0],
  [0,  0,  0,  2,  4,  2,  0,  0,  0],
  [0,  0,  0,  2,  4,  2,  0,  0,  0],
  [0,  0,  0,  2,  4,  2,  0,  0,  0],
  [0,  0,  0,  2,  4,  2,  0,  0,  0],
];

const ADVISOR_PST: number[][] = [
  [0,  0,  0,  0,  0,  0,  0,  0,  0],
  [0,  0,  0,  0,  0,  0,  0,  0,  0],
  [0,  0,  0,  0,  0,  0,  0,  0,  0],
  [0,  0,  0,  0,  0,  0,  0,  0,  0],
  [0,  0,  0,  0,  0,  0,  0,  0,  0],
  [0,  0,  0,  0,  0,  0,  0,  0,  0],
  [0,  0,  0,  0,  0,  0,  0,  0,  0],
  [0,  0,  0,  2,  0,  2,  0,  0,  0],
  [0,  0,  0,  0,  4,  0,  0,  0,  0],
  [0,  0,  0,  2,  0,  2,  0,  0,  0],
];

const ELEPHANT_PST: number[][] = [
  [0,  0,  0,  0,  0,  0,  0,  0,  0],
  [0,  0,  0,  0,  0,  0,  0,  0,  0],
  [0,  0,  0,  0,  0,  0,  0,  0,  0],
  [0,  0,  0,  0,  0,  0,  0,  0,  0],
  [0,  0,  0,  0,  0,  0,  0,  0,  0],
  [0,  0,  0,  0,  0,  0,  0,  0,  0],
  [0,  0,  0,  0,  0,  0,  0,  0,  0],
  [0,  0,  0,  0,  0,  0,  0,  0,  0],
  [0,  0,  2,  0,  0,  0,  2,  0,  0],
  [0,  0,  0,  0,  4,  0,  0,  0,  0],
];

const GENERAL_PST: number[][] = [
  [0,  0,  0,  0,  0,  0,  0,  0,  0],
  [0,  0,  0,  0,  0,  0,  0,  0,  0],
  [0,  0,  0,  0,  0,  0,  0,  0,  0],
  [0,  0,  0,  0,  0,  0,  0,  0,  0],
  [0,  0,  0,  0,  0,  0,  0,  0,  0],
  [0,  0,  0,  0,  0,  0,  0,  0,  0],
  [0,  0,  0,  0,  0,  0,  0,  0,  0],
  [0,  0,  0,  2,  0,  2,  0,  0,  0],
  [0,  0,  0,  0,  4,  0,  0,  0,  0],
  [0,  0,  0,  2,  0,  2,  0,  0,  0],
];

const PST_MAP: Record<string, number[][]> = {
  soldier: SOLDIER_PST,
  horse: HORSE_PST,
  cannon: CANNON_PST,
  chariot: CHARIOT_PST,
  advisor: ADVISOR_PST,
  elephant: ELEPHANT_PST,
  general: GENERAL_PST,
};

function getPST(pieceType: string, row: number, col: number, color: PieceColor): number {
  const pst = PST_MAP[pieceType];
  if (!pst) return 0;
  const adjustedRow = color === 'red' ? 9 - row : row;
  return pst[adjustedRow][col];
}

function countMobility(board: Board, color: PieceColor): number {
  let count = 0;
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = board[r][c];
      if (cell && cell.color === color) {
        count += getValidMoves(board, { row: r, col: c }).length;
      }
    }
  }
  return count;
}

function evaluateBoard(board: Board, aiColor: PieceColor): number {
  let score = 0;
  const opponent = oppositeColor(aiColor);

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cell = board[row][col];
      if (cell) {
        const material = PIECE_VALUES[cell.type];
        const positional = getPST(cell.type, row, col, cell.color);
        const value = material + positional;
        if (cell.color === aiColor) score += value;
        else score -= value;
      }
    }
  }

  const aiMobility = countMobility(board, aiColor);
  const oppMobility = countMobility(board, opponent);
  score += (aiMobility - oppMobility) * 2;

  if (isInCheck(board, opponent)) score += 30;
  if (isInCheck(board, aiColor)) score -= 30;

  return score;
}

function getAllPossibleMoves(
  board: Board,
  color: PieceColor
): { move: AIMove; newBoard: Board }[] {
  const results: { move: AIMove; newBoard: Board }[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = board[r][c];
      if (cell && cell.color === color) {
        const moves = getValidMoves(board, { row: r, col: c });
        for (const to of moves) {
          results.push({
            move: { from: { row: r, col: c }, to },
            newBoard: movePiece(board, { row: r, col: c }, to),
          });
        }
      }
    }
  }
  return results;
}

function getCaptureMoves(
  board: Board,
  color: PieceColor
): { move: AIMove; newBoard: Board }[] {
  const results: { move: AIMove; newBoard: Board }[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = board[r][c];
      if (cell && cell.color === color) {
        const moves = getValidMoves(board, { row: r, col: c });
        for (const to of moves) {
          if (board[to.row][to.col]) {
            results.push({
              move: { from: { row: r, col: c }, to },
              newBoard: movePiece(board, { row: r, col: c }, to),
            });
          }
        }
      }
    }
  }
  return results;
}

function quiescenceSearch(
  board: Board,
  alpha: number,
  beta: number,
  aiColor: PieceColor,
  isMaximizing: boolean,
  nodeCount: { count: number },
  maxNodes: number
): number {
  nodeCount.count++;
  if (nodeCount.count > maxNodes) {
    return evaluateBoard(board, aiColor);
  }

  // A captured general is terminal even inside the capture-only search, so
  // score it as a mate rather than as raw material (see B11).
  const winner = checkWinner(board);
  if (winner === aiColor) return TERMINAL_WIN_SCORE;
  if (winner && winner !== aiColor) return -TERMINAL_WIN_SCORE;

  const standPat = evaluateBoard(board, aiColor);

  if (isMaximizing) {
    if (standPat >= beta) return beta;
    if (standPat > alpha) alpha = standPat;
  } else {
    if (standPat <= alpha) return alpha;
    if (standPat < beta) beta = standPat;
  }

  const currentColor: PieceColor = isMaximizing ? aiColor : oppositeColor(aiColor);
  const captureMoves = getCaptureMoves(board, currentColor);

  captureMoves.sort((a, b) => {
    const targetA = board[a.move.to.row][a.move.to.col];
    const targetB = board[b.move.to.row][b.move.to.col];
    const valA = targetA ? PIECE_VALUES[targetA.type] : 0;
    const valB = targetB ? PIECE_VALUES[targetB.type] : 0;
    return valB - valA;
  });

  if (isMaximizing) {
    for (const { newBoard } of captureMoves) {
      if (nodeCount.count > maxNodes) break;
      const score = quiescenceSearch(newBoard, alpha, beta, aiColor, false, nodeCount, maxNodes);
      if (score >= beta) return beta;
      if (score > alpha) alpha = score;
    }
    return alpha;
  } else {
    for (const { newBoard } of captureMoves) {
      if (nodeCount.count > maxNodes) break;
      const score = quiescenceSearch(newBoard, alpha, beta, aiColor, true, nodeCount, maxNodes);
      if (score <= alpha) return alpha;
      if (score < beta) beta = score;
    }
    return beta;
  }
}

function minimax(
  board: Board,
  depth: number,
  isMaximizing: boolean,
  aiColor: PieceColor,
  alpha: number,
  beta: number,
  nodeCount: { count: number },
  maxNodes: number
): number {
  nodeCount.count++;
  if (nodeCount.count > maxNodes) {
    return evaluateBoard(board, aiColor);
  }

  const winner = checkWinner(board);
  if (winner === aiColor) return TERMINAL_WIN_SCORE + depth;
  if (winner && winner !== aiColor) return -TERMINAL_WIN_SCORE - depth;

  if (depth === 0) {
    return quiescenceSearch(board, alpha, beta, aiColor, isMaximizing, nodeCount, maxNodes);
  }

  const currentColor: PieceColor = isMaximizing ? aiColor : oppositeColor(aiColor);
  const possibleMoves = getAllPossibleMoves(board, currentColor);

  if (possibleMoves.length === 0) {
    // The side to move has no legal moves and loses. Use the same magnitude and
    // depth-based mate distance as checkWinner so terminals rank consistently (B11).
    return isMaximizing ? -(TERMINAL_WIN_SCORE + depth) : TERMINAL_WIN_SCORE + depth;
  }

  possibleMoves.sort((a, b) => {
    const targetA = board[a.move.to.row][a.move.to.col];
    const targetB = board[b.move.to.row][b.move.to.col];
    const valA = targetA ? PIECE_VALUES[targetA.type] : 0;
    const valB = targetB ? PIECE_VALUES[targetB.type] : 0;
    return valB - valA;
  });

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const { newBoard } of possibleMoves) {
      const evalScore = minimax(newBoard, depth - 1, false, aiColor, alpha, beta, nodeCount, maxNodes);
      if (nodeCount.count > maxNodes) return evalScore;
      maxEval = Math.max(maxEval, evalScore);
      alpha = Math.max(alpha, evalScore);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const { newBoard } of possibleMoves) {
      const evalScore = minimax(newBoard, depth - 1, true, aiColor, alpha, beta, nodeCount, maxNodes);
      if (nodeCount.count > maxNodes) return evalScore;
      minEval = Math.min(minEval, evalScore);
      beta = Math.min(beta, evalScore);
      if (beta <= alpha) break;
    }
    return minEval;
  }
}

export function getAIMove(
  board: Board,
  aiColor: PieceColor,
  difficulty: 'easy' | 'normal' | 'hard' | 'master'
): AIMove | null {
  const possibleMoves = getAllPossibleMoves(board, aiColor);
  if (possibleMoves.length === 0) return null;

  if (difficulty === 'easy') {
    return possibleMoves[Math.floor(Math.random() * possibleMoves.length)].move;
  }

  const depthMap = { normal: 3, hard: 3, master: 4 };
  const maxDepth = depthMap[difficulty] || 3;

  // Node-count budget is the sole cutoff: it is deterministic (independent of
  // machine speed / wall clock), so the same board always yields the same move (B13).
  const nodeLimits = { normal: 200000, hard: 250000, master: 300000 };
  const maxNodes = nodeLimits[difficulty] || 200000;

  let bestMove = possibleMoves[0].move;
  const nodeCount = { count: 0 };

  const orderedMoves = possibleMoves;

  for (let depth = 1; depth <= maxDepth; depth++) {
    let iterationBestMove = bestMove;
    let iterationBestScore = -Infinity;
    let iterationComplete = false;

    for (const { move, newBoard } of orderedMoves) {
      if (nodeCount.count > maxNodes) break;
      const score = minimax(newBoard, depth - 1, false, aiColor, -Infinity, Infinity, nodeCount, maxNodes);
      if (nodeCount.count > maxNodes) break;
      if (score > iterationBestScore) {
        iterationBestScore = score;
        iterationBestMove = move;
      }
    }

    if (iterationBestScore > -Infinity && iterationBestScore < Infinity) {
      iterationComplete = true;
      bestMove = iterationBestMove;
    }

    if (!iterationComplete) break;

    orderedMoves.sort((a, b) => {
      if (a.move === bestMove) return -1;
      if (b.move === bestMove) return 1;
      return 0;
    });
  }

  return bestMove;
}
