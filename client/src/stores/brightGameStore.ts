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
import { getAIMove } from '../shared/bright-chess/ai';
import { playMoveSound, playCaptureSound, playWinSound } from '../utils/sound';

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
        history: [...history.slice(0, historyIndex + 1), { board, currentPlayer, lastMove: { from: selectedCell, to }, message: `${nextPlayer === 'red' ? '紅方' : '黑方'}的回合` }],
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
        history: [...history.slice(0, historyIndex + 1), { board, currentPlayer, lastMove: { from: selectedCell, to }, message: `${nextPlayer === 'red' ? '紅方' : '黑方'}的回合` }],
        historyIndex: historyIndex + 1,
      });
      return;
    }

    const newHistory = [...history.slice(0, historyIndex + 1), { board, currentPlayer, lastMove: { from: selectedCell, to }, message: `${nextPlayer === 'red' ? '紅方' : '黑方'}的回合` }];

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
      setTimeout(() => get().executeAiTurn(), 500);
    }
  },

  handleCellClick: (pos: Position) => {
    const { board, currentPlayer, selectedCell, validMoves, phase } = get();

    if (phase !== 'playing') return;

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

    setTimeout(() => {
      const state = get();
      if (state.phase !== 'playing') return;
      if (state.currentPlayer !== aiColor) return;

      const aiMove = getAIMove(state.board, aiColor, state.aiDifficulty);

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

      state.selectCell(aiMove.from);
      state.executeMove(aiMove.to);

      setTimeout(() => {
        const s = get();
        if (s.isAiThinking) {
          set({ isAiThinking: false });
        }
      }, 800);
    }, 500);
  },

  resetGame: () => {
    const { playerColor, aiDifficulty } = get();
    get().initGame(playerColor, aiDifficulty);
  },

  leaveGame: () => {
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

    const prevState = history[historyIndex];
    set({
      board: prevState.board,
      currentPlayer: prevState.currentPlayer,
      selectedCell: null,
      validMoves: [],
      lastMove: prevState.lastMove,
      message: prevState.message,
      historyIndex: historyIndex - 1,
      phase: 'playing',
      winner: null,
      isAiThinking: false,
    });

    if (prevState.currentPlayer !== playerColor) {
      setTimeout(() => get().executeAiTurn(), 500);
    }
  },

  canUndo: () => {
    return get().historyIndex >= 0 && get().phase === 'playing' && !get().isAiThinking;
  },
}));
