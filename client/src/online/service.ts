import {
  get,
  onDisconnect,
  onValue,
  ref,
  remove,
  runTransaction,
  serverTimestamp,
  set,
  update,
} from 'firebase/database';
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
import {
  checkWinner as checkGomokuWinner,
  createInitialBoard as createGomokuBoard,
  isBoardFull as isGomokuBoardFull,
  isValidMove as isValidGomokuMove,
  placeStone as placeGomokuStone,
} from '../shared/gomoku/engine';
import type { Position, PieceColor, Board, Cell, Piece } from '../shared/types';
import type { GomokuBoard, GomokuCell, GomokuStone } from '../shared/gomoku/types';
import type { DarkChessSettings } from '../stores/settingsStore';
import {
  ensureAnonymousAuth,
  getFirebaseAuth,
  getFirebaseDatabase,
  isFirebaseConfigured,
} from '../firebase/app';
import type {
  GameVariant,
  OnlineRoom,
  OnlinePlayerColor,
  OnlineReconnectSeat,
  OnlineRoomReconnectResult,
  OnlineRoomSnapshot,
  PresenceSnapshot,
  RecentOnlineRoomSession,
} from './types';

const ROOM_CODE_ALPHABET = '0123456789';
const ROOM_CODE_LENGTH = 5;
const ROOM_RECONNECT_WINDOW_MS = 10 * 60 * 1000;
const EMPTY_CELL_MARKER = 0;
const ONLINE_PLAYER_KEY_STORAGE_KEY = 'cchess-online-player-key';
const RECENT_ONLINE_ROOM_STORAGE_KEY = 'cchess-online-room-session';
const BOARD_DIMENSIONS = {
  bright: { rows: 10, cols: 9 },
  dark: { rows: 4, cols: 8 },
  gomoku: { rows: 15, cols: 15 },
} as const;

type SerializedBoardCell = Piece | GomokuStone | typeof EMPTY_CELL_MARKER;
type RoomSeat = OnlineReconnectSeat;

interface UserSessionPayload {
  connected: boolean;
  lastSeen: number | Record<string, string>;
  playerKey: string;
  roomId: string | null;
  variant: GameVariant | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function safeReadLocalStorage(key: string) {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeWriteLocalStorage(key: string, value: string) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Ignore storage write failures and keep runtime behavior working.
  }
}

function safeRemoveLocalStorage(key: string) {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage cleanup failures.
  }
}

function createPlayerKey() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `player-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function getOrCreateOnlinePlayerKey() {
  const existing = safeReadLocalStorage(ONLINE_PLAYER_KEY_STORAGE_KEY)?.trim();
  if (existing) {
    return existing;
  }

  const next = createPlayerKey();
  safeWriteLocalStorage(ONLINE_PLAYER_KEY_STORAGE_KEY, next);
  return next;
}

function rememberRecentOnlineRoomSession(roomId: string, variant: GameVariant) {
  const payload: RecentOnlineRoomSession = {
    roomId,
    variant,
    updatedAt: Date.now(),
  };

  safeWriteLocalStorage(RECENT_ONLINE_ROOM_STORAGE_KEY, JSON.stringify(payload));
}

export function getRecentOnlineRoomSession(): RecentOnlineRoomSession | null {
  const raw = safeReadLocalStorage(RECENT_ONLINE_ROOM_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<RecentOnlineRoomSession>;
    if (
      typeof parsed.roomId !== 'string' ||
      (parsed.variant !== 'bright' &&
        parsed.variant !== 'dark' &&
        parsed.variant !== 'gomoku') ||
      typeof parsed.updatedAt !== 'number'
    ) {
      return null;
    }

    return {
      roomId: parsed.roomId,
      variant: parsed.variant,
      updatedAt: parsed.updatedAt,
    };
  } catch {
    return null;
  }
}

export function clearRecentOnlineRoomSession(roomId?: string) {
  const existing = getRecentOnlineRoomSession();
  if (roomId && existing?.roomId !== roomId) {
    return;
  }

  safeRemoveLocalStorage(RECENT_ONLINE_ROOM_STORAGE_KEY);
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

function deserializeGomokuCell(value: unknown): GomokuCell {
  if (value === 'black' || value === 'white') {
    return value;
  }

  return null;
}

function serializeBoard(board: Board | GomokuBoard, variant: GameVariant): SerializedBoardCell[][] {
  if (variant === 'gomoku') {
    return (board as GomokuBoard).map((row) =>
      row.map((cell) => (cell === 'black' || cell === 'white' ? cell : EMPTY_CELL_MARKER)),
    );
  }

  return (board as Board).map((row) =>
    row.map((cell) => (cell ? { ...cell } : EMPTY_CELL_MARKER)),
  );
}

function deserializeBoard(
  value: unknown,
  variant: GameVariant,
  expectedRows: number,
  expectedCols: number,
): Board | GomokuBoard {
  const sourceRows = normalizeIndexedCollection(value);

  if (variant === 'gomoku') {
    return Array.from({ length: expectedRows }, (_, rowIndex) => {
      const sourceCols = normalizeIndexedCollection(sourceRows[rowIndex]);
      return Array.from({ length: expectedCols }, (_, colIndex) =>
        deserializeGomokuCell(sourceCols[colIndex]),
      );
    }) as GomokuBoard;
  }

  return Array.from({ length: expectedRows }, (_, rowIndex) => {
    const sourceCols = normalizeIndexedCollection(sourceRows[rowIndex]);
    return Array.from({ length: expectedCols }, (_, colIndex) =>
      deserializeCell(sourceCols[colIndex]),
    );
  }) as Board;
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

  const variant =
    value.variant === 'bright'
      ? 'bright'
      : value.variant === 'gomoku'
      ? 'gomoku'
      : 'dark';
  const dimensions = BOARD_DIMENSIONS[variant];

  const baseRoom = {
    roomId: typeof value.roomId === 'string' ? value.roomId : '',
    variant,
    status:
      value.status === 'playing' ||
      value.status === 'finished' ||
      value.status === 'abandoned'
        ? value.status
        : 'waiting',
    activePlayerUid: typeof value.activePlayerUid === 'string' ? value.activePlayerUid : null,
    hostUid: typeof value.hostUid === 'string' ? value.hostUid : '',
    guestUid: typeof value.guestUid === 'string' ? value.guestUid : null,
    phase: value.phase === 'gameOver' ? 'gameOver' : 'playing',
    lastMove: normalizeLastMove(value.lastMove),
    message: typeof value.message === 'string' ? value.message : '',
    createdAt: typeof value.createdAt === 'number' ? value.createdAt : Date.now(),
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : Date.now(),
    reconnectSeat:
      value.reconnectSeat === 'host' || value.reconnectSeat === 'guest'
        ? value.reconnectSeat
        : null,
    reconnectPlayerKey:
      typeof value.reconnectPlayerKey === 'string' ? value.reconnectPlayerKey : null,
    reconnectDeadlineAt:
      typeof value.reconnectDeadlineAt === 'number' ? value.reconnectDeadlineAt : null,
    pausedMessage: typeof value.pausedMessage === 'string' ? value.pausedMessage : null,
  } as const;

  if (variant === 'gomoku') {
    return {
      ...baseRoom,
      variant: 'gomoku',
      board: deserializeBoard(value.board, variant, dimensions.rows, dimensions.cols) as GomokuBoard,
      currentPlayer: value.currentPlayer === 'white' ? 'white' : 'black',
      playerColors: isRecord(value.playerColors)
        ? Object.fromEntries(
            Object.entries(value.playerColors).map(([uid, color]) => [
              uid,
              color === 'black' || color === 'white' ? color : null,
            ]),
          )
        : {},
      winner: value.winner === 'black' || value.winner === 'white' ? value.winner : null,
      isFlippingFirst: false,
      darkChessSettings: null,
    };
  }

  if (variant === 'bright') {
    return {
      ...baseRoom,
      variant: 'bright',
      board: deserializeBoard(value.board, variant, dimensions.rows, dimensions.cols) as Board,
      currentPlayer: value.currentPlayer === 'black' ? 'black' : 'red',
      playerColors: isRecord(value.playerColors)
        ? Object.fromEntries(
            Object.entries(value.playerColors).map(([uid, color]) => [
              uid,
              color === 'red' || color === 'black' ? color : null,
            ]),
          )
        : {},
      winner: value.winner === 'red' || value.winner === 'black' ? value.winner : null,
      isFlippingFirst: false,
      darkChessSettings: null,
    };
  }

  return {
    ...baseRoom,
    variant: 'dark',
    board: deserializeBoard(value.board, variant, dimensions.rows, dimensions.cols) as Board,
    currentPlayer: value.currentPlayer === 'black' ? 'black' : 'red',
    playerColors: isRecord(value.playerColors)
      ? Object.fromEntries(
          Object.entries(value.playerColors).map(([uid, color]) => [
            uid,
            color === 'red' || color === 'black' ? color : null,
          ]),
        )
      : {},
    winner: value.winner === 'red' || value.winner === 'black' ? value.winner : null,
    isFlippingFirst: Boolean(value.isFlippingFirst),
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
    board: serializeBoard(room.board, room.variant),
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

function otherChessColor(color: PieceColor): PieceColor {
  return color === 'red' ? 'black' : 'red';
}

function otherGomokuStone(stone: GomokuStone): GomokuStone {
  return stone === 'black' ? 'white' : 'black';
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

function findUidByColor(room: OnlineRoom, color: OnlinePlayerColor): string | null {
  return (
    Object.entries(room.playerColors ?? {}).find(([, playerColor]) => playerColor === color)?.[0] ||
    null
  );
}

function isPermissionDeniedError(error: unknown) {
  return (
    error instanceof Error &&
    error.message.toLowerCase().includes('permission_denied')
  );
}

function movePlayerColorClaim(room: OnlineRoom, fromUid: string, toUid: string) {
  if (fromUid === toUid) {
    return;
  }

  const fromColor = room.playerColors?.[fromUid] ?? null;
  if (!fromColor) {
    return;
  }

  room.playerColors ??= {};
  room.playerColors[toUid] = fromColor;
  delete room.playerColors[fromUid];
}

function getSeatUid(room: OnlineRoom, seat: RoomSeat) {
  return seat === 'host' ? room.hostUid : room.guestUid;
}

function setSeatUid(room: OnlineRoom, seat: RoomSeat, uid: string) {
  if (seat === 'host') {
    room.hostUid = uid;
    return;
  }

  room.guestUid = uid;
}

function clearReconnectState(room: OnlineRoom) {
  room.reconnectSeat = null;
  room.reconnectPlayerKey = null;
  room.reconnectDeadlineAt = null;
  room.pausedMessage = null;
}

function hasReconnectReservation(room: OnlineRoom) {
  return Boolean(room.reconnectSeat && room.reconnectPlayerKey && room.reconnectDeadlineAt);
}

function isReconnectWindowActive(room: OnlineRoom, now = Date.now()) {
  return hasReconnectReservation(room) && (room.reconnectDeadlineAt as number) > now;
}

function getReconnectSeatUserId(room: OnlineRoom) {
  return room.reconnectSeat ? getSeatUid(room, room.reconnectSeat) : null;
}

function getReconnectResumeMessage(room: OnlineRoom) {
  if (room.pausedMessage) {
    return room.pausedMessage;
  }

  if (room.variant === 'bright') {
    return `${room.currentPlayer === 'red' ? '紅方' : '黑方'}的回合`;
  }

  if (room.variant === 'gomoku') {
    return `${room.currentPlayer === 'black' ? '黑子' : '白子'}先手`;
  }

  if (room.isFlippingFirst) {
    return room.activePlayerUid === room.hostUid
      ? '房主先翻第一顆棋子決定顏色'
      : '上一局獲勝者先翻第一顆棋子決定顏色';
  }

  return `${room.currentPlayer === 'red' ? '紅方' : '黑方'}的回合`;
}

function resumeRoomFromReconnect(room: OnlineRoom) {
  room.status = room.guestUid ? 'playing' : 'waiting';
  room.message = getReconnectResumeMessage(room);
  room.updatedAt = Date.now();
  clearReconnectState(room);
}

function getReconnectReservationError() {
  return '房間正在保留給原玩家，對方可在 10 分鐘內用原房號返回繼續遊戲。';
}

function applySeatReclaim(room: OnlineRoom, seat: RoomSeat, uid: string) {
  const previousUid = getSeatUid(room, seat);
  if (!previousUid || previousUid === uid) {
    return false;
  }

  setSeatUid(room, seat, uid);
  movePlayerColorClaim(room, previousUid, uid);

  if (room.activePlayerUid === previousUid) {
    room.activePlayerUid = uid;
  }

  room.updatedAt = Date.now();
  return true;
}

async function resolveExpiredReconnectReservation(roomId: string) {
  const db = requireDatabase();
  const roomRef = ref(db, `rooms/${roomId}`);

  const result = await runTransaction(
    roomRef,
    (current) => {
      const room = normalizeRoom(current);
      if (!room || !hasReconnectReservation(room) || isReconnectWindowActive(room)) {
        return current;
      }

      const reconnectSeat = room.reconnectSeat;
      const remainingUid =
        reconnectSeat === 'host' ? room.guestUid : reconnectSeat === 'guest' ? room.hostUid : null;
      const remainingColor = remainingUid ? room.playerColors?.[remainingUid] : null;

      room.status = 'abandoned';
      room.phase = 'gameOver';
      room.activePlayerUid = null;
      room.updatedAt = Date.now();
      room.message = '對手未在 10 分鐘內返回，對局已結束。';
      room.winner = remainingColor ?? null;
      clearReconnectState(room);

      return serializeRoom(room);
    },
    { applyLocally: false },
  );

  return result.committed;
}

async function upsertUserSession(userId: string, payload: UserSessionPayload) {
  const db = requireDatabase();
  await update(ref(db, `userSessions/${userId}`), payload);
}

async function ensureUserSessionIdentity(userId: string) {
  await upsertUserSession(userId, {
    connected: false,
    lastSeen: Date.now(),
    playerKey: getOrCreateOnlinePlayerKey(),
    roomId: null,
    variant: null,
  });
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
      reconnectSeat: null,
      reconnectPlayerKey: null,
      reconnectDeadlineAt: null,
      pausedMessage: null,
      darkChessSettings: null,
    };
  }

  if (variant === 'gomoku') {
    return {
      roomId,
      variant,
      status: 'waiting',
      board: createGomokuBoard(),
      currentPlayer: 'black',
      activePlayerUid: hostUid,
      hostUid,
      guestUid: null,
      playerColors: {
        [hostUid]: 'black',
      },
      phase: 'playing',
      winner: null,
      isFlippingFirst: false,
      lastMove: null,
      message: '等待玩家加入房間',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      reconnectSeat: null,
      reconnectPlayerKey: null,
      reconnectDeadlineAt: null,
      pausedMessage: null,
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
    reconnectSeat: null,
    reconnectPlayerKey: null,
    reconnectDeadlineAt: null,
    pausedMessage: null,
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
      reconnectSeat: null,
      reconnectPlayerKey: null,
      reconnectDeadlineAt: null,
      pausedMessage: null,
    };
  }

  if (room.variant === 'gomoku') {
    const starterStone: GomokuStone =
      room.winner === 'black' || room.winner === 'white' ? room.winner : 'black';
    const playerColors: Record<string, GomokuStone | null> = {
      [room.hostUid]: 'black',
    };

    if (room.guestUid) {
      playerColors[room.guestUid] = 'white';
    }

    return {
      ...room,
      status: hasGuest ? 'playing' : 'waiting',
      board: createGomokuBoard(),
      currentPlayer: starterStone,
      activePlayerUid: findUidByColor({ ...room, playerColors }, starterStone),
      playerColors,
      phase: 'playing',
      winner: null,
      isFlippingFirst: false,
      lastMove: null,
      message: hasGuest ? `${starterStone === 'black' ? '黑子' : '白子'}先手` : '等待玩家加入房間',
      updatedAt,
      reconnectSeat: null,
      reconnectPlayerKey: null,
      reconnectDeadlineAt: null,
      pausedMessage: null,
      darkChessSettings: null,
    };
  }

  const starterUid =
    room.winner === 'red' || room.winner === 'black'
      ? findUidByColor(room, room.winner)
      : room.hostUid;

  return {
    ...room,
    status: hasGuest ? 'playing' : 'waiting',
    board: createDarkBoard(),
    currentPlayer: 'red',
    activePlayerUid: starterUid ?? room.hostUid,
    playerColors: {},
    phase: 'playing',
    winner: null,
    isFlippingFirst: true,
    lastMove: null,
    message:
      hasGuest
        ? room.winner
          ? '上一局獲勝者先翻第一顆棋子決定顏色'
          : '房主先翻第一顆棋子決定顏色'
        : '等待對手加入房間',
    updatedAt,
    reconnectSeat: null,
    reconnectPlayerKey: null,
    reconnectDeadlineAt: null,
    pausedMessage: null,
  };
}

async function registerPresence(
  roomId: string,
  userId: string,
  variant: GameVariant,
) {
  const db = requireDatabase();
  const now = Date.now();
  const playerKey = getOrCreateOnlinePlayerKey();
  const presenceRef = ref(db, `roomPresence/${roomId}/${userId}`);
  const sessionRef = ref(db, `userSessions/${userId}`);

  await onDisconnect(presenceRef).remove();
  await onDisconnect(sessionRef).update({
    connected: false,
    lastSeen: serverTimestamp(),
    playerKey,
    roomId,
    variant,
  });

  await set(presenceRef, {
    connected: true,
    joinedAt: now,
    lastSeen: now,
  });

  await update(sessionRef, {
    connected: true,
    lastSeen: now,
    playerKey,
    roomId,
    variant,
  });

  rememberRecentOnlineRoomSession(roomId, variant);
}

async function clearPresence(
  roomId: string,
  userId: string,
  variant: GameVariant | null,
) {
  const db = requireDatabase();
  await Promise.all([
    remove(ref(db, `roomPresence/${roomId}/${userId}`)),
    upsertUserSession(userId, {
      connected: false,
      lastSeen: Date.now(),
      playerKey: getOrCreateOnlinePlayerKey(),
      roomId: null,
      variant,
    }),
  ]);
}

async function attemptSeatReclaim(
  roomId: string,
  seat: RoomSeat,
  userId: string,
  playerKey: string,
) {
  const db = requireDatabase();
  const roomRef = ref(db, `rooms/${roomId}`);

  try {
    const result = await runTransaction(
      roomRef,
      (current) => {
        const room = normalizeRoom(current);
        if (!room) {
          return current;
        }

        if (
          room.reconnectSeat !== seat ||
          room.reconnectPlayerKey !== playerKey ||
          !isReconnectWindowActive(room)
        ) {
          return current;
        }

        const changed = applySeatReclaim(room, seat, userId);
        if (!changed) {
          return current;
        }

        resumeRoomFromReconnect(room);
        return serializeRoom(room);
      },
      { applyLocally: false },
    );

    return result.committed;
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      return false;
    }

    throw error;
  }
}

async function resumeReconnectReservation(roomId: string, userId: string) {
  const db = requireDatabase();
  const roomRef = ref(db, `rooms/${roomId}`);

  try {
    const result = await runTransaction(
      roomRef,
      (current) => {
        const room = normalizeRoom(current);
        if (
          !room ||
          !hasReconnectReservation(room) ||
          !isReconnectWindowActive(room) ||
          getReconnectSeatUserId(room) !== userId
        ) {
          return current;
        }

        resumeRoomFromReconnect(room);
        return serializeRoom(room);
      },
      { applyLocally: false },
    );

    return result.committed;
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      return false;
    }

    throw error;
  }
}

export async function reconnectOnlineRoom(
  roomId: string,
): Promise<OnlineRoomReconnectResult> {
  requireConfiguredFirebase();
  const normalizedRoomId = roomId.trim().toUpperCase();
  const user = await ensureAnonymousAuth();
  const playerKey = getOrCreateOnlinePlayerKey();
  await ensureUserSessionIdentity(user.uid);

  let room = await readRoom(normalizedRoomId);
  if (!room) {
    clearRecentOnlineRoomSession(normalizedRoomId);
    return {
      room: null,
      userId: user.uid,
      isMember: false,
      reclaimed: false,
    };
  }

  let reclaimed = false;

  if (hasReconnectReservation(room) && !isReconnectWindowActive(room)) {
    await resolveExpiredReconnectReservation(normalizedRoomId);
    room = await readRoom(normalizedRoomId);
  }

  if (!room) {
    clearRecentOnlineRoomSession(normalizedRoomId);
    return {
      room: null,
      userId: user.uid,
      isMember: false,
      reclaimed: false,
    };
  }

  if (room.hostUid !== user.uid && room.guestUid !== user.uid) {
    const hostReclaimed = await attemptSeatReclaim(normalizedRoomId, 'host', user.uid, playerKey);
    const guestReclaimed = hostReclaimed
      ? false
      : await attemptSeatReclaim(normalizedRoomId, 'guest', user.uid, playerKey);

    reclaimed = hostReclaimed || guestReclaimed;
    room = await readRoom(normalizedRoomId);
  }

  const isMember = Boolean(room && (room.hostUid === user.uid || room.guestUid === user.uid));

  if (room && isMember) {
    if (hasReconnectReservation(room) && isReconnectWindowActive(room)) {
      await resumeReconnectReservation(normalizedRoomId, user.uid);
      room = (await readRoom(normalizedRoomId)) ?? room;
    }

    await registerPresence(normalizedRoomId, user.uid, room.variant);
  }

  return {
    room,
    userId: user.uid,
    isMember,
    reclaimed,
  };
}

export async function createOnlineRoom(
  variant: GameVariant,
  darkChessSettings: DarkChessSettings | null = null,
) {
  requireConfiguredFirebase();
  const db = requireDatabase();
  const user = await ensureAnonymousAuth();
  await ensureUserSessionIdentity(user.uid);

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
  await ensureUserSessionIdentity(user.uid);
  const roomRef = ref(db, `rooms/${normalizedRoomId}`);

  const existingRoomSnapshot = await get(roomRef);
  if (!existingRoomSnapshot.exists()) {
    throw new Error('房間不存在。');
  }

  const existingRoom = normalizeRoom(existingRoomSnapshot.val());
  if (!existingRoom) {
    throw new Error('房間資料格式異常。');
  }

  if (hasReconnectReservation(existingRoom) && !isReconnectWindowActive(existingRoom)) {
    await resolveExpiredReconnectReservation(normalizedRoomId);
  }

  const reconnectResult = await reconnectOnlineRoom(normalizedRoomId);
  if (reconnectResult.isMember) {
    return normalizedRoomId;
  }

  const latestRoom = (await readRoom(normalizedRoomId)) ?? existingRoom;

  if (latestRoom.hostUid === user.uid && !reconnectResult.isMember) {
    throw new Error('目前這個瀏覽器就是房主，請用無痕視窗或另一個瀏覽器模擬第二位玩家。');
  }

  if (hasReconnectReservation(latestRoom) && isReconnectWindowActive(latestRoom)) {
    throw new Error(getReconnectReservationError());
  }

  if (latestRoom.status !== 'waiting') {
    throw new Error('房間已開始或已結束，無法加入。');
  }

  if (latestRoom.guestUid) {
    throw new Error('房間已滿員。');
  }

  try {
    let updatedRoom: OnlineRoom;

    if (latestRoom.variant === 'bright') {
      updatedRoom = {
        ...latestRoom,
        guestUid: user.uid,
        status: 'playing',
        updatedAt: Date.now(),
        playerColors: {
          ...(latestRoom.playerColors ?? {}),
          [user.uid]: 'black',
        },
        message: '紅方先行',
      };
    } else if (latestRoom.variant === 'gomoku') {
      updatedRoom = {
        ...latestRoom,
        guestUid: user.uid,
        status: 'playing',
        updatedAt: Date.now(),
        playerColors: {
          ...(latestRoom.playerColors ?? {}),
          [user.uid]: 'white',
        },
        message: '黑子先手',
      };
    } else {
      updatedRoom = {
        ...latestRoom,
        guestUid: user.uid,
        status: 'playing',
        updatedAt: Date.now(),
        playerColors: { ...(latestRoom.playerColors ?? {}) },
        message: '房主先翻第一顆棋子決定顏色',
      };
    }

    clearReconnectState(updatedRoom);

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
  const playerKey = getOrCreateOnlinePlayerKey();
  const roomRef = ref(db, `rooms/${roomId}`);
  const roomSnapshot = await get(roomRef);
  const room = roomSnapshot.exists() ? normalizeRoom(roomSnapshot.val()) : null;
  const shouldKeepRecentSession = Boolean(
    room &&
      room.phase === 'playing' &&
      room.status === 'playing' &&
      findOpponentUid(room, user.uid),
  );

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
      const now = Date.now();

      if (room.phase === 'playing' && room.status === 'playing' && remainingUid) {
        room.status = 'waiting';
        room.updatedAt = now;
        room.reconnectSeat = room.hostUid === user.uid ? 'host' : 'guest';
        room.reconnectPlayerKey = playerKey;
        room.reconnectDeadlineAt = now + ROOM_RECONNECT_WINDOW_MS;
        room.pausedMessage = room.message;
        room.message = '對手已離開房間，10 分鐘內可用原房號返回繼續遊戲。';
        return serializeRoom(room);
      }

      room.status = 'abandoned';
      room.phase = 'gameOver';
      room.activePlayerUid = null;
      room.updatedAt = now;
      room.message = '對手已離開房間';
      room.winner = remainingColor ?? null;
      clearReconnectState(room);

      return serializeRoom(room);
    },
    { applyLocally: false },
  );

  await clearPresence(roomId, user.uid, room?.variant ?? null);
  if (!shouldKeepRecentSession) {
    clearRecentOnlineRoomSession(roomId);
  }
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

export async function submitGomokuMove(roomId: string, pos: Position) {
  requireConfiguredFirebase();
  const db = requireDatabase();
  const user = await ensureAnonymousAuth();
  const roomRef = ref(db, `rooms/${roomId}`);
  const snapshot = await get(roomRef);

  if (!snapshot.exists()) {
    throw new Error('找不到房間。');
  }

  const room = normalizeRoom(snapshot.val());
  if (!room || room.variant !== 'gomoku') {
    throw new Error('房間資料無效。');
  }

  if (room.phase !== 'playing' || room.status !== 'playing') {
    throw new Error('這局已經結束。');
  }

  if (room.activePlayerUid !== user.uid) {
    throw new Error('現在不是你的回合。');
  }

  if (!isValidGomokuMove(room.board, pos)) {
    throw new Error('這個位置不能落子。');
  }

  const nextBoard = placeGomokuStone(room.board, pos, room.currentPlayer);
  const nextPlayer = otherGomokuStone(room.currentPlayer);
  const winner = checkGomokuWinner(nextBoard, pos);
  const boardFull = isGomokuBoardFull(nextBoard);

  room.board = nextBoard;
  room.lastMove = { from: pos, to: pos };
  room.updatedAt = Date.now();

  if (winner) {
    room.phase = 'gameOver';
    room.status = 'finished';
    room.winner = winner;
    room.activePlayerUid = null;
    room.message = `${winner === 'black' ? '黑子' : '白子'}獲勝`;
  } else if (boardFull) {
    room.phase = 'gameOver';
    room.status = 'finished';
    room.winner = null;
    room.activePlayerUid = null;
    room.message = '平手，棋盤已滿';
  } else {
    room.currentPlayer = nextPlayer;
    room.activePlayerUid = findUidByColor(room, nextPlayer);
    room.message = `${nextPlayer === 'black' ? '黑子' : '白子'}的回合`;
  }

  await set(roomRef, serializeRoom(room));
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
  const nextPlayer = otherChessColor(room.currentPlayer);
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
        room.playerColors[opponentUid] = otherChessColor(flippedPiece.color);
      }

      room.isFlippingFirst = false;
      room.currentPlayer = otherChessColor(flippedPiece.color);
      room.activePlayerUid = opponentUid;
      room.message = `${room.currentPlayer === 'red' ? '紅方' : '黑方'}的回合`;
      return room;
    }

    const nextPlayer = otherChessColor(room.currentPlayer);
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
    const nextPlayer = otherChessColor(room.currentPlayer);
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

export async function submitDarkSurrender(roomId: string) {
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

  if (room.phase !== 'playing' || room.status !== 'playing') {
    throw new Error('目前對局已結束。');
  }

  if (room.hostUid !== user.uid && room.guestUid !== user.uid) {
    throw new Error('你不在這個房間內。');
  }

  const surrenderColor = room.playerColors?.[user.uid] ?? null;
  if (surrenderColor !== 'red' && surrenderColor !== 'black') {
    throw new Error('尚未分出紅黑，暫時無法投降。');
  }

  const winner = otherChessColor(surrenderColor);
  room.phase = 'gameOver';
  room.status = 'finished';
  room.winner = winner;
  room.activePlayerUid = null;
  room.updatedAt = Date.now();
  room.message = `${surrenderColor === 'red' ? '紅子' : '黑子'}投降，本局${winner === 'red' ? '紅子' : '黑子'}獲勝`;

  await set(roomRef, serializeRoom(room));
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
