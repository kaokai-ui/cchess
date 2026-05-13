import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously, type Auth } from 'firebase/auth';
import { get, getDatabase, ref, remove, runTransaction, set, type Database } from 'firebase/database';
import {
  checkStalemate,
  checkWinner,
  createInitialBoard,
  flipPiece,
  getSettings,
  getValidMoves,
  movePiece,
  setSettings,
} from '../src/shared/dark-chess/engine';
import type { Board, Cell, Piece, PieceColor, Position } from '../src/shared/types';
import type { OnlineRoom } from '../src/online/types';
import type { DarkChessSettings } from '../src/stores/settingsStore';

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 6;
const EMPTY_CELL_MARKER = 0;
const DARK_ROWS = 4;
const DARK_COLS = 8;
const TOTAL_GAMES = 2;

type SerializedBoardCell = Piece | typeof EMPTY_CELL_MARKER;

type Action =
  | { kind: 'flip'; pos: Position }
  | { kind: 'move'; from: Position; to: Position };

interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  appId: string;
  databaseURL: string;
  projectId: string;
  messagingSenderId?: string;
  storageBucket?: string;
}

interface StepExpectation {
  currentPlayer?: PieceColor;
  activePlayer?: 'host' | 'guest' | null;
  winner?: PieceColor | null;
  phase?: 'playing' | 'gameOver';
  status?: 'waiting' | 'playing' | 'finished' | 'abandoned';
  hostColor?: PieceColor | null;
  guestColor?: PieceColor | null;
}

interface ScenarioStep {
  actor: 'host' | 'guest';
  action: Action;
  expect: StepExpectation;
}

interface Scenario {
  name: string;
  board: Board;
  steps: ScenarioStep[];
  finalWinner: PieceColor;
}

class PlayerClient {
  readonly label: string;
  readonly app: FirebaseApp;
  readonly auth: Auth;
  readonly db: Database;
  uid = '';

  constructor(label: string, config: FirebaseConfig) {
    this.label = label;
    this.app = initializeApp(config, `${label}-${randomUUID()}`);
    this.auth = getAuth(this.app);
    this.db = getDatabase(this.app);
  }

  async signIn() {
    const credential = await signInAnonymously(this.auth);
    this.uid = credential.user.uid;
  }

  async createRoom(roomId: string, settings: DarkChessSettings) {
    const roomRef = ref(this.db, `rooms/${roomId}`);
    const initialRoom = createInitialDarkRoom(roomId, this.uid, settings);
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

    if (!result.committed) {
      throw new Error(`[${this.label}] 建立房間 ${roomId} 失敗`);
    }
  }

  async joinRoom(roomId: string) {
    const roomRef = ref(this.db, `rooms/${roomId}`);
    const snapshot = await get(roomRef);
    if (!snapshot.exists()) {
      throw new Error(`[${this.label}] 找不到房間 ${roomId}`);
    }

    const room = normalizeRoom(snapshot.val());
    if (!room) {
      throw new Error(`[${this.label}] 房間 ${roomId} 格式異常`);
    }

    if (room.status !== 'waiting' || room.guestUid) {
      throw new Error(`[${this.label}] 房間 ${roomId} 無法加入`);
    }

    const joinedRoom: OnlineRoom = {
      ...room,
      guestUid: this.uid,
      status: 'playing',
      updatedAt: Date.now(),
      message: '房主先翻第一顆棋子決定顏色',
    };

    await set(roomRef, serializeRoom(joinedRoom));
  }

  async setRoom(room: OnlineRoom) {
    await set(ref(this.db, `rooms/${room.roomId}`), serializeRoom(room));
  }

  async readRoom(roomId: string) {
    const snapshot = await get(ref(this.db, `rooms/${roomId}`));
    if (!snapshot.exists()) {
      throw new Error(`[${this.label}] 房間 ${roomId} 不存在`);
    }

    const room = normalizeRoom(snapshot.val());
    if (!room) {
      throw new Error(`[${this.label}] 房間 ${roomId} 格式異常`);
    }

    return room;
  }

  async submitDarkFlip(roomId: string, pos: Position) {
    const roomRef = ref(this.db, `rooms/${roomId}`);
    const latestRoom = await this.readRoom(roomId);
    const nextRoom = applyDarkFlip(latestRoom, this.uid, pos);
    if (!nextRoom) {
      throw new Error(
        `[${this.label}] 翻棋失敗 (${pos.row}, ${pos.col})，status=${latestRoom.status} phase=${latestRoom.phase}`,
      );
    }

    await set(roomRef, serializeRoom(nextRoom));
  }

  async submitDarkMove(roomId: string, from: Position, to: Position) {
    const roomRef = ref(this.db, `rooms/${roomId}`);
    const latestRoom = await this.readRoom(roomId);
    const nextRoom = applyDarkMove(latestRoom, this.uid, from, to);
    if (!nextRoom) {
      throw new Error(
        `[${this.label}] 走子失敗 (${from.row}, ${from.col}) -> (${to.row}, ${to.col})`,
      );
    }

    await set(roomRef, serializeRoom(nextRoom));
  }

  async cleanupRoom(roomId: string) {
    await remove(ref(this.db, `rooms/${roomId}`));
  }

  async dispose() {
    await deleteApp(this.app);
  }
}

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
  const result: unknown[] = Array.from({ length: maxIndex + 1 }, () => EMPTY_CELL_MARKER);
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

function deserializeBoard(value: unknown): Board {
  const sourceRows = normalizeIndexedCollection(value);
  return Array.from({ length: DARK_ROWS }, (_, rowIndex) => {
    const sourceCols = normalizeIndexedCollection(sourceRows[rowIndex]);
    return Array.from({ length: DARK_COLS }, (_, colIndex) =>
      deserializeCell(sourceCols[colIndex]),
    );
  });
}

function serializeBoard(board: Board): SerializedBoardCell[][] {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : EMPTY_CELL_MARKER)));
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

  return {
    roomId: typeof value.roomId === 'string' ? value.roomId : '',
    variant: value.variant === 'bright' ? 'bright' : 'dark',
    status:
      value.status === 'playing' ||
      value.status === 'finished' ||
      value.status === 'abandoned'
        ? value.status
        : 'waiting',
    board: deserializeBoard(value.board),
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
  const previous = getSettings();

  if (settings) {
    setSettings(settings);
  }

  try {
    return callback();
  } finally {
    setSettings(previous);
  }
}

function createInitialDarkRoom(
  roomId: string,
  hostUid: string,
  darkChessSettings: DarkChessSettings,
): OnlineRoom {
  return {
    roomId,
    variant: 'dark',
    status: 'waiting',
    board: createInitialBoard(),
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

function buildScenarioRoom(
  roomId: string,
  hostUid: string,
  guestUid: string,
  board: Board,
  settings: DarkChessSettings,
): OnlineRoom {
  return {
    roomId,
    variant: 'dark',
    status: 'playing',
    board,
    currentPlayer: 'red',
    activePlayerUid: hostUid,
    hostUid,
    guestUid,
    playerColors: {},
    phase: 'playing',
    winner: null,
    isFlippingFirst: true,
    lastMove: null,
    message: '房主先翻第一顆棋子決定顏色',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    darkChessSettings: settings,
  };
}

function applyDarkFlip(room: OnlineRoom, userId: string, pos: Position): OnlineRoom | null {
  return withDarkRuleSet(room.darkChessSettings, () => {
    if (room.variant !== 'dark') {
      return null;
    }

    if (room.phase !== 'playing' || room.status !== 'playing') {
      return null;
    }

    if (room.activePlayerUid !== userId) {
      return null;
    }

    const currentCell = room.board[pos.row]?.[pos.col];
    if (!currentCell || currentCell.revealed) {
      return null;
    }

    const nextBoard = flipPiece(room.board, pos);
    const flippedPiece = nextBoard[pos.row]?.[pos.col];
    if (!flippedPiece) {
      return null;
    }

    const nextRoom: OnlineRoom = {
      ...room,
      board: nextBoard,
      lastMove: null,
      updatedAt: Date.now(),
      playerColors: { ...(room.playerColors ?? {}) },
    };

    if (room.isFlippingFirst) {
      const opponentUid = findOpponentUid(room, userId);
      nextRoom.playerColors[userId] = flippedPiece.color;

      if (opponentUid) {
        nextRoom.playerColors[opponentUid] = otherColor(flippedPiece.color);
      }

      nextRoom.isFlippingFirst = false;
      nextRoom.currentPlayer = otherColor(flippedPiece.color);
      nextRoom.activePlayerUid = opponentUid;
      nextRoom.message = `${nextRoom.currentPlayer === 'red' ? '紅方' : '黑方'}的回合`;
      return nextRoom;
    }

    const nextPlayer = otherColor(room.currentPlayer);
    const winner = checkWinner(nextBoard);
    const stalemate = checkStalemate(nextBoard, nextPlayer);

    if (winner) {
      nextRoom.phase = 'gameOver';
      nextRoom.status = 'finished';
      nextRoom.winner = winner;
      nextRoom.activePlayerUid = null;
      nextRoom.message = `${winner === 'red' ? '紅方' : '黑方'}獲勝`;
      return nextRoom;
    }

    if (stalemate) {
      nextRoom.phase = 'gameOver';
      nextRoom.status = 'finished';
      nextRoom.winner = null;
      nextRoom.activePlayerUid = null;
      nextRoom.message = '平手';
      return nextRoom;
    }

    nextRoom.currentPlayer = nextPlayer;
    nextRoom.activePlayerUid = findUidByColor(nextRoom, nextPlayer);
    nextRoom.message = `${nextPlayer === 'red' ? '紅方' : '黑方'}的回合`;
    return nextRoom;
  });
}

function applyDarkMove(
  room: OnlineRoom,
  userId: string,
  from: Position,
  to: Position,
): OnlineRoom | null {
  return withDarkRuleSet(room.darkChessSettings, () => {
    if (room.variant !== 'dark') {
      return null;
    }

    if (room.phase !== 'playing' || room.status !== 'playing') {
      return null;
    }

    if (room.activePlayerUid !== userId) {
      return null;
    }

    const piece = room.board[from.row]?.[from.col];
    if (!piece || !piece.revealed || piece.color !== room.currentPlayer) {
      return null;
    }

    const isValidMove = getValidMoves(room.board, from, room.currentPlayer).some(
      (candidate) => candidate.row === to.row && candidate.col === to.col,
    );

    if (!isValidMove) {
      return null;
    }

    const nextBoard = movePiece(room.board, from, to);
    const nextPlayer = otherColor(room.currentPlayer);
    const winner = checkWinner(nextBoard);
    const stalemate = checkStalemate(nextBoard, nextPlayer);
    const nextRoom: OnlineRoom = {
      ...room,
      board: nextBoard,
      lastMove: { from, to },
      updatedAt: Date.now(),
    };

    if (winner) {
      nextRoom.phase = 'gameOver';
      nextRoom.status = 'finished';
      nextRoom.winner = winner;
      nextRoom.activePlayerUid = null;
      nextRoom.message = `${winner === 'red' ? '紅方' : '黑方'}獲勝`;
      return nextRoom;
    }

    if (stalemate) {
      nextRoom.phase = 'gameOver';
      nextRoom.status = 'finished';
      nextRoom.winner = null;
      nextRoom.activePlayerUid = null;
      nextRoom.message = '平手';
      return nextRoom;
    }

    nextRoom.currentPlayer = nextPlayer;
    nextRoom.activePlayerUid = findUidByColor(nextRoom, nextPlayer);
    nextRoom.message = `${nextPlayer === 'red' ? '紅方' : '黑方'}的回合`;
    return nextRoom;
  });
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entryValue]) => `"${key}":${stableStringify(entryValue)}`);
    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value);
}

function assertRoomsSynced(hostRoom: OnlineRoom, guestRoom: OnlineRoom, context: string) {
  const hostSnapshot = stableStringify(serializeRoom(hostRoom));
  const guestSnapshot = stableStringify(serializeRoom(guestRoom));
  if (hostSnapshot !== guestSnapshot) {
    throw new Error(`${context}: 兩端房間狀態不同步`);
  }
}

function assertRoomInvariants(room: OnlineRoom, context: string) {
  if (room.variant !== 'dark') {
    throw new Error(`${context}: 房間變體不是暗棋`);
  }

  if (room.board.length !== DARK_ROWS) {
    throw new Error(`${context}: 棋盤列數異常 (${room.board.length})`);
  }

  for (const [rowIndex, row] of room.board.entries()) {
    if (row.length !== DARK_COLS) {
      throw new Error(`${context}: 第 ${rowIndex} 列欄數異常 (${row.length})`);
    }

    for (const [colIndex, cell] of row.entries()) {
      if (cell === undefined) {
        throw new Error(`${context}: 棋格 (${rowIndex}, ${colIndex}) 為 undefined`);
      }
    }
  }
}

function makeEmptyBoard(): Board {
  return Array.from({ length: DARK_ROWS }, () =>
    Array.from({ length: DARK_COLS }, () => null),
  );
}

function createScenarios(): Scenario[] {
  const board1 = makeEmptyBoard();
  board1[0][0] = { type: 'soldier', color: 'black', revealed: false };
  board1[0][1] = { type: 'general', color: 'red', revealed: false };

  const board2 = makeEmptyBoard();
  board2[0][0] = { type: 'cannon', color: 'red', revealed: false };
  board2[0][1] = { type: 'soldier', color: 'red', revealed: true };
  board2[0][2] = { type: 'general', color: 'black', revealed: false };

  return [
    {
      name: '兵吃將',
      board: board1,
      steps: [
        {
          actor: 'host',
          action: { kind: 'flip', pos: { row: 0, col: 0 } },
          expect: {
            currentPlayer: 'red',
            activePlayer: 'guest',
            hostColor: 'black',
            guestColor: 'red',
          },
        },
        {
          actor: 'guest',
          action: { kind: 'flip', pos: { row: 0, col: 1 } },
          expect: {
            currentPlayer: 'black',
            activePlayer: 'host',
            hostColor: 'black',
            guestColor: 'red',
          },
        },
        {
          actor: 'host',
          action: { kind: 'move', from: { row: 0, col: 0 }, to: { row: 0, col: 1 } },
          expect: {
            winner: 'black',
            phase: 'gameOver',
            status: 'finished',
            activePlayer: null,
          },
        },
      ],
      finalWinner: 'black',
    },
    {
      name: '炮隔山吃將',
      board: board2,
      steps: [
        {
          actor: 'host',
          action: { kind: 'flip', pos: { row: 0, col: 0 } },
          expect: {
            currentPlayer: 'black',
            activePlayer: 'guest',
            hostColor: 'red',
            guestColor: 'black',
          },
        },
        {
          actor: 'guest',
          action: { kind: 'flip', pos: { row: 0, col: 2 } },
          expect: {
            currentPlayer: 'red',
            activePlayer: 'host',
            hostColor: 'red',
            guestColor: 'black',
          },
        },
        {
          actor: 'host',
          action: { kind: 'move', from: { row: 0, col: 0 }, to: { row: 0, col: 2 } },
          expect: {
            winner: 'red',
            phase: 'gameOver',
            status: 'finished',
            activePlayer: null,
          },
        },
      ],
      finalWinner: 'red',
    },
  ];
}

function assertStepExpectation(
  room: OnlineRoom,
  scenario: Scenario,
  stepIndex: number,
  expectation: StepExpectation,
  hostUid: string,
  guestUid: string,
) {
  const context = `[${scenario.name}] step ${stepIndex + 1}`;

  if (expectation.currentPlayer && room.currentPlayer !== expectation.currentPlayer) {
    throw new Error(
      `${context}: currentPlayer 預期 ${expectation.currentPlayer}，實際 ${room.currentPlayer}`,
    );
  }

  if (expectation.phase && room.phase !== expectation.phase) {
    throw new Error(`${context}: phase 預期 ${expectation.phase}，實際 ${room.phase}`);
  }

  if (expectation.status && room.status !== expectation.status) {
    throw new Error(`${context}: status 預期 ${expectation.status}，實際 ${room.status}`);
  }

  if (expectation.winner !== undefined && room.winner !== expectation.winner) {
    throw new Error(`${context}: winner 預期 ${expectation.winner}，實際 ${room.winner}`);
  }

  if (expectation.activePlayer !== undefined) {
    const expectedUid =
      expectation.activePlayer === 'host'
        ? hostUid
        : expectation.activePlayer === 'guest'
          ? guestUid
          : null;

    if (room.activePlayerUid !== expectedUid) {
      throw new Error(
        `${context}: activePlayerUid 預期 ${expectedUid}，實際 ${room.activePlayerUid}`,
      );
    }
  }

  if (expectation.hostColor !== undefined) {
    const actual = room.playerColors[hostUid] ?? null;
    if (actual !== expectation.hostColor) {
      throw new Error(`${context}: hostColor 預期 ${expectation.hostColor}，實際 ${actual}`);
    }
  }

  if (expectation.guestColor !== undefined) {
    const actual = room.playerColors[guestUid] ?? null;
    if (actual !== expectation.guestColor) {
      throw new Error(`${context}: guestColor 預期 ${expectation.guestColor}，實際 ${actual}`);
    }
  }
}

async function readFirebaseConfig(): Promise<FirebaseConfig> {
  const envPath = resolve(process.cwd(), '.env');
  const raw = await readFile(envPath, 'utf8');
  const env = Object.fromEntries(
    raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const separatorIndex = line.indexOf('=');
        return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)];
      }),
  );

  const requiredKeys = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_DATABASE_URL',
    'VITE_FIREBASE_PROJECT_ID',
    'VITE_FIREBASE_APP_ID',
  ] as const;

  for (const key of requiredKeys) {
    if (!env[key]) {
      throw new Error(`.env 缺少 ${key}`);
    }
  }

  return {
    apiKey: env.VITE_FIREBASE_API_KEY,
    authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
    databaseURL: env.VITE_FIREBASE_DATABASE_URL,
    projectId: env.VITE_FIREBASE_PROJECT_ID,
    appId: env.VITE_FIREBASE_APP_ID,
    messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  };
}

async function playScenario(
  index: number,
  scenario: Scenario,
  config: FirebaseConfig,
  settings: DarkChessSettings,
) {
  const host = new PlayerClient(`host-${index}`, config);
  const guest = new PlayerClient(`guest-${index}`, config);
  const roomId = createRoomCode();

  console.log(`\n[Game ${index}] ${scenario.name} - 房間 ${roomId}`);

  try {
    await host.signIn();
    await guest.signIn();
    await host.createRoom(roomId, settings);
    await guest.joinRoom(roomId);

    const scenarioRoom = buildScenarioRoom(roomId, host.uid, guest.uid, scenario.board, settings);
    await host.setRoom(scenarioRoom);

    for (const [stepIndex, step] of scenario.steps.entries()) {
      const beforeHost = await host.readRoom(roomId);
      const beforeGuest = await guest.readRoom(roomId);
      assertRoomInvariants(beforeHost, `[${scenario.name}] step ${stepIndex + 1} host before`);
      assertRoomInvariants(beforeGuest, `[${scenario.name}] step ${stepIndex + 1} guest before`);
      assertRoomsSynced(beforeHost, beforeGuest, `[${scenario.name}] step ${stepIndex + 1} before`);

      const actor = step.actor === 'host' ? host : guest;
      if (step.action.kind === 'flip') {
        await actor.submitDarkFlip(roomId, step.action.pos);
      } else {
        await actor.submitDarkMove(roomId, step.action.from, step.action.to);
      }

      const afterHost = await host.readRoom(roomId);
      const afterGuest = await guest.readRoom(roomId);
      assertRoomInvariants(afterHost, `[${scenario.name}] step ${stepIndex + 1} host after`);
      assertRoomInvariants(afterGuest, `[${scenario.name}] step ${stepIndex + 1} guest after`);
      assertRoomsSynced(afterHost, afterGuest, `[${scenario.name}] step ${stepIndex + 1} after`);
      assertStepExpectation(afterHost, scenario, stepIndex, step.expect, host.uid, guest.uid);
    }

    const finalRoom = await host.readRoom(roomId);
    if (finalRoom.phase !== 'gameOver' || finalRoom.status !== 'finished') {
      throw new Error(`[${scenario.name}] 對局未正常結束`);
    }

    if (finalRoom.winner !== scenario.finalWinner) {
      throw new Error(
        `[${scenario.name}] 勝方預期 ${scenario.finalWinner}，實際 ${finalRoom.winner}`,
      );
    }

    console.log(`[Game ${index}] 完成，勝方：${finalRoom.winner}`);
  } finally {
    try {
      await host.cleanupRoom(roomId);
    } catch {
      // ignore cleanup errors so we can still dispose apps
    }

    await Promise.all([host.dispose(), guest.dispose()]);
  }
}

async function main() {
  const config = await readFirebaseConfig();
  const settings: DarkChessSettings = {
    rookCaptureRange: 'adjacent',
    cannonCaptureRule: 'needJump',
    soldierKillGeneral: true,
  };

  console.log('開始雙人連線暗棋 smoke test');
  console.log(`設定：${JSON.stringify(settings)}`);

  const scenarios = createScenarios();
  if (scenarios.length < TOTAL_GAMES) {
    throw new Error(`測試場景不足，至少需要 ${TOTAL_GAMES} 局`);
  }

  for (let index = 0; index < TOTAL_GAMES; index += 1) {
    await playScenario(index + 1, scenarios[index], config, settings);
  }

  console.log(`\n完成 ${TOTAL_GAMES} 局雙人連線暗棋 smoke test。`);
  process.exit(0);
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
  console.error(`\n❌ 雙人連線暗棋 smoke test 失敗\n${message}`);
  process.exit(1);
});
