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
import { createAiTurnScheduler } from './aiTurnScheduler';

interface MoveRecord {
  board: GomokuBoard;
  currentPlayer: GomokuStone;
  starterStone: GomokuStone;
  lastMove: GomokuPosition | null;
  message: string;
}

interface GomokuGameStore {
  board: GomokuBoard;
  currentPlayer: GomokuStone;
  starterStone: GomokuStone;
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

const { schedule: scheduleGomokuTimer, clear: clearGomokuTimers } = createAiTurnScheduler();

function getNextStone(stone: GomokuStone): GomokuStone {
  return stone === 'black' ? 'white' : 'black';
}

function getTurnMessage(currentPlayer: GomokuStone, playerStone: GomokuStone, isOpeningTurn: boolean) {
  if (isOpeningTurn) {
    return currentPlayer === playerStone ? '你先手' : 'AI 先手';
  }

  return currentPlayer === playerStone ? '輪到你落子' : '輪到 AI 落子';
}

export const useGomokuGameStore = create<GomokuGameStore>((set, get) => {
  const startRound = (difficulty: GomokuAIDifficulty, starterStone: GomokuStone) => {
    const playerStone: GomokuStone = 'black';
    const aiStone: GomokuStone = 'white';

    clearGomokuTimers();

    set({
      board: createInitialBoard(),
      currentPlayer: starterStone,
      starterStone,
      phase: 'playing',
      winner: null,
      playerStone,
      aiStone,
      aiDifficulty: difficulty,
      isAiThinking: false,
      lastMove: null,
      message: getTurnMessage(starterStone, playerStone, true),
      history: [],
      historyIndex: -1,
    });

    if (starterStone === aiStone) {
      scheduleGomokuTimer(() => {
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
      starterStone,
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
        starterStone,
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
        starterStone: winner,
        phase: 'gameOver',
        winner,
        isAiThinking: false,
        lastMove: pos,
        message:
          winner === playerStone
            ? `你贏了！下一局由${winner === 'black' ? '黑子' : '白子'}先手。`
            : `AI 贏了！下一局由${winner === 'black' ? '黑子' : '白子'}先手。`,
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
        message: `平手，下一局維持${starterStone === 'black' ? '黑子' : '白子'}先手。`,
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
      message: getTurnMessage(nextPlayer, playerStone, false),
      history: nextHistory,
      historyIndex: historyIndex + 1,
    });

    if (nextPlayer === aiStone) {
      scheduleGomokuTimer(() => {
        get().executeAiTurn();
      }, AI_TURN_DELAY_MS);
    }
  };

  return {
    board: createInitialBoard(),
    currentPlayer: 'black',
    starterStone: 'black',
    phase: 'playing',
    winner: null,
    playerStone: 'black',
    aiStone: 'white',
    aiDifficulty: 'hard',
    isAiThinking: false,
    lastMove: null,
    message: '你先手',
    history: [],
    historyIndex: -1,

    initGame: (difficulty: GomokuAIDifficulty) => {
      startRound(difficulty, 'black');
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

      scheduleGomokuTimer(() => {
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
      const { aiDifficulty, starterStone } = get();
      startRound(aiDifficulty, starterStone);
    },

    leaveGame: () => {
      clearGomokuTimers();
      set({
        board: createInitialBoard(),
        currentPlayer: 'black',
        starterStone: 'black',
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
      const { history, historyIndex, aiStone } = get();

      if (historyIndex < 0) {
        return;
      }

      clearGomokuTimers();

      // A single ply may land on the AI's turn (the AI would just replay). Step
      // back an extra ply so the player's own move is actually taken back.
      let targetIndex = historyIndex;
      if (history[targetIndex].currentPlayer === aiStone && targetIndex > 0) {
        targetIndex -= 1;
      }

      const previousState = history[targetIndex];

      set({
        board: previousState.board,
        currentPlayer: previousState.currentPlayer,
        starterStone: previousState.starterStone,
        phase: 'playing',
        winner: null,
        isAiThinking: false,
        lastMove: previousState.lastMove,
        message: previousState.message,
        historyIndex: targetIndex - 1,
      });

      // Only reschedule the AI if we genuinely landed on its turn (AI-first round).
      if (previousState.currentPlayer === aiStone) {
        scheduleGomokuTimer(() => {
          get().executeAiTurn();
        }, AI_TURN_DELAY_MS);
      }
    },

    canUndo: () => {
      return get().historyIndex >= 0 && get().phase === 'playing' && !get().isAiThinking;
    },
  };
});
