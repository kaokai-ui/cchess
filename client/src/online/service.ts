import { get, onDisconnect, onValue, ref, remove, runTransaction, set } from 'firebase/database';
import {
  checkStalemate as checkBrightStalemate,
  checkWinner as checkBrightWinner,
  createInitialBoard as createBrightBoard,
  getValidMoves as getBrightValidMoves,
  movePiece as moveBrightPiece,
} from '../shared/bright-chess/engine';
import {
  checkStalemate as checkDarkStalemate,
  checkWinner as checkDarkWinner,
  createInitialBoard as createDarkBoard,
  flipPiece,
  getSettings as getDarkSettings,
  getValidMoves as getDarkValidMoves,
  movePiece as moveDarkPiece,
  setSettings as setDarkSettings,
} from '../shared/dark-chess/engine';
import type { Position, PieceColor, Board, Cell, Piece } from '../shared/types';
import type { DarkChessSettings } from '../stores/settingsStore';
import {
  ensureAnonymousAuth,
  getFirebaseAuth,
  getFirebaseDatabase,
  isFirebaseConfigured,
} from '../firebase/app';
import type {
  AdminOverview,
  GameVariant,
  OnlineRoom,
  OnlineRoomSnapshot,
  PresenceSnapshot,
} from './types';

const ROOM_CODE_ALPHABET = '0123456789';
const ROOM_CODE_LENGTH = 5;
const EMPTY_CELL_MARKER = 0;
const BOARD_DIMENSIONS = {
  bright: { rows: 10, cols: 9 },
  dark: { rows: 4, cols: 8 },
} as const;

type SerializedBoardCell = Piece | typeof EMPTY_CELL_MARKER;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function normalizeIndexedCollection(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }

  if (!isRecord(value)) {
    return [];
  }

  const numericEntries = Object.entries(value)
    .filter(([key]) => /^\d+$/.test(key))
    .map(([key, entryValue]) => [Number(key), entryValue] as const)
    .sort((left, right) => left[0] - right[0]);

  if (numericEntries.length === 0) {
    return [];
  }

  const maxIndex = numericEntries[numericEntries.length - 1][0];
  const result: unknown[] = Array.from(
    { length: maxIndex + 1 },
    () => EMPTY_CELL_MARKER,
  );
  for (const [index, entryValue] of numericEntries) {
    result[index] = entryValue;
  }

  return result;
}

function deserializeCell(value: unknown): Cell {
  if (value === null || value === undefined || value === EMPTY_CELL_MARKER) {
    return null;
  }

  if (!isRecord(value)) {
    return null;
  }

  const type = typeof value.type === 'string' ? value.type : null;
  const color = typeof value.color === 'string' ? value.color : null;
  const revealed = Boolean(value.revealed);

  if (!type || !color) {
    return null;
  }

  return {
    type: type as Piece['type'],
    color: color as PieceColor,
    revealed,
  };
}

function serializeBoard(board: Board): SerializedBoardCell[][] {
  return board.map((row) =>
    row.map((cell) => (cell ? { ...cell } : EMPTY_CELL_MARKER)),
  );
}

function deserializeBoard(
  value: unknown,
  expectedRows: number,
  expectedCols: number,
): Board {
  const sourceRows = normalizeIndexedCollection(value);

  return Array.from({ length: expectedRows }, (_, rowIndex) => {
    const sourceCols = normalizeIndexedCollection(sourceRows[rowIndex]);
    return Array.from({ length: expectedCols }, (_, colIndex) =>
      deserializeCell(sourceCols[colIndex]),
    );
  });
}

function normalizeLastMove(value: unknown): { from: Position; to: Position } | null {
  if (!isRecord(value) || !isRecord(value.from) || !isRecord(value.to)) {
    return null;
  }

  if (
    typeof value.from.row !== 'number' ||
    typeof value.from.col !== 'number' ||
    typeof value.to.row !== 'number' ||
    typeof value.to.col !== 'number'
  ) {
    return null;
  }

  return {
    from: { row: value.from.row, col: value.from.col },
    to: { row: value.to.row, col: value.to.col },
  };
}

function normalizeRoom(value: unknown): OnlineRoom | null {
  if (!isRecord(value)) {
    return null;
  }

  const variant = value.variant === 'bright' ? 'bright' : 'dark';
  const dimensions = BOARD_DIMENSIONS[variant];

  return {
    roomId: typeof value.roomId === 'string' ? value.roomId : '',
    variant,
    status:
      value.status === 'playing' ||
      value.status === 'finished' ||
      value.status === 'abandoned'
        ? value.status
        : 'waiting',
    board: deserializeBoard(value.board, dimensions.rows, dimensions.cols),
    currentPlayer: value.currentPlayer === 'black' ? 'black' : 'red',
    activePlayerUid: typeof value.activePlayerUid === 'string' ? value.activePlayerUid : null,
    hostUid: typeof value.hostUid === 'string' ? value.hostUid : '',
    guestUid: typeof value.guestUid === 'string' ? value.guestUid : null,
    playerColors: isRecord(value.playerColors)
      ? Object.fromEntries(
          Object.entries(value.playerColors).map(([uid, color]) => [
            uid,
            color === 'red' || color === 'black' ? color : null,
          ]),
        )
      : {},
    phase: value.phase === 'gameOver' ? 'gameOver' : 'playing',
    winner: value.winner === 'red' || value.winner === 'black' ? value.winner : null,
    isFlippingFirst: Boolean(value.isFlippingFirst),
    lastMove: normalizeLastMove(value.lastMove),
    message: typeof value.message === 'string' ? value.message : '',
    createdAt: typeof value.createdAt === 'number' ? value.createdAt : Date.now(),
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : Date.now(),
    darkChessSettings: isRecord(value.darkChessSettings)
      ? {
          rookCaptureRange:
            value.darkChessSettings.rookCaptureRange === 'fullLine'
              ? 'fullLine'
              : 'adjacent',
          cannonCaptureRule:
            value.darkChessSettings.cannonCaptureRule === 'direct'
              ? 'direct'
              : 'needJump',
          soldierKillGeneral: Boolean(value.darkChessSettings.soldierKillGeneral),
        }
      : null,
  };
}

function serializeRoom(room: OnlineRoom) {
  return {
    ...room,
    board: serializeBoard(room.board),
    playerColors: room.playerColors ?? {},
    lastMove: room.lastMove ?? null,
  };
}

function requireConfiguredFirebase() {
  if (!isFirebaseConfigured) {
    throw new Error('Firebase 尚未設定，請先填入 `.env` 內的 Firebase 參數。');
  }
}

function requireDatabase() {
  const db = getFirebaseDatabase();
  if (!db) {
    throw new Error('Firebase Database 初始化失敗。');
  }

  return db;
}

function createRoomCode() {
  return Array.from({ length: ROOM_CODE_LENGTH }, () => {
    const index = Math.floor(Math.random() * ROOM_CODE_ALPHABET.length);
    return ROOM_CODE_ALPHABET[index];
  }).join('');
}

function otherColor(color: PieceColor): PieceColor {
  return color === 'red' ? 'black' : 'red';
}

function findOpponentUid(room: OnlineRoom, playerUid: string): string | null {
  if (room.hostUid === playerUid) {
    return room.guestUid;
  }

  if (room.guestUid === playerUid) {
    return room.hostUid;
  }

  return null;
}

function findUidByColor(room: OnlineRoom, color: PieceColor): string | null {
  return (
    Object.entries(room.playerColors ?? {}).find(([, playerColor]) => playerColor === color)?.[0] ||
    null
  );
}

function withDarkRuleSet<T>(
  settings: DarkChessSettings | null | undefined,
  callback: () => T,
): T {
  const previous = getDarkSettings();

  if (settings) {
    setDarkSettings(settings);
  }

  try {
    return callback();
  } finally {
    setDarkSettings(previous);
  }
}

function createInitialRoom(
  roomId: string,
  hostUid: string,
  variant: GameVariant,
  darkChessSettings: DarkChessSettings | null,
): OnlineRoom {
  if (variant === 'bright') {
    return {
      roomId,
      variant,
      status: 'waiting',
      board: createBrightBoard(),
      currentPlayer: 'red',
      activePlayerUid: hostUid,
      hostUid,
      guestUid: null,
      playerColors: {
        [hostUid]: 'red',
      },
      phase: 'playing',
      winner: null,
      isFlippingFirst: false,
      lastMove: null,
      message: '等待對手加入房間',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      darkChessSettings: null,
    };
  }

  return {
    roomId,
    variant,
    status: 'waiting',
    board: createDarkBoard(),
    currentPlayer: 'red',
    activePlayerUid: hostUid,
    hostUid,
    guestUid: null,
    playerColors: {},
    phase: 'playing',
    winner: null,
    isFlippingFirst: true,
    lastMove: null,
    message: '等待對手加入房間',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    darkChessSettings,
  };
}

function createRematchRoom(room: OnlineRoom): OnlineRoom {
  const updatedAt = Date.now();
  const hasGuest = Boolean(room.guestUid);

  if (room.variant === 'bright') {
    const playerColors: Record<string, PieceColor | null> = {
      [room.hostUid]: 'red',
    };

    if (room.guestUid) {
      playerColors[room.guestUid] = 'black';
    }

    return {
      ...room,
      status: hasGuest ? 'playing' : 'waiting',
      board: createBrightBoard(),
      currentPlayer: 'red',
      activePlayerUid: room.hostUid,
      playerColors,
      phase: 'playing',
      winner: null,
      isFlippingFirst: false,
      lastMove: null,
      message: hasGuest ? '紅方先行' : '等待對手加入房間',
      updatedAt,
    };
  }

  return {
    ...room,
    status: hasGuest ? 'playing' : 'waiting',
    board: createDarkBoard(),
    currentPlayer: 'red',
    activePlayerUid: room.hostUid,
    playerColors: {},
    phase: 'playing',
    winner: null,
    isFlippingFirst: true,
    lastMove: null,
    message: hasGuest ? '房主先翻第一顆棋子決定顏色' : '等待對手加入房間',
    updatedAt,
  };
}

async function registerPresence(
  roomId: string,
  userId: string,
  variant: GameVariant,
) {
  const db = requireDatabase();
  const now = Date.now();
  const presenceRef = ref(db, `roomPresence/${roomId}/${userId}`);
  const sessionRef = ref(db, `userSessions/${userId}`);

  await onDisconnect(presenceRef).remove();
  await onDisconnect(sessionRef).remove();

  await set(presenceRef, {
    connected: true,
    joinedAt: now,
    lastSeen: now,
  });

  await set(sessionRef, {
    connected: true,
    lastSeen: now,
    roomId,
    variant,
  });
}

async function clearPresence(roomId: string, userId: string) {
  const db = requireDatabase();
  await Promise.all([
    remove(ref(db, `roomPresence/${roomId}/${userId}`)),
    remove(ref(db, `userSessions/${userId}`)),
  ]);
}

export async function createOnlineRoom(
  variant: GameVariant,
  darkChessSettings: DarkChessSettings | null = null,
) {
  requireConfiguredFirebase();
  const db = requireDatabase();
  const user = await ensureAnonymousAuth();

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const roomId = createRoomCode();
    const roomRef = ref(db, `rooms/${roomId}`);
    const initialRoom = createInitialRoom(roomId, user.uid, variant, darkChessSettings);
    const result = await runTransaction(
      roomRef,
      (current) => {
        if (current !== null) {
          return;
        }

        return serializeRoom(initialRoom);
      },
      { applyLocally: false },
    );

    if (result.committed) {
      await registerPresence(roomId, user.uid, variant);
      return roomId;
    }
  }

  throw new Error('房號產生失敗，請再試一次。');
}

export async function joinOnlineRoom(roomId: string) {
  requireConfiguredFirebase();
  const db = requireDatabase();
  const normalizedRoomId = roomId.trim().toUpperCase();
  const user = await ensureAnonymousAuth();
  const roomRef = ref(db, `rooms/${normalizedRoomId}`);

  const existingRoomSnapshot = await get(roomRef);
  if (!existingRoomSnapshot.exists()) {
    throw new Error('房間不存在。');
  }

  const existingRoom = normalizeRoom(existingRoomSnapshot.val());
  if (!existingRoom) {
    throw new Error('房間資料格式異常。');
  }

  if (existingRoom.hostUid === user.uid) {
    throw new Error('目前這個瀏覽器就是房主，請用無痕視窗或另一個瀏覽器模擬第二位玩家。');
  }

  if (existingRoom.status !== 'waiting') {
    throw new Error('房間已開始或已結束，無法加入。');
  }

  if (existingRoom.guestUid) {
    throw new Error('房間已滿員。');
  }

  try {
    const updatedRoom: OnlineRoom = {
      ...existingRoom,
      guestUid: user.uid,
      status: 'playing',
      updatedAt: Date.now(),
      playerColors: { ...(existingRoom.playerColors ?? {}) },
      message:
        existingRoom.variant === 'bright'
          ? '紅方先行'
          : '房主先翻第一顆棋子決定顏色',
    };

    if (existingRoom.variant === 'bright') {
      updatedRoom.playerColors[user.uid] = 'black';
    }

    await set(roomRef, serializeRoom(updatedRoom));
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.toLowerCase().includes('permission_denied')) {
        throw new Error('Firebase 規則拒絕了加入房間的請求，請重新部署 database rules。', {
          cause: error,
        });
      }

      throw new Error(error.message, { cause: error });
    }

    throw new Error('加入房間失敗。', { cause: error });
  }

  const latestSnapshot = await get(roomRef);
  if (!latestSnapshot.exists()) {
    throw new Error('房間不存在。');
  }

  const room = normalizeRoom(latestSnapshot.val());
  if (!room) {
    throw new Error('房間資料格式異常。');
  }
  if (room.guestUid !== user.uid) {
    throw new Error('加入房間失敗，房間狀態未正確更新。');
  }

  await registerPresence(normalizedRoomId, user.uid, room.variant);
  return normalizedRoomId;
}

export async function leaveOnlineRoom(roomId: string) {
  requireConfiguredFirebase();
  const db = requireDatabase();
  const user = await ensureAnonymousAuth();
  const roomRef = ref(db, `rooms/${roomId}`);
  await get(roomRef);

  await runTransaction(
    roomRef,
    (current: OnlineRoom | null) => {
      const room = normalizeRoom(current);
      if (!room) {
        return current;
      }

      if (room.hostUid !== user.uid && room.guestUid !== user.uid) {
        return;
      }

      if (room.hostUid === user.uid && !room.guestUid) {
        return null;
      }

      const remainingUid = findOpponentUid(room, user.uid);
      const remainingColor = remainingUid ? room.playerColors?.[remainingUid] : null;

      room.status = 'abandoned';
      room.phase = 'gameOver';
      room.activePlayerUid = null;
      room.updatedAt = Date.now();
      room.message = '對手已離開房間';
      room.winner = remainingColor ?? null;

      return serializeRoom(room);
    },
    { applyLocally: false },
  );

  await clearPresence(roomId, user.uid);
}

export async function restartOnlineRoom(roomId: string) {
  requireConfiguredFirebase();
  const db = requireDatabase();
  const user = await ensureAnonymousAuth();
  const roomRef = ref(db, `rooms/${roomId}`);
  const snapshot = await get(roomRef);

  if (!snapshot.exists()) {
    throw new Error('房間不存在。');
  }

  const room = normalizeRoom(snapshot.val());
  if (!room) {
    throw new Error('房間資料格式異常。');
  }

  if (room.hostUid !== user.uid && room.guestUid !== user.uid) {
    throw new Error('你不在這個房間內。');
  }

  if (room.status === 'abandoned') {
    throw new Error('房間已中斷，無法繼續遊戲。');
  }

  if (!room.guestUid) {
    throw new Error('目前沒有第二位玩家，無法開始下一局。');
  }

  const nextRoom = createRematchRoom(room);
  await set(roomRef, serializeRoom(nextRoom));
}

export async function submitBrightMove(
  roomId: string,
  from: Position,
  to: Position,
) {
  requireConfiguredFirebase();
  const db = requireDatabase();
  const user = await ensureAnonymousAuth();
  const roomRef = ref(db, `rooms/${roomId}`);
  const snapshot = await get(roomRef);
  if (!snapshot.exists()) {
    throw new Error('房間不存在。');
  }

  const room = normalizeRoom(snapshot.val());
  if (!room || room.variant !== 'bright') {
    throw new Error('房間資料格式異常。');
  }

  if (room.phase !== 'playing' || room.status !== 'playing') {
    throw new Error('目前對局已結束。');
  }

  if (room.activePlayerUid !== user.uid) {
    throw new Error('現在還沒輪到你。');
  }

  const piece = room.board[from.row]?.[from.col];
  if (!piece || piece.color !== room.currentPlayer) {
    throw new Error('所選棋子不是目前可操作的棋子。');
  }

  const isValidMove = getBrightValidMoves(room.board, from).some(
    (candidate) => candidate.row === to.row && candidate.col === to.col,
  );

  if (!isValidMove) {
    throw new Error('這步棋不合法。');
  }

  const nextBoard = moveBrightPiece(room.board, from, to);
  const nextPlayer = otherColor(room.currentPlayer);
  const winner = checkBrightWinner(nextBoard);
  const stalemate = checkBrightStalemate(nextBoard, nextPlayer);

  room.board = nextBoard;
  room.lastMove = { from, to };
  room.updatedAt = Date.now();

  if (winner) {
    room.phase = 'gameOver';
    room.status = 'finished';
    room.winner = winner;
    room.activePlayerUid = null;
    room.message = `${winner === 'red' ? '紅方' : '黑方'}獲勝`;
  } else if (stalemate) {
    room.phase = 'gameOver';
    room.status = 'finished';
    room.winner = room.currentPlayer;
    room.activePlayerUid = null;
    room.message = '對方無子可動，遊戲結束';
  } else {
    room.currentPlayer = nextPlayer;
    room.activePlayerUid = findUidByColor(room, nextPlayer);
    room.message = `${nextPlayer === 'red' ? '紅方' : '黑方'}的回合`;
  }

  await set(roomRef, serializeRoom(room));
}

export async function submitDarkFlip(roomId: string, pos: Position) {
  requireConfiguredFirebase();
  const db = requireDatabase();
  const user = await ensureAnonymousAuth();
  const roomRef = ref(db, `rooms/${roomId}`);
  const snapshot = await get(roomRef);
  if (!snapshot.exists()) {
    throw new Error('房間不存在。');
  }

  const room = normalizeRoom(snapshot.val());
  if (!room || room.variant !== 'dark') {
    throw new Error('房間資料格式異常。');
  }

  const nextRoom = withDarkRuleSet(room.darkChessSettings, () => {
    if (room.phase !== 'playing' || room.status !== 'playing') {
      throw new Error('目前對局已結束。');
    }

    if (room.activePlayerUid !== user.uid) {
      throw new Error('現在還沒輪到你。');
    }

    const currentCell = room.board[pos.row]?.[pos.col];
    if (!currentCell || currentCell.revealed) {
      throw new Error('該位置不是可翻的蓋棋。');
    }

    const nextBoard = flipPiece(room.board, pos);
    const flippedPiece = nextBoard[pos.row]?.[pos.col];
    if (!flippedPiece) {
      throw new Error('翻棋後讀不到棋子資料。');
    }

    room.board = nextBoard;
    room.lastMove = null;
    room.updatedAt = Date.now();

    if (room.isFlippingFirst) {
      const opponentUid = findOpponentUid(room, user.uid);
      room.playerColors ??= {};
      room.playerColors[user.uid] = flippedPiece.color;

      if (opponentUid) {
        room.playerColors[opponentUid] = otherColor(flippedPiece.color);
      }

      room.isFlippingFirst = false;
      room.currentPlayer = otherColor(flippedPiece.color);
      room.activePlayerUid = opponentUid;
      room.message = `${room.currentPlayer === 'red' ? '紅方' : '黑方'}的回合`;
      return room;
    }

    const nextPlayer = otherColor(room.currentPlayer);
    const winner = checkDarkWinner(nextBoard);
    const stalemate = checkDarkStalemate(nextBoard, nextPlayer);

    if (winner) {
      room.phase = 'gameOver';
      room.status = 'finished';
      room.winner = winner;
      room.activePlayerUid = null;
      room.message = `${winner === 'red' ? '紅方' : '黑方'}獲勝`;
      return room;
    }

    if (stalemate) {
      room.phase = 'gameOver';
      room.status = 'finished';
      room.winner = null;
      room.activePlayerUid = null;
      room.message = '平手';
      return room;
    }

    room.currentPlayer = nextPlayer;
    room.activePlayerUid = findUidByColor(room, nextPlayer);
    room.message = `${nextPlayer === 'red' ? '紅方' : '黑方'}的回合`;
    return room;
  });

  await set(roomRef, serializeRoom(nextRoom));
}

export async function submitDarkMove(
  roomId: string,
  from: Position,
  to: Position,
) {
  requireConfiguredFirebase();
  const db = requireDatabase();
  const user = await ensureAnonymousAuth();
  const roomRef = ref(db, `rooms/${roomId}`);
  const snapshot = await get(roomRef);
  if (!snapshot.exists()) {
    throw new Error('房間不存在。');
  }

  const room = normalizeRoom(snapshot.val());
  if (!room || room.variant !== 'dark') {
    throw new Error('房間資料格式異常。');
  }

  const nextRoom = withDarkRuleSet(room.darkChessSettings, () => {
    if (room.phase !== 'playing' || room.status !== 'playing') {
      throw new Error('目前對局已結束。');
    }

    if (room.activePlayerUid !== user.uid) {
      throw new Error('現在還沒輪到你。');
    }

    const piece = room.board[from.row]?.[from.col];
    if (!piece || !piece.revealed || piece.color !== room.currentPlayer) {
      throw new Error('所選棋子不是目前可操作的棋子。');
    }

    const isValidMove = getDarkValidMoves(
      room.board,
      from,
      room.currentPlayer,
    ).some((candidate) => candidate.row === to.row && candidate.col === to.col);

    if (!isValidMove) {
      throw new Error('這步棋不合法。');
    }

    const nextBoard = moveDarkPiece(room.board, from, to);
    const nextPlayer = otherColor(room.currentPlayer);
    const winner = checkDarkWinner(nextBoard);
    const stalemate = checkDarkStalemate(nextBoard, nextPlayer);

    room.board = nextBoard;
    room.lastMove = { from, to };
    room.updatedAt = Date.now();

    if (winner) {
      room.phase = 'gameOver';
      room.status = 'finished';
      room.winner = winner;
      room.activePlayerUid = null;
      room.message = `${winner === 'red' ? '紅方' : '黑方'}獲勝`;
      return room;
    }

    if (stalemate) {
      room.phase = 'gameOver';
      room.status = 'finished';
      room.winner = null;
      room.activePlayerUid = null;
      room.message = '平手';
      return room;
    }

    room.currentPlayer = nextPlayer;
    room.activePlayerUid = findUidByColor(room, nextPlayer);
    room.message = `${nextPlayer === 'red' ? '紅方' : '黑方'}的回合`;
    return room;
  });

  await set(roomRef, serializeRoom(nextRoom));
}

export function subscribeToOnlineRoom(
  roomId: string,
  callback: (snapshot: OnlineRoomSnapshot) => void,
) {
  requireConfiguredFirebase();
  const db = requireDatabase();
  const roomRef = ref(db, `rooms/${roomId}`);
  const presenceRef = ref(db, `roomPresence/${roomId}`);

  let room: OnlineRoom | null = null;
  let presence: Record<string, PresenceSnapshot> = {};

  const emit = () => {
    callback({ room, presence });
  };

  const unsubscribeRoom = onValue(roomRef, (snapshot) => {
    room = snapshot.exists() ? normalizeRoom(snapshot.val()) : null;
    emit();
  });

  const unsubscribePresence = onValue(presenceRef, (snapshot) => {
    presence = snapshot.exists()
      ? (snapshot.val() as Record<string, PresenceSnapshot>)
      : {};
    emit();
  });

  return () => {
    unsubscribeRoom();
    unsubscribePresence();
  };
}

export function subscribeToAdminOverview(
  callback: (overview: AdminOverview) => void,
) {
  requireConfiguredFirebase();
  const db = requireDatabase();
  const roomsRef = ref(db, 'rooms');
  const sessionsRef = ref(db, 'userSessions');

  let rooms: AdminOverview['rooms'] = {};
  let sessions: AdminOverview['sessions'] = {};

  const emit = () => callback({ rooms, sessions });

  const unsubscribeRooms = onValue(roomsRef, (snapshot) => {
    rooms = snapshot.exists() ? (snapshot.val() as AdminOverview['rooms']) : {};
    emit();
  });

  const unsubscribeSessions = onValue(sessionsRef, (snapshot) => {
    sessions = snapshot.exists()
      ? (snapshot.val() as AdminOverview['sessions'])
      : {};
    emit();
  });

  return () => {
    unsubscribeRooms();
    unsubscribeSessions();
  };
}

export async function readRoom(roomId: string) {
  requireConfiguredFirebase();
  const db = requireDatabase();
  const snapshot = await get(ref(db, `rooms/${roomId}`));
  return snapshot.exists() ? normalizeRoom(snapshot.val()) : null;
}

export async function getCurrentUserId() {
  const auth = getFirebaseAuth();
  const user = auth?.currentUser ?? (await ensureAnonymousAuth());
  return user.uid;
}

export function getPlayerColor(room: OnlineRoom, userId: string) {
  return room.playerColors?.[userId] ?? null;
}

export function getRoomPlayerCount(room: OnlineRoom) {
  return [room.hostUid, room.guestUid].filter(Boolean).length;
}

export function isPlayerTurn(room: OnlineRoom, userId: string) {
  return room.activePlayerUid === userId && room.phase === 'playing' && room.status === 'playing';
}

export function getDarkValidMovesForRoom(
  board: Board,
  from: Position,
  currentPlayer: PieceColor,
  settings: DarkChessSettings | null,
) {
  return withDarkRuleSet(settings, () => getDarkValidMoves(board, from, currentPlayer));
}

export function getBrightValidMovesForRoom(board: Board, from: Position) {
  return getBrightValidMoves(board, from);
}
