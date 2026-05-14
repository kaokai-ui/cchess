import type {
  Board,
  Piece,
  PieceColor,
  Position,
} from '../types';
import {
  canCapture,
  getValidMoves,
  getValidFlips,
  movePiece,
  countPieces,
  countUnrevealed,
  checkWinner,
} from './engine';

const ROWS = 4;
const COLS = 8;

const PIECE_VALUES: Record<Piece['type'], number> = {
  general: 70,
  advisor: 35,
  elephant: 30,
  horse: 25,
  chariot: 40,
  cannon: 28,
  soldier: 12,
};

const ROOT_PRIORITY = {
  flip: 0,
  move: 1,
  capture: 2,
} as const;

export interface AIMove {
  type: 'flip' | 'move';
  pos?: Position;
  from?: Position;
  to?: Position;
}

interface MoveCandidate {
  move: AIMove;
  newBoard: Board;
  movedPiece: Piece;
  capturedPiece: Piece | null;
}

interface ScoredMove {
  move: AIMove;
  score: number;
  priority: number;
}

interface RevealedPieceState {
  piece: Piece;
  pos: Position;
}

function otherColor(color: PieceColor): PieceColor {
  return color === 'red' ? 'black' : 'red';
}

function getAdjacentPositions(pos: Position): Position[] {
  const deltas = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];

  return deltas
    .map(([dr, dc]) => ({ row: pos.row + dr, col: pos.col + dc }))
    .filter((candidate) => (
      candidate.row >= 0 &&
      candidate.row < ROWS &&
      candidate.col >= 0 &&
      candidate.col < COLS
    ));
}

function getRevealedMoveCandidates(
  board: Board,
  color: PieceColor,
): MoveCandidate[] {
  const results: MoveCandidate[] = [];

  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const cell = board[row][col];
      if (!cell || !cell.revealed || cell.color !== color) {
        continue;
      }

      const from = { row, col };
      const moves = getValidMoves(board, from, color);
      for (const to of moves) {
        results.push({
          move: {
            type: 'move',
            from,
            to,
          },
          newBoard: movePiece(board, from, to),
          movedPiece: cell,
          capturedPiece: board[to.row][to.col],
        });
      }
    }
  }

  return results;
}

function getRevealedPieces(
  board: Board,
  color: PieceColor,
): RevealedPieceState[] {
  const results: RevealedPieceState[] = [];

  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const cell = board[row][col];
      if (cell && cell.revealed && cell.color === color) {
        results.push({
          piece: cell,
          pos: { row, col },
        });
      }
    }
  }

  return results;
}

function hasAnyCaptureMove(board: Board, color: PieceColor): boolean {
  return getRevealedMoveCandidates(board, color)
    .some((candidate) => candidate.capturedPiece !== null);
}

function hasUncapturableOpponentPiece(board: Board, aiColor: PieceColor): boolean {
  const aiPieces = getRevealedPieces(board, aiColor);
  const opponentPieces = getRevealedPieces(board, otherColor(aiColor));

  return opponentPieces.some(({ piece: targetPiece }) => (
    aiPieces.every(({ piece: attackerPiece }) => !canCapture(attackerPiece, targetPiece))
  ));
}

export function shouldAISurrender(board: Board, aiColor: PieceColor): boolean {
  if (countUnrevealed(board) > 0) {
    return false;
  }

  const aiPieceCount = countPieces(board, aiColor);
  const opponentPieceCount = countPieces(board, otherColor(aiColor));

  if (aiPieceCount === 0 || aiPieceCount > 2) {
    return false;
  }

  if (opponentPieceCount === 0) {
    return false;
  }

  if (hasAnyCaptureMove(board, aiColor)) {
    return false;
  }

  return hasUncapturableOpponentPiece(board, aiColor);
}

function countMobility(board: Board, color: PieceColor): number {
  let mobility = 0;

  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const cell = board[row][col];
      if (cell && cell.revealed && cell.color === color) {
        mobility += getValidMoves(board, { row, col }, color).length;
      }
    }
  }

  return mobility;
}

function canBeCaptured(
  board: Board,
  target: Position,
  defenderColor: PieceColor,
): boolean {
  const attackerColor = otherColor(defenderColor);

  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const cell = board[row][col];
      if (!cell || !cell.revealed || cell.color !== attackerColor) {
        continue;
      }

      const moves = getValidMoves(board, { row, col }, attackerColor);
      if (moves.some((move) => move.row === target.row && move.col === target.col)) {
        return true;
      }
    }
  }

  return false;
}

function evaluateBoard(board: Board, aiColor: PieceColor): number {
  const opponentColor = otherColor(aiColor);
  let score = 0;

  for (let row = 0; row < ROWS; row += 1) {
    for (let col = 0; col < COLS; col += 1) {
      const cell = board[row][col];
      if (!cell || !cell.revealed) {
        continue;
      }

      const value = PIECE_VALUES[cell.type];
      if (cell.color === aiColor) {
        score += value;
      } else {
        score -= value;
      }
    }
  }

  const aiCount = countPieces(board, aiColor);
  const oppCount = countPieces(board, opponentColor);
  score += (aiCount - oppCount) * 8;

  const aiMobility = countMobility(board, aiColor);
  const oppMobility = countMobility(board, opponentColor);
  score += (aiMobility - oppMobility) * 3;

  return score;
}

function scoreFlip(board: Board, pos: Position, aiColor: PieceColor): number {
  const baseScore = evaluateBoard(board, aiColor) - 6;
  let support = 0;
  let pressure = 0;
  let openSpace = 0;

  for (const neighbor of getAdjacentPositions(pos)) {
    const cell = board[neighbor.row][neighbor.col];
    if (!cell) {
      openSpace += 1;
      continue;
    }

    if (!cell.revealed) {
      continue;
    }

    if (cell.color === aiColor) {
      support += 1;
    } else {
      pressure += 1;
    }
  }

  return baseScore + support * 4 - pressure * 5 + openSpace;
}

function scoreMoveHeuristics(
  board: Board,
  candidate: MoveCandidate,
  aiColor: PieceColor,
): number {
  const { move, newBoard, movedPiece, capturedPiece } = candidate;
  const target = move.to!;
  let score = 0;

  if (capturedPiece) {
    score += PIECE_VALUES[capturedPiece.type] * 2.4;
    if (capturedPiece.type === 'general') {
      score += 400;
    }
  } else {
    score -= 6;
  }

  const destinationThreatened = canBeCaptured(newBoard, target, aiColor);
  if (destinationThreatened) {
    score -= PIECE_VALUES[movedPiece.type] * 2;
    if (capturedPiece) {
      score -= PIECE_VALUES[capturedPiece.type] * 0.6;
    }
  } else if (capturedPiece) {
    score += 12;
  }

  const sourceThreatened = canBeCaptured(board, move.from!, aiColor);
  if (sourceThreatened && !destinationThreatened) {
    score += 10;
  }

  score += getValidMoves(newBoard, target, aiColor).length * 1.5;

  return score;
}

function minimax(
  board: Board,
  depth: number,
  isMaximizing: boolean,
  aiColor: PieceColor,
  alpha: number,
  beta: number,
): number {
  const winner = checkWinner(board);
  if (winner === aiColor) {
    return 10000 + depth;
  }

  if (winner && winner !== aiColor) {
    return -10000 - depth;
  }

  if (depth === 0) {
    return evaluateBoard(board, aiColor);
  }

  const currentColor = isMaximizing ? aiColor : otherColor(aiColor);
  const possibleMoves = getRevealedMoveCandidates(board, currentColor);

  // Dark chess can continue by flipping even when no revealed moves exist,
  // so this is not a losing terminal state.
  if (possibleMoves.length === 0) {
    return evaluateBoard(board, aiColor);
  }

  if (isMaximizing) {
    let maxEval = -Infinity;
    for (const candidate of possibleMoves) {
      const evalScore =
        minimax(candidate.newBoard, depth - 1, false, aiColor, alpha, beta) +
        scoreMoveHeuristics(board, candidate, currentColor) * 0.35;
      maxEval = Math.max(maxEval, evalScore);
      alpha = Math.max(alpha, evalScore);
      if (beta <= alpha) {
        break;
      }
    }
    return maxEval;
  }

  let minEval = Infinity;
  for (const candidate of possibleMoves) {
    const evalScore =
      minimax(candidate.newBoard, depth - 1, true, aiColor, alpha, beta) -
      scoreMoveHeuristics(board, candidate, currentColor) * 0.35;
    minEval = Math.min(minEval, evalScore);
    beta = Math.min(beta, evalScore);
    if (beta <= alpha) {
      break;
    }
  }
  return minEval;
}

export function getAIMove(
  board: Board,
  aiColor: PieceColor,
  difficulty: 'easy' | 'normal' | 'hard' | 'master',
): AIMove | null {
  const moveCandidates = getRevealedMoveCandidates(board, aiColor);
  const flipPositions = getValidFlips(board);

  if (moveCandidates.length === 0 && flipPositions.length === 0) {
    return null;
  }

  if (difficulty === 'easy') {
    const simpleMoves: AIMove[] = [
      ...moveCandidates.map((candidate) => candidate.move),
      ...flipPositions.map((pos) => ({ type: 'flip' as const, pos })),
    ];
    return simpleMoves[Math.floor(Math.random() * simpleMoves.length)] ?? null;
  }

  const depthMap = {
    normal: 3,
    hard: 4,
    master: 5,
  } as const;
  const depth = depthMap[difficulty] ?? 2;

  let bestAction: ScoredMove | null = null;

  for (const candidate of moveCandidates) {
    const score =
      minimax(candidate.newBoard, depth - 1, false, aiColor, -Infinity, Infinity) +
      scoreMoveHeuristics(board, candidate, aiColor);
    const priority = candidate.capturedPiece
      ? ROOT_PRIORITY.capture
      : ROOT_PRIORITY.move;

    if (
      !bestAction ||
      score > bestAction.score ||
      (score === bestAction.score && priority > bestAction.priority)
    ) {
      bestAction = {
        move: candidate.move,
        score,
        priority,
      };
    }
  }

  for (const pos of flipPositions) {
    const score = scoreFlip(board, pos, aiColor);
    const priority = ROOT_PRIORITY.flip;

    if (
      !bestAction ||
      score > bestAction.score ||
      (score === bestAction.score && priority > bestAction.priority)
    ) {
      bestAction = {
        move: { type: 'flip', pos },
        score,
        priority,
      };
    }
  }

  return bestAction?.move ?? null;
}
