import { create } from 'zustand';
import type {
  Board,
  PieceColor,
  Position,
  GamePhase,
} from '../shared/types';
import {
  createInitialBoard,
  movePiece,
  getValidMoves,
  checkWinner,
  checkStalemate,
} from '../shared/bright-chess/engine';
import { computeBrightAiMove } from '../shared/bright-chess/aiRunner';
import { playMoveSound, playCaptureSound, playWinSound } from '../utils/sound';
import { createAiTurnScheduler } from './aiTurnScheduler';

export type AIDifficulty = 'easy' | 'normal' | 'hard' | 'master';

interface MoveRecord {
  board: Board;
  currentPlayer: PieceColor;
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
  playerColor: PieceColor;
  lastMove: { from: Position; to: Position } | null;
  aiDifficulty: AIDifficulty;
  isAiThinking: boolean;
  message: string;
  history: MoveRecord[];
  historyIndex: number;

  initGame: (playerColor: PieceColor, difficulty: AIDifficulty) => void;
  selectCell: (pos: Position) => void;
  executeMove: (to: Position) => void;
  handleCellClick: (pos: Position) => void;
  executeAiTurn: () => void;
  resetGame: () => void;
  leaveGame: () => void;
  undo: () => void;
  canUndo: () => boolean;
}

const emptyBoard = (): Board =>
  Array.from({ length: 10 }, () => Array(9).fill(null));

const AI_TURN_DELAY_MS = 500;
const AI_ACTION_SETTLE_DELAY_MS = 800;

const brightScheduler = createAiTurnScheduler();
const scheduleBrightTimer = brightScheduler.schedule;

// Bumped whenever pending AI work is cancelled (reset / leave / undo). The
// AI runs asynchronously (off the main thread via a worker), so an in-flight
// computation compares against this token on completion and discards a stale
// result instead of applying a move to a game that has since moved on.
let brightAiToken = 0;

function clearBrightTimers() {
  brightAiToken += 1;
  brightScheduler.clear();
}

export const useBrightGameStore = create<GameStore>((set, get) => ({
  board: emptyBoard(),
  currentPlayer: 'red',
  selectedCell: null,
  validMoves: [],
  phase: 'playing',
  winner: null,
  playerColor: 'red',
  lastMove: null,
  aiDifficulty: 'hard',
  isAiThinking: false,
  message: '紅方先行',
  history: [],
  historyIndex: -1,

  initGame: (playerColor: PieceColor, difficulty: AIDifficulty) => {
    const board = createInitialBoard();
    clearBrightTimers();
    set({
      board,
      currentPlayer: 'red',
      selectedCell: null,
      validMoves: [],
      phase: 'playing',
      winner: null,
      playerColor,
      lastMove: null,
      aiDifficulty: difficulty,
      isAiThinking: false,
      message: '紅方先行',
      history: [],
      historyIndex: -1,
    });
  },

  selectCell: (pos: Position) => {
    const { board, currentPlayer } = get();
    const cell = board[pos.row][pos.col];

    if (cell && cell.color === currentPlayer) {
      const moves = getValidMoves(board, pos);
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
    const nextPlayer: PieceColor = currentPlayer === 'red' ? 'black' : 'red';

    if (capturedPiece) {
      playCaptureSound();
    } else {
      playMoveSound();
    }

    const winner = checkWinner(newBoard);
    const stalemate = checkStalemate(newBoard, nextPlayer);

    if (winner) {
      playWinSound();
      set({
        board: newBoard,
        selectedCell: null,
        validMoves: [],
        phase: 'gameOver',
        winner,
        lastMove: { from: selectedCell, to },
        message: winner === get().playerColor ? '你贏了！' : '你輸了！',
        history: [...history.slice(0, historyIndex + 1), { board, currentPlayer, lastMove: { from: selectedCell, to }, message: `${currentPlayer === 'red' ? '紅方' : '黑方'}的回合` }],
        historyIndex: historyIndex + 1,
      });
      return;
    }

    if (stalemate) {
      playWinSound();
      set({
        board: newBoard,
        selectedCell: null,
        validMoves: [],
        phase: 'gameOver',
        winner: currentPlayer,
        lastMove: { from: selectedCell, to },
        message: '對方無子可動，你贏了！',
        history: [...history.slice(0, historyIndex + 1), { board, currentPlayer, lastMove: { from: selectedCell, to }, message: `${currentPlayer === 'red' ? '紅方' : '黑方'}的回合` }],
        historyIndex: historyIndex + 1,
      });
      return;
    }

    const newHistory = [...history.slice(0, historyIndex + 1), { board, currentPlayer, lastMove: { from: selectedCell, to }, message: `${currentPlayer === 'red' ? '紅方' : '黑方'}的回合` }];

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

    if (nextPlayer !== get().playerColor) {
      scheduleBrightTimer(() => get().executeAiTurn(), AI_TURN_DELAY_MS);
    }
  },

  handleCellClick: (pos: Position) => {
    const { board, currentPlayer, selectedCell, validMoves, phase, playerColor, isAiThinking } = get();

    if (phase !== 'playing') return;
    // Only the human may act, and only on their own turn (blocks clicking the
    // AI's pieces during the AI's think delay).
    if (isAiThinking || currentPlayer !== playerColor) return;

    const cell = board[pos.row][pos.col];

    if (selectedCell) {
      const isValidMove = validMoves.some(
        (m) => m.row === pos.row && m.col === pos.col
      );
      if (isValidMove) {
        get().executeMove(pos);
        return;
      }
    }

    if (cell && cell.color === currentPlayer) {
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

    scheduleBrightTimer(() => {
      const state = get();
      if (state.phase !== 'playing') return;
      if (state.currentPlayer !== aiColor) return;

      // The search runs off the main thread; capture the token so a reset/leave/
      // undo during computation discards this (now stale) result.
      const token = brightAiToken;

      void computeBrightAiMove(state.board, aiColor, state.aiDifficulty).then((aiMove) => {
        if (token !== brightAiToken) return;

        const s = get();
        if (s.phase !== 'playing' || s.currentPlayer !== aiColor) {
          if (s.isAiThinking) set({ isAiThinking: false });
          return;
        }

        if (!aiMove) {
          set({
            phase: 'gameOver',
            winner: s.playerColor,
            isAiThinking: false,
            message: '你贏了！',
          });
          return;
        }

        s.selectCell(aiMove.from);
        s.executeMove(aiMove.to);

        scheduleBrightTimer(() => {
          const s2 = get();
          if (s2.isAiThinking) {
            set({ isAiThinking: false });
          }
        }, AI_ACTION_SETTLE_DELAY_MS);
      });
    }, AI_TURN_DELAY_MS);
  },

  resetGame: () => {
    const { playerColor, aiDifficulty } = get();
    get().initGame(playerColor, aiDifficulty);
  },

  leaveGame: () => {
    clearBrightTimers();
    set({
      board: emptyBoard(),
      currentPlayer: 'red',
      selectedCell: null,
      validMoves: [],
      phase: 'playing',
      winner: null,
      playerColor: 'red',
      lastMove: null,
      isAiThinking: false,
      message: '',
      history: [],
      historyIndex: -1,
    });
  },

  undo: () => {
    const { history, historyIndex, playerColor } = get();
    if (historyIndex < 0) return;

    clearBrightTimers();

    // A single ply may land on the AI's turn (the AI would just replay). When
    // undoing against the AI, step back an extra ply so the human's own move is
    // actually taken back and it becomes the human's turn again.
    let targetIndex = historyIndex;
    if (history[targetIndex].currentPlayer !== playerColor && targetIndex > 0) {
      targetIndex -= 1;
    }

    const prevState = history[targetIndex];
    set({
      board: prevState.board,
      currentPlayer: prevState.currentPlayer,
      selectedCell: null,
      validMoves: [],
      lastMove: prevState.lastMove,
      message: prevState.message,
      historyIndex: targetIndex - 1,
      phase: 'playing',
      winner: null,
      isAiThinking: false,
    });

    // Only reschedule the AI if we genuinely landed on its turn (e.g. AI-first game).
    if (prevState.currentPlayer !== playerColor) {
      scheduleBrightTimer(() => get().executeAiTurn(), AI_TURN_DELAY_MS);
    }
  },

  canUndo: () => {
    return get().historyIndex >= 0 && get().phase === 'playing' && !get().isAiThinking;
  },
}));
