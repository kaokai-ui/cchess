import { create } from 'zustand';
import type {
  Board,
  PieceColor,
  Position,
  GamePhase,
} from '../shared/types';
import {
  createInitialBoard,
  flipPiece,
  movePiece,
  getValidMoves,
  checkWinner,
  checkStalemate,
} from '../shared/dark-chess/engine';
import { getAIMove, shouldAISurrender } from '../shared/dark-chess/ai';
import { useSettingsStore } from './settingsStore';
import { playMoveSound, playCaptureSound, playFlipSound, playWinSound, playLoseSound } from '../utils/sound';

export type AIDifficulty = 'easy' | 'normal' | 'hard' | 'master';

interface MoveRecord {
  board: Board;
  currentPlayer: PieceColor;
  playerColor: PieceColor | null;
  aiColor: PieceColor | null;
  isFlippingFirst: boolean;
  lastMove: { from: Position; to: Position } | null;
  message: string;
}

interface GameStore {
  board: Board;
  currentPlayer: PieceColor;
  selectedCell: Position | null;
  validMoves: Position[];
  phase: GamePhase;
  winner: PieceColor | null;
  playerColor: PieceColor | null;
  aiColor: PieceColor | null;
  isFlippingFirst: boolean;
  lastMove: { from: Position; to: Position } | null;
  aiDifficulty: AIDifficulty;
  isAiThinking: boolean;
  message: string;
  history: MoveRecord[];
  historyIndex: number;
  flipCue: Position | null;

  initGame: (difficulty: AIDifficulty) => void;
  selectCell: (pos: Position) => void;
  executeMove: (to: Position) => void;
  executeFlip: (pos: Position) => void;
  handleCellClick: (pos: Position) => void;
  executeAiTurn: () => void;
  resetGame: () => void;
  leaveGame: () => void;
  undo: () => void;
  canUndo: () => boolean;
}

const emptyBoard = (): Board =>
  Array.from({ length: 4 }, () => Array(8).fill(null));

const FLIP_CUE_DURATION_MS = 700;
const AI_TURN_THINK_DELAY_MS = 500;
const AI_ACTION_SETTLE_DELAY_MS = 800;
const AI_FLIP_ACTION_DELAY_MS = {
  standard: 850,
  elder: 1500,
} as const;

let flipCueTimer: ReturnType<typeof setTimeout> | null = null;

function clearFlipCueTimer() {
  if (flipCueTimer) {
    clearTimeout(flipCueTimer);
    flipCueTimer = null;
  }
}

function scheduleFlipCue(
  set: (partial: Partial<GameStore>) => void,
  get: () => GameStore,
  pos: Position,
) {
  clearFlipCueTimer();
  set({ flipCue: pos });
  flipCueTimer = setTimeout(() => {
    const cue = get().flipCue;
    if (cue && cue.row === pos.row && cue.col === pos.col) {
      set({ flipCue: null });
    }
    flipCueTimer = null;
  }, FLIP_CUE_DURATION_MS);
}

function getAiFlipActionDelayMs() {
  const pace = useSettingsStore.getState().ui.darkAiFlipPace;
  return AI_FLIP_ACTION_DELAY_MS[pace];
}

export const useGameStore = create<GameStore>((set, get) => ({
  board: emptyBoard(),
  currentPlayer: 'red',
  selectedCell: null,
  validMoves: [],
  phase: 'playing',
  winner: null,
  playerColor: null,
  aiColor: null,
  isFlippingFirst: true,
  lastMove: null,
  aiDifficulty: 'hard',
  isAiThinking: false,
  message: '翻開第一顆棋子決定顏色',
  history: [],
  historyIndex: -1,
  flipCue: null,

  initGame: (difficulty: AIDifficulty) => {
    const board = createInitialBoard();
    clearFlipCueTimer();
    set({
      board,
      currentPlayer: 'red',
      selectedCell: null,
      validMoves: [],
      phase: 'playing',
      winner: null,
      playerColor: null,
      aiColor: null,
      isFlippingFirst: true,
      lastMove: null,
      aiDifficulty: difficulty,
      isAiThinking: false,
      message: '翻開第一顆棋子決定顏色',
      history: [],
      historyIndex: -1,
      flipCue: null,
    });
  },

  selectCell: (pos: Position) => {
    const { board, currentPlayer } = get();
    const cell = board[pos.row][pos.col];

    if (cell && cell.revealed && cell.color === currentPlayer) {
      const moves = getValidMoves(board, pos, currentPlayer);
      set({ selectedCell: pos, validMoves: moves });
    } else {
      set({ selectedCell: null, validMoves: [] });
    }
  },

  executeMove: (to: Position) => {
    const { board, currentPlayer, selectedCell, history, historyIndex } = get();
    if (!selectedCell) return;

    const capturedPiece = board[to.row][to.col];
    const newBoard = movePiece(board, selectedCell, to);

    if (capturedPiece) {
      playCaptureSound();
    } else {
      playMoveSound();
    }

    const winner = checkWinner(newBoard);
    const stalemate = checkStalemate(newBoard, currentPlayer === 'red' ? 'black' : 'red');

    const nextPlayer: PieceColor = currentPlayer === 'red' ? 'black' : 'red';

    if (winner) {
      const { playerColor } = get();
      if (playerColor === winner) {
        playWinSound();
      } else {
        playLoseSound();
      }
      const newHistory = [...history.slice(0, historyIndex + 1), { board, currentPlayer, playerColor: get().playerColor, aiColor: get().aiColor, isFlippingFirst: false, lastMove: { from: selectedCell, to }, message: `${nextPlayer === 'red' ? '紅方' : '黑方'}的回合` }];
      set({
        board: newBoard,
        selectedCell: null,
        validMoves: [],
        phase: 'gameOver',
        winner,
        lastMove: { from: selectedCell, to },
        message: winner === playerColor ? '你贏了！' : '你輸了！',
        history: newHistory,
        historyIndex: historyIndex + 1,
      });
      return;
    }

    if (stalemate) {
      const newHistory = [...history.slice(0, historyIndex + 1), { board, currentPlayer, playerColor: get().playerColor, aiColor: get().aiColor, isFlippingFirst: false, lastMove: { from: selectedCell, to }, message: `${nextPlayer === 'red' ? '紅方' : '黑方'}的回合` }];
      set({
        board: newBoard,
        selectedCell: null,
        validMoves: [],
        phase: 'gameOver',
        winner: null,
        lastMove: { from: selectedCell, to },
        message: '平手！',
        history: newHistory,
        historyIndex: historyIndex + 1,
      });
      return;
    }

    const newHistory = [...history.slice(0, historyIndex + 1), { board, currentPlayer, playerColor: get().playerColor, aiColor: get().aiColor, isFlippingFirst: false, lastMove: { from: selectedCell, to }, message: `${nextPlayer === 'red' ? '紅方' : '黑方'}的回合` }];

    set({
      board: newBoard,
      currentPlayer: nextPlayer,
      selectedCell: null,
      validMoves: [],
      lastMove: { from: selectedCell, to },
      message: `${nextPlayer === 'red' ? '紅方' : '黑方'}的回合`,
      history: newHistory,
      historyIndex: historyIndex + 1,
    });

    const { playerColor } = get();
    if (nextPlayer !== playerColor) {
      setTimeout(() => get().executeAiTurn(), 500);
    }
  },

  executeFlip: (pos: Position) => {
    const { board, currentPlayer, isFlippingFirst, history, historyIndex } = get();

    const newBoard = flipPiece(board, pos);
    const flippedPiece = newBoard[pos.row][pos.col];

    playFlipSound();

    if (isFlippingFirst && flippedPiece) {
      const firstColor: PieceColor = flippedPiece.color;
      const secondColor: PieceColor = firstColor === 'red' ? 'black' : 'red';

      const newHistory = [...history.slice(0, historyIndex + 1), { board, currentPlayer, playerColor: null, aiColor: null, isFlippingFirst: true, lastMove: null, message: '翻開第一顆棋子決定顏色' }];

      set({
        board: newBoard,
        currentPlayer: secondColor,
        playerColor: firstColor,
        aiColor: secondColor,
        isFlippingFirst: false,
        lastMove: null,
        message: `${secondColor === 'red' ? '紅方' : '黑方'}的回合`,
        history: newHistory,
        historyIndex: historyIndex + 1,
      });

      setTimeout(() => get().executeAiTurn(), 500);
      return;
    }

    const nextPlayer: PieceColor = currentPlayer === 'red' ? 'black' : 'red';

    const winner = checkWinner(newBoard);
    const stalemate = checkStalemate(newBoard, nextPlayer);

    if (winner) {
      const { playerColor } = get();
      if (playerColor === winner) {
        playWinSound();
      } else {
        playLoseSound();
      }
      const newHistory = [...history.slice(0, historyIndex + 1), { board, currentPlayer, playerColor: get().playerColor, aiColor: get().aiColor, isFlippingFirst: false, lastMove: null, message: `${nextPlayer === 'red' ? '紅方' : '黑方'}的回合` }];
      set({
        board: newBoard,
        selectedCell: null,
        validMoves: [],
        phase: 'gameOver',
        winner,
        lastMove: null,
        message: winner === playerColor ? '你贏了！' : '你輸了！',
        history: newHistory,
        historyIndex: historyIndex + 1,
      });
      return;
    }

    if (stalemate) {
      const newHistory = [...history.slice(0, historyIndex + 1), { board, currentPlayer, playerColor: get().playerColor, aiColor: get().aiColor, isFlippingFirst: false, lastMove: null, message: `${nextPlayer === 'red' ? '紅方' : '黑方'}的回合` }];
      set({
        board: newBoard,
        selectedCell: null,
        validMoves: [],
        phase: 'gameOver',
        winner: null,
        lastMove: null,
        message: '平手！',
        history: newHistory,
        historyIndex: historyIndex + 1,
      });
      return;
    }

    const newHistory = [...history.slice(0, historyIndex + 1), { board, currentPlayer, playerColor: get().playerColor, aiColor: get().aiColor, isFlippingFirst: false, lastMove: null, message: `${nextPlayer === 'red' ? '紅方' : '黑方'}的回合` }];

    set({
      board: newBoard,
      currentPlayer: nextPlayer,
      selectedCell: null,
      validMoves: [],
      lastMove: null,
      message: `${nextPlayer === 'red' ? '紅方' : '黑方'}的回合`,
      history: newHistory,
      historyIndex: historyIndex + 1,
    });

    const { aiColor } = get();
    if (nextPlayer === aiColor) {
      setTimeout(() => get().executeAiTurn(), 500);
    }
  },

  handleCellClick: (pos: Position) => {
    const { board, currentPlayer, selectedCell, validMoves, phase } = get();

    if (phase !== 'playing') return;

    const cell = board[pos.row][pos.col];

    if (cell && !cell.revealed) {
      get().executeFlip(pos);
      return;
    }

    if (selectedCell) {
      const isValidMove = validMoves.some(
        (m) => m.row === pos.row && m.col === pos.col
      );
      if (isValidMove) {
        get().executeMove(pos);
        return;
      }
    }

    if (cell && cell.revealed && cell.color === currentPlayer) {
      get().selectCell(pos);
    } else {
      set({ selectedCell: null, validMoves: [] });
    }
  },

  executeAiTurn: () => {
    const { playerColor, phase } = get();

    if (phase !== 'playing') return;

    const aiColor = playerColor === 'red' ? 'black' : 'red';

    set({ isAiThinking: true, message: 'AI 思考中...' });

    setTimeout(() => {
      const state = get();
      if (state.phase !== 'playing') return;
      if (state.currentPlayer !== aiColor) return;

      if (shouldAISurrender(state.board, aiColor)) {
        set({
          phase: 'gameOver',
          winner: state.playerColor!,
          isAiThinking: false,
          message: 'AI 無勝算，主動認輸。',
        });
        return;
      }

      const aiMove = getAIMove(state.board, aiColor, state.aiDifficulty);
      const aiFlipActionDelayMs = getAiFlipActionDelayMs();

      if (!aiMove) {
        const winner = state.playerColor!;
        set({
          phase: 'gameOver',
          winner,
          isAiThinking: false,
          message: '你贏了！',
        });
        return;
      }

      if (aiMove.type === 'flip' && aiMove.pos) {
        setTimeout(() => {
          const flipState = get();
          if (flipState.phase !== 'playing') return;
          if (flipState.currentPlayer !== aiColor) return;

          scheduleFlipCue(set, get, aiMove.pos!);
          flipState.executeFlip(aiMove.pos!);
        }, aiFlipActionDelayMs);
      } else if (aiMove.type === 'move' && aiMove.from && aiMove.to) {
        state.selectCell(aiMove.from);
        state.executeMove(aiMove.to);
      }

      setTimeout(() => {
        const s = get();
        if (s.isAiThinking) {
          set({ isAiThinking: false });
        }
      }, aiMove.type === 'flip' ? aiFlipActionDelayMs + AI_ACTION_SETTLE_DELAY_MS : AI_ACTION_SETTLE_DELAY_MS);
    }, AI_TURN_THINK_DELAY_MS);
  },

  resetGame: () => {
    const { aiDifficulty } = get();
    get().initGame(aiDifficulty);
  },

  leaveGame: () => {
    clearFlipCueTimer();
    set({
      board: emptyBoard(),
      currentPlayer: 'red',
      selectedCell: null,
      validMoves: [],
      phase: 'playing',
      winner: null,
      playerColor: null,
      aiColor: null,
      isFlippingFirst: true,
      lastMove: null,
      isAiThinking: false,
      message: '',
      history: [],
      historyIndex: -1,
      flipCue: null,
    });
  },

  undo: () => {
    const { history, historyIndex } = get();
    if (historyIndex < 0) return;

    const prevState = history[historyIndex];
    clearFlipCueTimer();
    set({
      board: prevState.board,
      currentPlayer: prevState.currentPlayer,
      playerColor: prevState.playerColor,
      aiColor: prevState.aiColor,
      isFlippingFirst: prevState.isFlippingFirst,
      selectedCell: null,
      validMoves: [],
      lastMove: prevState.lastMove,
      message: prevState.message,
      historyIndex: historyIndex - 1,
      phase: 'playing',
      winner: null,
      isAiThinking: false,
      flipCue: null,
    });

    if (!prevState.isFlippingFirst && prevState.currentPlayer === get().aiColor) {
      setTimeout(() => get().executeAiTurn(), 500);
    }
  },

  canUndo: () => {
    return get().historyIndex >= 0 && get().phase === 'playing' && !get().isAiThinking;
  },
}));
