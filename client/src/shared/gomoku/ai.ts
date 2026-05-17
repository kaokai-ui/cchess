import {
  checkWinner,
  getCandidateMoves,
  getCenterMove,
  getLineLength,
  hasAnyStone,
  placeStone,
} from './engine';
import type { GomokuBoard, GomokuPosition, GomokuStone } from './types';

export type GomokuAIDifficulty = 'easy' | 'normal' | 'hard' | 'master';

interface DifficultyWeights {
  offense: number;
  defense: number;
  shape: number;
  center: number;
  response: number;
  randomnessTopN: number;
  lookahead: boolean;
}

const DIRECTIONS = [
  { row: 1, col: 0 },
  { row: 0, col: 1 },
  { row: 1, col: 1 },
  { row: 1, col: -1 },
] as const;

const DIFFICULTY_WEIGHTS: Record<GomokuAIDifficulty, DifficultyWeights> = {
  easy: {
    offense: 1,
    defense: 0.45,
    shape: 0.8,
    center: 0.8,
    response: 0,
    randomnessTopN: 6,
    lookahead: false,
  },
  normal: {
    offense: 1.1,
    defense: 1,
    shape: 1,
    center: 0.65,
    response: 0.4,
    randomnessTopN: 3,
    lookahead: false,
  },
  hard: {
    offense: 1.25,
    defense: 1.2,
    shape: 1.15,
    center: 0.5,
    response: 0.7,
    randomnessTopN: 1,
    lookahead: false,
  },
  master: {
    offense: 1.3,
    defense: 1.25,
    shape: 1.25,
    center: 0.45,
    response: 0.95,
    randomnessTopN: 1,
    lookahead: true,
  },
};

function getOpponentStone(stone: GomokuStone): GomokuStone {
  return stone === 'black' ? 'white' : 'black';
}

function countNearbyStones(
  board: GomokuBoard,
  pos: GomokuPosition,
  stone: GomokuStone,
  radius: number,
) {
  let count = 0;

  for (let row = pos.row - radius; row <= pos.row + radius; row += 1) {
    for (let col = pos.col - radius; col <= pos.col + radius; col += 1) {
      if (row === pos.row && col === pos.col) {
        continue;
      }

      if (board[row]?.[col] === stone) {
        count += 1;
      }
    }
  }

  return count;
}

function analyzeDirection(
  board: GomokuBoard,
  pos: GomokuPosition,
  stone: GomokuStone,
  rowStep: number,
  colStep: number,
) {
  let forwardCount = 0;
  let backwardCount = 0;
  let row = pos.row + rowStep;
  let col = pos.col + colStep;

  while (board[row]?.[col] === stone) {
    forwardCount += 1;
    row += rowStep;
    col += colStep;
  }

  const forwardOpen = board[row]?.[col] === null;

  row = pos.row - rowStep;
  col = pos.col - colStep;

  while (board[row]?.[col] === stone) {
    backwardCount += 1;
    row -= rowStep;
    col -= colStep;
  }

  const backwardOpen = board[row]?.[col] === null;
  const total = 1 + forwardCount + backwardCount;
  const openEnds = Number(forwardOpen) + Number(backwardOpen);

  return { total, openEnds };
}

function getPatternScore(total: number, openEnds: number) {
  if (total >= 5) {
    return 2_000_000;
  }

  if (total === 4 && openEnds === 2) {
    return 220_000;
  }

  if (total === 4 && openEnds === 1) {
    return 48_000;
  }

  if (total === 3 && openEnds === 2) {
    return 14_000;
  }

  if (total === 3 && openEnds === 1) {
    return 2_500;
  }

  if (total === 2 && openEnds === 2) {
    return 900;
  }

  if (total === 2 && openEnds === 1) {
    return 140;
  }

  if (total === 1 && openEnds === 2) {
    return 36;
  }

  return 0;
}

function evaluateShapeScore(
  board: GomokuBoard,
  pos: GomokuPosition,
  stone: GomokuStone,
): number {
  let totalScore = 0;
  let openThreeCount = 0;
  let openFourCount = 0;

  for (const direction of DIRECTIONS) {
    const { total, openEnds } = analyzeDirection(
      board,
      pos,
      stone,
      direction.row,
      direction.col,
    );

    totalScore += getPatternScore(total, openEnds);

    if (total === 3 && openEnds === 2) {
      openThreeCount += 1;
    }

    if (total === 4 && openEnds === 2) {
      openFourCount += 1;
    }
  }

  if (openFourCount >= 2) {
    totalScore += 600_000;
  }

  if (openThreeCount >= 2) {
    totalScore += 90_000;
  }

  return totalScore;
}

function evaluateMoveScore(
  board: GomokuBoard,
  pos: GomokuPosition,
  stone: GomokuStone,
  difficulty: GomokuAIDifficulty,
) {
  const opponent = getOpponentStone(stone);
  const weights = DIFFICULTY_WEIGHTS[difficulty];
  const boardAfterMove = placeStone(board, pos, stone);

  if (checkWinner(boardAfterMove, pos) === stone) {
    return Number.MAX_SAFE_INTEGER;
  }

  const offenseShape = evaluateShapeScore(boardAfterMove, pos, stone);
  const defenseShape = evaluateShapeScore(placeStone(board, pos, opponent), pos, opponent);
  const neighborScore =
    countNearbyStones(board, pos, stone, 2) * 14 +
    countNearbyStones(board, pos, opponent, 2) * 10;
  const centerDistance =
    Math.abs(pos.row - 7) + Math.abs(pos.col - 7);
  const centerScore = Math.max(0, 16 - centerDistance) * 12;
  const linePressure = DIRECTIONS.reduce((sum, direction) => {
    return (
      sum +
      getLineLength(boardAfterMove, pos, stone, direction.row, direction.col) * 60
    );
  }, 0);

  return (
    offenseShape * weights.offense +
    defenseShape * weights.defense +
    linePressure * weights.shape +
    neighborScore +
    centerScore * weights.center
  );
}

function isWinningMove(board: GomokuBoard, pos: GomokuPosition, stone: GomokuStone) {
  return checkWinner(placeStone(board, pos, stone), pos) === stone;
}

function listWinningMoves(board: GomokuBoard, stone: GomokuStone) {
  return getCandidateMoves(board).filter((candidate) => isWinningMove(board, candidate, stone));
}

function sortMovesByHeuristic(
  board: GomokuBoard,
  stone: GomokuStone,
  difficulty: GomokuAIDifficulty,
) {
  return getCandidateMoves(board)
    .map((move) => ({
      move,
      score: evaluateMoveScore(board, move, stone, difficulty),
    }))
    .sort((left, right) => right.score - left.score);
}

function scoreOpponentBestReply(
  boardAfterMove: GomokuBoard,
  aiStone: GomokuStone,
  difficulty: GomokuAIDifficulty,
) {
  const opponent = getOpponentStone(aiStone);
  const immediateOpponentWins = listWinningMoves(boardAfterMove, opponent);

  if (immediateOpponentWins.length > 0) {
    return Number.MAX_SAFE_INTEGER / 2;
  }

  const topReplies = sortMovesByHeuristic(boardAfterMove, opponent, 'hard').slice(0, 8);

  if (topReplies.length === 0) {
    return 0;
  }

  const scores = topReplies.map(({ move, score }) => {
    const afterReply = placeStone(boardAfterMove, move, opponent);

    if (checkWinner(afterReply, move) === opponent) {
      return Number.MAX_SAFE_INTEGER / 2;
    }

    if (!DIFFICULTY_WEIGHTS[difficulty].lookahead) {
      return score;
    }

    const aiCounters = sortMovesByHeuristic(afterReply, aiStone, 'hard').slice(0, 5);
    const bestCounter = aiCounters[0]?.score ?? 0;
    return score - bestCounter * 0.45;
  });

  return Math.max(...scores);
}

export function getAIMove(
  board: GomokuBoard,
  aiStone: GomokuStone,
  difficulty: GomokuAIDifficulty,
): GomokuPosition | null {
  if (!hasAnyStone(board)) {
    return getCenterMove();
  }

  const opponent = getOpponentStone(aiStone);
  const immediateWins = listWinningMoves(board, aiStone);

  if (immediateWins.length > 0) {
    return immediateWins[0];
  }

  const immediateBlocks = listWinningMoves(board, opponent);

  if (immediateBlocks.length > 0 && difficulty !== 'easy') {
    return immediateBlocks[0];
  }

  const weights = DIFFICULTY_WEIGHTS[difficulty];
  const rankedMoves = sortMovesByHeuristic(board, aiStone, difficulty)
    .map(({ move, score }) => {
      const boardAfterMove = placeStone(board, move, aiStone);
      const opponentBestReply = weights.response
        ? scoreOpponentBestReply(boardAfterMove, aiStone, difficulty)
        : 0;

      return {
        move,
        score:
          opponentBestReply >= Number.MAX_SAFE_INTEGER / 2
            ? score - 900_000
            : score - opponentBestReply * weights.response,
      };
    })
    .sort((left, right) => right.score - left.score);

  if (rankedMoves.length === 0) {
    return null;
  }

  const topCount = Math.min(weights.randomnessTopN, rankedMoves.length);
  const candidates = rankedMoves.slice(0, topCount);

  if (topCount === 1) {
    return candidates[0].move;
  }

  const randomIndex = Math.floor(Math.random() * topCount);
  return candidates[randomIndex].move;
}
