import { create } from 'zustand';
import { getAIMove, type GomokuAIDifficulty } from '../shared/gomoku/ai';
import {
  checkWinner,
  createInitialBoard,
  isBoardFull,
  isValidMove,
  placeStone,
} from '../shared/gomoku/engine';
import type {
  GomokuBoard,
  GomokuPhase,
  GomokuPosition,
  GomokuStone,
} from '../shared/gomoku/types';
import { playLoseSound, playMoveSound, playWinSound } from '../utils/sound';

type StarterOwner = 'player' | 'ai';

interface MoveRecord {
  board: GomokuBoard;
  currentPlayer: GomokuStone;
  playerStone: GomokuStone;
  aiStone: GomokuStone;
  starterOwner: StarterOwner;
  lastMove: GomokuPosition | null;
  message: string;
}

interface GomokuGameStore {
  board: GomokuBoard;
  currentPlayer: GomokuStone;
  phase: GomokuPhase;
  winner: GomokuStone | null;
  playerStone: GomokuStone;
  aiStone: GomokuStone;
  starterOwner: StarterOwner;
  aiDifficulty: GomokuAIDifficulty;
  isAiThinking: boolean;
  lastMove: GomokuPosition | null;
  message: string;
  history: MoveRecord[];
  historyIndex: number;

  initGame: (difficulty: GomokuAIDifficulty) => void;
  handleCellClick: (pos: GomokuPosition) => void;
  executeAiTurn: () => void;
  resetGame: () => void;
  leaveGame: () => void;
  undo: () => void;
  canUndo: () => boolean;
}

const AI_TURN_DELAY_MS = 420;

function getNextStone(stone: GomokuStone): GomokuStone {
  return stone === 'black' ? 'white' : 'black';
}

function getStoneByStarter(starterOwner: StarterOwner) {
  return {
    playerStone: starterOwner === 'player' ? 'black' : 'white',
    aiStone: starterOwner === 'player' ? 'white' : 'black',
  } as const;
}

function getTurnMessage(currentPlayer: GomokuStone, playerStone: GomokuStone, lastMove: GomokuPosition | null) {
  if (lastMove === null) {
    return currentPlayer === playerStone ? '你先手' : 'AI 先手';
  }

  return currentPlayer === playerStone ? '輪到你落子' : '輪到 AI 落子';
}

function getNextStarterOwner(
  winner: GomokuStone | null,
  playerStone: GomokuStone,
  starterOwner: StarterOwner,
): StarterOwner {
  if (winner === null) {
    return starterOwner;
  }

  return winner === playerStone ? 'player' : 'ai';
}

export const useGomokuGameStore = create<GomokuGameStore>((set, get) => {
  const startRound = (
    difficulty: GomokuAIDifficulty,
    starterOwner: StarterOwner,
  ) => {
    const { playerStone, aiStone } = getStoneByStarter(starterOwner);
    const currentPlayer: GomokuStone = 'black';
    const message = getTurnMessage(currentPlayer, playerStone, null);

    set({
      board: createInitialBoard(),
      currentPlayer,
      phase: 'playing',
      winner: null,
      playerStone,
      aiStone,
      starterOwner,
      aiDifficulty: difficulty,
      isAiThinking: false,
      lastMove: null,
      message,
      history: [],
      historyIndex: -1,
    });

    if (currentPlayer === aiStone) {
      setTimeout(() => {
        get().executeAiTurn();
      }, AI_TURN_DELAY_MS);
    }
  };

  const commitMove = (pos: GomokuPosition) => {
    const {
      aiStone,
      board,
      currentPlayer,
      history,
      historyIndex,
      lastMove,
      message,
      playerStone,
      starterOwner,
    } = get();

    if (!isValidMove(board, pos)) {
      return;
    }

    const nextBoard = placeStone(board, pos, currentPlayer);
    const nextPlayer = getNextStone(currentPlayer);
    const nextHistory = [
      ...history.slice(0, historyIndex + 1),
      {
        board,
        currentPlayer,
        playerStone,
        aiStone,
        starterOwner,
        lastMove,
        message,
      },
    ];

    playMoveSound();

    const winner = checkWinner(nextBoard, pos);

    if (winner) {
      if (winner === playerStone) {
        playWinSound();
      } else {
        playLoseSound();
      }

      set({
        board: nextBoard,
        currentPlayer: nextPlayer,
        phase: 'gameOver',
        winner,
        starterOwner: getNextStarterOwner(winner, playerStone, starterOwner),
        isAiThinking: false,
        lastMove: pos,
        message: winner === playerStone ? '你贏了！下一局你先手。' : 'AI 贏了，下一局 AI 先手。',
        history: nextHistory,
        historyIndex: historyIndex + 1,
      });
      return;
    }

    if (isBoardFull(nextBoard)) {
      set({
        board: nextBoard,
        currentPlayer: nextPlayer,
        phase: 'gameOver',
        winner: null,
        isAiThinking: false,
        lastMove: pos,
        message: '平手，下一局維持上一局先手方先下。',
        history: nextHistory,
        historyIndex: historyIndex + 1,
      });
      return;
    }

    set({
      board: nextBoard,
      currentPlayer: nextPlayer,
      phase: 'playing',
      winner: null,
      isAiThinking: false,
      lastMove: pos,
      message: getTurnMessage(nextPlayer, playerStone, pos),
      history: nextHistory,
      historyIndex: historyIndex + 1,
    });

    if (nextPlayer === aiStone) {
      setTimeout(() => {
        get().executeAiTurn();
      }, AI_TURN_DELAY_MS);
    }
  };

  return {
    board: createInitialBoard(),
    currentPlayer: 'black',
    phase: 'playing',
    winner: null,
    playerStone: 'black',
    aiStone: 'white',
    starterOwner: 'player',
    aiDifficulty: 'hard',
    isAiThinking: false,
    lastMove: null,
    message: '你先手',
    history: [],
    historyIndex: -1,

    initGame: (difficulty: GomokuAIDifficulty) => {
      startRound(difficulty, 'player');
    },

    handleCellClick: (pos: GomokuPosition) => {
      const { board, currentPlayer, phase, playerStone, isAiThinking } = get();

      if (phase !== 'playing' || isAiThinking || currentPlayer !== playerStone) {
        return;
      }

      if (!isValidMove(board, pos)) {
        return;
      }

      commitMove(pos);
    },

    executeAiTurn: () => {
      const { aiDifficulty, aiStone, currentPlayer, phase } = get();

      if (phase !== 'playing' || currentPlayer !== aiStone) {
        return;
      }

      set({
        isAiThinking: true,
        message:
          aiDifficulty === 'master' ? 'AI（棋聖）正在推演最佳落點…' : 'AI 正在思考…',
      });

      setTimeout(() => {
        const state = get();

        if (state.phase !== 'playing' || state.currentPlayer !== state.aiStone) {
          return;
        }

        const aiMove = getAIMove(state.board, state.aiStone, state.aiDifficulty);

        if (!aiMove) {
          set({
            phase: 'gameOver',
            winner: null,
            isAiThinking: false,
            message: '平手，AI 找不到合法落點。',
          });
          return;
        }

        commitMove(aiMove);
      }, AI_TURN_DELAY_MS);
    },

    resetGame: () => {
      const { aiDifficulty, starterOwner } = get();
      startRound(aiDifficulty, starterOwner);
    },

    leaveGame: () => {
      set({
        board: createInitialBoard(),
        currentPlayer: 'black',
        phase: 'playing',
        winner: null,
        playerStone: 'black',
        aiStone: 'white',
        starterOwner: 'player',
        aiDifficulty: 'hard',
        isAiThinking: false,
        lastMove: null,
        message: '',
        history: [],
        historyIndex: -1,
      });
    },

    undo: () => {
      const { history, historyIndex } = get();

      if (historyIndex < 0) {
        return;
      }

      const previousState = history[historyIndex];

      set({
        board: previousState.board,
        currentPlayer: previousState.currentPlayer,
        phase: 'playing',
        winner: null,
        playerStone: previousState.playerStone,
        aiStone: previousState.aiStone,
        starterOwner: previousState.starterOwner,
        isAiThinking: false,
        lastMove: previousState.lastMove,
        message: previousState.message,
        historyIndex: historyIndex - 1,
      });

      if (previousState.currentPlayer === previousState.aiStone) {
        setTimeout(() => {
          get().executeAiTurn();
        }, AI_TURN_DELAY_MS);
      }
    },

    canUndo: () => {
      return get().historyIndex >= 0 && get().phase === 'playing' && !get().isAiThinking;
    },
  };
});
