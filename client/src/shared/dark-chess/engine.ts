import type {
  Board,
  Cell,
  Piece,
  PieceColor,
  PieceType,
  Position,
} from '../types';
import { PIECE_RANK } from '../types';
import type { DarkChessSettings } from '../../stores/settingsStore';

const ROWS = 4;
const COLS = 8;

const DEFAULT_SETTINGS: DarkChessSettings = {
  rookCaptureRange: 'adjacent',
  cannonCaptureRule: 'needJump',
  soldierKillGeneral: true,
};

let currentSettings: DarkChessSettings = { ...DEFAULT_SETTINGS };

export function setSettings(settings: DarkChessSettings) {
  currentSettings = { ...settings };
}

export function getSettings(): DarkChessSettings {
  return { ...currentSettings };
}

const PIECE_COUNTS: Record<PieceType, number> = {
  general: 1,
  advisor: 2,
  elephant: 2,
  horse: 2,
  chariot: 2,
  cannon: 2,
  soldier: 5,
};

export function createInitialBoard(): Board {
  const pieces: Piece[] = [];

  for (const color of ['red', 'black'] as PieceColor[]) {
    for (const [type, count] of Object.entries(PIECE_COUNTS)) {
      for (let i = 0; i < count; i++) {
        pieces.push({ type: type as PieceType, color, revealed: false });
      }
    }
  }

  for (let i = pieces.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
  }

  const board: Board = [];
  let idx = 0;
  for (let row = 0; row < ROWS; row++) {
    const rowArr: Cell[] = [];
    for (let col = 0; col < COLS; col++) {
      rowArr.push(pieces[idx++]);
    }
    board.push(rowArr);
  }

  return board;
}

export function cloneBoard(board: Board): Board {
  return board.map((row) =>
    row.map((cell) => (cell ? { ...cell } : null))
  );
}

export function flipPiece(board: Board, pos: Position): Board {
  const newBoard = cloneBoard(board);
  const cell = newBoard[pos.row][pos.col];
  if (cell && !cell.revealed) {
    newBoard[pos.row][pos.col] = { ...cell, revealed: true };
  }
  return newBoard;
}

export function canCapture(attacker: Piece, defender: Piece): boolean {
  if (attacker.color === defender.color) return false;

  // In dark chess, cannon capture legality depends on the jump rule,
  // not piece rank. Rank checks are handled for non-cannon pieces below.
  if (attacker.type === 'cannon') {
    return true;
  }

  if (!currentSettings.soldierKillGeneral) {
    if (defender.type === 'general' && attacker.type === 'soldier') {
      return false;
    }
  } else {
    if (defender.type === 'general' && attacker.type === 'soldier') {
      return true;
    }
  }
  
  if (attacker.type === 'general' && defender.type === 'soldier') {
    return false;
  }

  return PIECE_RANK[attacker.type] >= PIECE_RANK[defender.type];
}

export function canMoveTo(
  board: Board,
  from: Position,
  to: Position,
  currentPlayer: PieceColor
): boolean {
  const fromCell = board[from.row][from.col];
  const toCell = board[to.row][to.col];

  if (!fromCell || !fromCell.revealed) return false;
  if (fromCell.color !== currentPlayer) return false;

  const rowDiff = Math.abs(from.row - to.row);
  const colDiff = Math.abs(from.col - to.col);
  const isStraightLine = rowDiff === 0 || colDiff === 0;

  // Moving to empty cell: must be adjacent
  if (!toCell) {
    return rowDiff + colDiff === 1;
  }

  // Cannot move to unrevealed or friendly pieces
  if (!toCell.revealed || toCell.color === fromCell.color) return false;

  // Capturing enemy cell
  if (fromCell.type === 'cannon') {
    if (!isStraightLine) return false;

    let piecesInBetween = 0;
    if (rowDiff > 0) {
      const start = Math.min(from.row, to.row);
      const end = Math.max(from.row, to.row);
      for (let r = start + 1; r < end; r++) {
        if (board[r][from.col]) piecesInBetween++;
      }
    } else {
      const start = Math.min(from.col, to.col);
      const end = Math.max(from.col, to.col);
      for (let c = start + 1; c < end; c++) {
        if (board[from.row][c]) piecesInBetween++;
      }
    }

    if (currentSettings.cannonCaptureRule === 'direct') {
      return piecesInBetween === 0 && canCapture(fromCell, toCell);
    }

    if (rowDiff + colDiff === 1) return false;
    return piecesInBetween === 1 && canCapture(fromCell, toCell);
  } else if (fromCell.type === 'chariot' && currentSettings.rookCaptureRange === 'fullLine') {
    if (!isStraightLine) return false;

    if (rowDiff > 0) {
      const start = Math.min(from.row, to.row);
      const end = Math.max(from.row, to.row);
      for (let r = start + 1; r < end; r++) {
        if (board[r][from.col]) return false;
      }
    } else {
      const start = Math.min(from.col, to.col);
      const end = Math.max(from.col, to.col);
      for (let c = start + 1; c < end; c++) {
        if (board[from.row][c]) return false;
      }
    }

    return canCapture(fromCell, toCell);
  } else {
    // Other pieces: adjacent only
    return rowDiff + colDiff === 1 && canCapture(fromCell, toCell);
  }
}

export function getValidMoves(
  board: Board,
  pos: Position,
  currentPlayer: PieceColor
): Position[] {
  const moves: Position[] = [];
  const cell = board[pos.row][pos.col];
  if (!cell) return moves;

  if (cell.type === 'cannon') {
    // Cannon moves: adjacent empty spots
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of dirs) {
      const r = pos.row + dr;
      const c = pos.col + dc;
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
        if (canMoveTo(board, pos, { row: r, col: c }, currentPlayer)) {
          moves.push({ row: r, col: c });
        }
      }
    }
    // Cannon captures: scan row and col
    for (let r = 0; r < ROWS; r++) {
      if (r !== pos.row) {
        if (canMoveTo(board, pos, { row: r, col: pos.col }, currentPlayer)) {
          moves.push({ row: r, col: pos.col });
        }
      }
    }
    for (let c = 0; c < COLS; c++) {
      if (c !== pos.col) {
        if (canMoveTo(board, pos, { row: pos.row, col: c }, currentPlayer)) {
          moves.push({ row: pos.row, col: c });
        }
      }
    }
  } else if (cell.type === 'chariot' && currentSettings.rookCaptureRange === 'fullLine') {
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of dirs) {
      let r = pos.row + dr;
      let c = pos.col + dc;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
        if (canMoveTo(board, pos, { row: r, col: c }, currentPlayer)) {
          moves.push({ row: r, col: c });
        }

        if (board[r][c]) {
          break;
        }

        r += dr;
        c += dc;
      }
    }
  } else {
    // Other pieces: adjacent only
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dr, dc] of dirs) {
      const r = pos.row + dr;
      const c = pos.col + dc;
      if (r >= 0 && r < ROWS && c >= 0 && c < COLS) {
        if (canMoveTo(board, pos, { row: r, col: c }, currentPlayer)) {
          moves.push({ row: r, col: c });
        }
      }
    }
  }
  return moves;
}

export function getValidFlips(board: Board): Position[] {
  const flips: Position[] = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (board[row][col] && !board[row][col]!.revealed) {
        flips.push({ row, col });
      }
    }
  }
  return flips;
}

export function movePiece(board: Board, from: Position, to: Position): Board {
  const newBoard = cloneBoard(board);
  newBoard[to.row][to.col] = newBoard[from.row][from.col];
  newBoard[from.row][from.col] = null;
  return newBoard;
}

export function countPieces(board: Board, color: PieceColor): number {
  let count = 0;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cell = board[row][col];
      if (cell && cell.revealed && cell.color === color) {
        count++;
      }
    }
  }
  return count;
}

export function countUnrevealed(board: Board): number {
  let count = 0;
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      if (board[row][col] && !board[row][col]!.revealed) {
        count++;
      }
    }
  }
  return count;
}

export function hasAnyValidMove(
  board: Board,
  color: PieceColor
): boolean {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      const cell = board[row][col];
      if (cell && cell.revealed && cell.color === color) {
        if (getValidMoves(board, { row, col }, color).length > 0) {
          return true;
        }
      }
    }
  }
  return false;
}

export function checkWinner(board: Board): PieceColor | null {
  const redCount = countPieces(board, 'red');
  const blackCount = countPieces(board, 'black');
  const unrevealed = countUnrevealed(board);

  if (redCount === 0 && blackCount === 0 && unrevealed === 0) return null;

  if (redCount === 0 && unrevealed === 0) return 'black';
  if (blackCount === 0 && unrevealed === 0) return 'red';

  return null;
}

export function checkStalemate(
  board: Board,
  currentPlayer: PieceColor
): boolean {
  const hasMoves = hasAnyValidMove(board, currentPlayer);
  const hasFlips = getValidFlips(board).length > 0;
  const unrevealed = countUnrevealed(board);

  if (!hasMoves && !hasFlips && unrevealed === 0) {
    return true;
  }

  if (!hasMoves && unrevealed > 0 && !hasFlips) {
    const opponent: PieceColor = currentPlayer === 'red' ? 'black' : 'red';
    const opponentHasMoves = hasAnyValidMove(board, opponent);
    if (!opponentHasMoves) {
      return true;
    }
  }

  return false;
}
