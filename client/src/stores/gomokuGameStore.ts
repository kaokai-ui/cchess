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
import {
  playLoseSound,
  playMoveSound,
  playWinSound,
} from '../utils/sound';

interface MoveRecord {
  board: GomokuBoard;
  currentPlayer: GomokuStone;
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

function getTurnMessage(stone: GomokuStone, playerStone: GomokuStone) {
  if (stone === playerStone) {
    return '輪到你落子';
  }

  return '輪到 AI 落子';
}

export const useGomokuGameStore = create<GomokuGameStore>((set, get) => {
  const commitMove = (pos: GomokuPosition) => {
    const {
      aiStone,
      board,
      currentPlayer,
      history,
      historyIndex,
      message,
      playerStone,
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
        lastMove: get().lastMove,
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
        isAiThinking: false,
        lastMove: pos,
        message: winner === playerStone ? '你贏了！' : 'AI 贏了，別氣餒，再來一局。',
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
        message: '平手，棋盤已滿。',
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
      message: getTurnMessage(nextPlayer, playerStone),
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
    aiDifficulty: 'hard',
    isAiThinking: false,
    lastMove: null,
    message: '輪到你落子',
    history: [],
    historyIndex: -1,

    initGame: (difficulty: GomokuAIDifficulty) => {
      set({
        board: createInitialBoard(),
        currentPlayer: 'black',
        phase: 'playing',
        winner: null,
        playerStone: 'black',
        aiStone: 'white',
        aiDifficulty: difficulty,
        isAiThinking: false,
        lastMove: null,
        message: '輪到你落子',
        history: [],
        historyIndex: -1,
      });
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
      get().initGame(get().aiDifficulty);
    },

    leaveGame: () => {
      set({
        board: createInitialBoard(),
        currentPlayer: 'black',
        phase: 'playing',
        winner: null,
        playerStone: 'black',
        aiStone: 'white',
        aiDifficulty: 'hard',
        isAiThinking: false,
        lastMove: null,
        message: '',
        history: [],
        historyIndex: -1,
      });
    },

    undo: () => {
      const { aiStone, history, historyIndex } = get();

      if (historyIndex < 0) {
        return;
      }

      const previousState = history[historyIndex];

      set({
        board: previousState.board,
        currentPlayer: previousState.currentPlayer,
        phase: 'playing',
        winner: null,
        isAiThinking: false,
        lastMove: previousState.lastMove,
        message: previousState.message,
        historyIndex: historyIndex - 1,
      });

      if (previousState.currentPlayer === aiStone) {
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
