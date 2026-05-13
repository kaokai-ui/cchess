import type {
  Board,
  PieceColor,
  PieceType,
  Position,
} from '../types';

const ROWS = 10;
const COLS = 9;

// Initial setup for Bright Chess
const INITIAL_SETUP: { type: PieceType; color: PieceColor; row: number; col: number }[] = [
  // Black pieces
  { type: 'chariot', color: 'black', row: 0, col: 0 },
  { type: 'horse', color: 'black', row: 0, col: 1 },
  { type: 'elephant', color: 'black', row: 0, col: 2 },
  { type: 'advisor', color: 'black', row: 0, col: 3 },
  { type: 'general', color: 'black', row: 0, col: 4 },
  { type: 'advisor', color: 'black', row: 0, col: 5 },
  { type: 'elephant', color: 'black', row: 0, col: 6 },
  { type: 'horse', color: 'black', row: 0, col: 7 },
  { type: 'chariot', color: 'black', row: 0, col: 8 },
  { type: 'cannon', color: 'black', row: 2, col: 1 },
  { type: 'cannon', color: 'black', row: 2, col: 7 },
  { type: 'soldier', color: 'black', row: 3, col: 0 },
  { type: 'soldier', color: 'black', row: 3, col: 2 },
  { type: 'soldier', color: 'black', row: 3, col: 4 },
  { type: 'soldier', color: 'black', row: 3, col: 6 },
  { type: 'soldier', color: 'black', row: 3, col: 8 },

  // Red pieces
  { type: 'chariot', color: 'red', row: 9, col: 0 },
  { type: 'horse', color: 'red', row: 9, col: 1 },
  { type: 'elephant', color: 'red', row: 9, col: 2 },
  { type: 'advisor', color: 'red', row: 9, col: 3 },
  { type: 'general', color: 'red', row: 9, col: 4 },
  { type: 'advisor', color: 'red', row: 9, col: 5 },
  { type: 'elephant', color: 'red', row: 9, col: 6 },
  { type: 'horse', color: 'red', row: 9, col: 7 },
  { type: 'chariot', color: 'red', row: 9, col: 8 },
  { type: 'cannon', color: 'red', row: 7, col: 1 },
  { type: 'cannon', color: 'red', row: 7, col: 7 },
  { type: 'soldier', color: 'red', row: 6, col: 0 },
  { type: 'soldier', color: 'red', row: 6, col: 2 },
  { type: 'soldier', color: 'red', row: 6, col: 4 },
  { type: 'soldier', color: 'red', row: 6, col: 6 },
  { type: 'soldier', color: 'red', row: 6, col: 8 },
];

export function createInitialBoard(): Board {
  const board: Board = Array.from({ length: ROWS }, () => Array(COLS).fill(null));

  for (const p of INITIAL_SETUP) {
    board[p.row][p.col] = { type: p.type, color: p.color, revealed: true };
  }

  return board;
}

export function cloneBoard(board: Board): Board {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

function inBoard(row: number, col: number): boolean {
  return row >= 0 && row < ROWS && col >= 0 && col < COLS;
}

function inPalace(row: number, col: number, color: PieceColor): boolean {
  if (col < 3 || col > 5) return false;
  if (color === 'black') return row >= 0 && row <= 2;
  return row >= 7 && row <= 9;
}

function crossedRiver(row: number, color: PieceColor): boolean {
  if (color === 'red') return row <= 4;
  return row >= 5;
}

function getRawMoves(board: Board, pos: Position): Position[] {
  const piece = board[pos.row][pos.col];
  if (!piece) return [];

  const moves: Position[] = [];
  const { row, col } = pos;
  const color = piece.color;

  const addMove = (r: number, c: number) => {
    if (inBoard(r, c)) {
      const target = board[r][c];
      if (!target || target.color !== color) {
        moves.push({ row: r, col: c });
      }
    }
  };

  switch (piece.type) {
    case 'general': {
      const dirs = [
        [-1, 0], [1, 0], [0, -1], [0, 1],
      ];
      for (const [dr, dc] of dirs) {
        const nr = row + dr;
        const nc = col + dc;
        if (inPalace(nr, nc, color)) addMove(nr, nc);
      }
      break;
    }
    case 'advisor': {
      const dirs = [
        [-1, -1], [-1, 1], [1, -1], [1, 1],
      ];
      for (const [dr, dc] of dirs) {
        const nr = row + dr;
        const nc = col + dc;
        if (inPalace(nr, nc, color)) addMove(nr, nc);
      }
      break;
    }
    case 'elephant': {
      const dirs = [
        [-2, -2], [-2, 2], [2, -2], [2, 2],
      ];
      const eyes = [
        [-1, -1], [-1, 1], [1, -1], [1, 1],
      ];
      for (let i = 0; i < dirs.length; i++) {
        const nr = row + dirs[i][0];
        const nc = col + dirs[i][1];
        const er = row + eyes[i][0];
        const ec = col + eyes[i][1];
        
        if (inBoard(nr, nc) && !crossedRiver(nr, color)) {
          if (!board[er][ec]) { // Eye must be empty
            addMove(nr, nc);
          }
        }
      }
      break;
    }
    case 'horse': {
      const jumps = [
        [-2, -1, -1, 0], [-2, 1, -1, 0],
        [2, -1, 1, 0], [2, 1, 1, 0],
        [-1, -2, 0, -1], [-1, 2, 0, 1],
        [1, -2, 0, -1], [1, 2, 0, 1],
      ];
      for (const [dr, dc, br, bc] of jumps) {
        const nr = row + dr;
        const nc = col + dc;
        const blockR = row + br;
        const blockC = col + bc;
        
        if (inBoard(nr, nc) && !board[blockR][blockC]) {
          addMove(nr, nc);
        }
      }
      break;
    }
    case 'chariot': {
      const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dr, dc] of dirs) {
        let nr = row + dr;
        let nc = col + dc;
        while (inBoard(nr, nc)) {
          const target = board[nr][nc];
          if (!target) {
            moves.push({ row: nr, col: nc });
          } else {
            if (target.color !== color) moves.push({ row: nr, col: nc });
            break;
          }
          nr += dr;
          nc += dc;
        }
      }
      break;
    }
    case 'cannon': {
      const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
      for (const [dr, dc] of dirs) {
        let nr = row + dr;
        let nc = col + dc;
        let screenFound = false;
        while (inBoard(nr, nc)) {
          const target = board[nr][nc];
          if (!screenFound) {
            if (!target) {
              // Move to empty square (no jumping)
              moves.push({ row: nr, col: nc });
            } else {
              // Found the screen piece (mount)
              screenFound = true;
            }
          } else {
            // After screen, can only capture
            if (target) {
              if (target.color !== color) {
                moves.push({ row: nr, col: nc });
              }
              break; // Stop after the first piece behind the screen
            }
            // If target is null, it's an empty square behind the screen -> cannot move there
          }
          nr += dr;
          nc += dc;
        }
      }
      break;
    }
    case 'soldier': {
      const forward = color === 'red' ? -1 : 1;
      // Forward
      addMove(row + forward, col);
      // Sideways if crossed river
      if (crossedRiver(row, color)) {
        addMove(row, col - 1);
        addMove(row, col + 1);
      }
      break;
    }
  }

  return moves;
}

function findGeneral(board: Board, color: PieceColor): Position | null {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (p && p.type === 'general' && p.color === color) {
        return { row: r, col: c };
      }
    }
  }
  return null;
}

function isFlyingGeneral(board: Board): boolean {
  const redGen = findGeneral(board, 'red');
  const blackGen = findGeneral(board, 'black');

  if (!redGen || !blackGen) return false;
  if (redGen.col !== blackGen.col) return false;

  // Check if any pieces in between
  const minR = Math.min(redGen.row, blackGen.row);
  const maxR = Math.max(redGen.row, blackGen.row);
  for (let r = minR + 1; r < maxR; r++) {
    if (board[r][redGen.col]) return false;
  }

  return true;
}

export function isInCheck(board: Board, color: PieceColor): boolean {
  const genPos = findGeneral(board, color);
  if (!genPos) return true; // Should not happen in valid game

  const opponent = color === 'red' ? 'black' : 'red';

  // Check if any opponent piece can attack the general
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (p && p.color === opponent) {
        const moves = getRawMoves(board, { row: r, col: c });
        if (moves.some(m => m.row === genPos.row && m.col === genPos.col)) {
          return true;
        }
      }
    }
  }

  // Check flying general
  return isFlyingGeneral(board);
}

export function getValidMoves(board: Board, pos: Position): Position[] {
  const piece = board[pos.row][pos.col];
  if (!piece) return [];

  // This project intentionally allows moves that expose or leave the moving
  // side in check so players can enter and respond to check positions freely.
  return getRawMoves(board, pos);
}

export function hasAnyValidMove(board: Board, color: PieceColor): boolean {
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const p = board[r][c];
      if (p && p.color === color) {
        if (getValidMoves(board, { row: r, col: c }).length > 0) {
          return true;
        }
      }
    }
  }
  return false;
}

export function checkWinner(board: Board): PieceColor | null {
  const redGen = findGeneral(board, 'red');
  const blackGen = findGeneral(board, 'black');

  if (!redGen) return 'black';
  if (!blackGen) return 'red';

  return null;
}

export function checkStalemate(board: Board, currentPlayer: PieceColor): boolean {
  return !hasAnyValidMove(board, currentPlayer);
}

export function movePiece(board: Board, from: Position, to: Position): Board {
  const newBoard = cloneBoard(board);
  newBoard[to.row][to.col] = newBoard[from.row][from.col];
  newBoard[from.row][from.col] = null;
  return newBoard;
}
