import type {
  Board,
  PieceColor,
  Position,
} from '../types';
import { PIECE_RANK } from '../types';
import {
  getValidMoves,
  getValidFlips,
  movePiece,
  flipPiece,
  countPieces,
  countUnrevealed,
  checkWinner,
} from './engine';

const ROWS = 4;
const COLS = 8;

export interface AIMove {
  type: 'flip' | 'move';
  pos?: Position;
  from?: Position;
  to?: Position;
}

function evaluateBoard(board: Board, aiColor: PieceColor): number {
  let score = 0;

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cell = board[row][col];
      if (cell && cell.revealed) {
        const value = PIECE_RANK[cell.type] * 10;
        if (cell.color === aiColor) {
          score += value;
        } else {
          score -= value;
        }
      }
    }
  }

  const aiCount = countPieces(board, aiColor);
  const oppCount = countPieces(board, aiColor === 'red' ? 'black' : 'red');
  score += (aiCount - oppCount) * 5;

  const unrevealed = countUnrevealed(board);
  score += unrevealed * 2;

  return score;
}

function getAllPossibleMoves(
  board: Board,
  color: PieceColor
): { move: AIMove; newBoard: Board }[] {
  const results: { move: AIMove; newBoard: Board }[] = [];

  const flips = getValidFlips(board);
  for (const pos of flips) {
    results.push({
      move: { type: 'flip', pos },
      newBoard: flipPiece(board, pos),
    });
  }

  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cell = board[row][col];
      if (cell && cell.revealed && cell.color === color) {
        const moves = getValidMoves(board, { row, col }, color);
        for (const to of moves) {
          results.push({
            move: {
              type: 'move',
              from: { row, col },
              to,
            },
            newBoard: movePiece(board, { row, col }, to),
          });
        }
      }
    }
  }

  return results;
}

function minimax(
  board: Board,
  depth: number,
  isMaximizing: boolean,
  aiColor: PieceColor,
  alpha: number,
  beta: number
): number {
  const winner = checkWinner(board);
  if (winner === aiColor) return 10000 + depth;
  if (winner && winner !== aiColor) return -10000 - depth;

  if (depth === 0) {
    return evaluateBoard(board, aiColor);
  }

  const currentColor: PieceColor = isMaximizing ? aiColor : (aiColor === 'red' ? 'black' : 'red');
  const possibleMoves = getAllPossibleMoves(board, currentColor);

  if (possibleMoves.length === 0) {
    return isMaximizing ? -1000 : 1000;
  }

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const { newBoard } of possibleMoves) {
      const evalScore = minimax(newBoard, depth - 1, false, aiColor, alpha, beta);
      maxEval = Math.max(maxEval, evalScore);
      alpha = Math.max(alpha, evalScore);
      if (beta <= alpha) break;
    }
    return maxEval;
  } else {
    let minEval = Infinity;
    for (const { newBoard } of possibleMoves) {
      const evalScore = minimax(newBoard, depth - 1, true, aiColor, alpha, beta);
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

  const depthMap = { normal: 3, hard: 4, master: 5 };
  const depth = depthMap[difficulty] || 2;

  let bestMove = possibleMoves[0].move;
  let bestScore = -Infinity;

  for (const { move, newBoard } of possibleMoves) {
    const score = minimax(newBoard, depth - 1, false, aiColor, -Infinity, Infinity);
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return bestMove;
}
