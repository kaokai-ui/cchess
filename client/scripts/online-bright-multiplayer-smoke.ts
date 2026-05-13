import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously, type Auth } from 'firebase/auth';
import {
  get,
  getDatabase,
  ref,
  remove,
  runTransaction,
  set,
  type Database,
} from 'firebase/database';
import {
  checkStalemate,
  checkWinner,
  createInitialBoard,
  getValidMoves,
  movePiece,
} from '../src/shared/bright-chess/engine';
import type { Board, Cell, Piece, PieceColor, Position } from '../src/shared/types';
import type { OnlineRoom } from '../src/online/types';

const ROOM_CODE_ALPHABET = '0123456789';
const ROOM_CODE_LENGTH = 5;
const EMPTY_CELL_MARKER = 0;
const BRIGHT_ROWS = 10;
const BRIGHT_COLS = 9;
const TOTAL_GAMES = 2;

type SerializedBoardCell = Piece | typeof EMPTY_CELL_MARKER;

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
}

interface ScenarioStep {
  actor: 'host' | 'guest';
  from: Position;
  to: Position;
  expect: StepExpectation;
}

interface Scenario {
  name: string;
  board: Board;
  startingPlayer: PieceColor;
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

  async createRoom(roomId: string) {
    const roomRef = ref(this.db, `rooms/${roomId}`);
    const initialRoom = createInitialBrightRoom(roomId, this.uid);
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
      throw new Error(`[${this.label}] 房間 ${roomId} 不存在`);
    }

    const room = normalizeRoom(snapshot.val());
    if (!room) {
      throw new Error(`[${this.label}] 房間 ${roomId} 資料格式不正確`);
    }

    if (room.status !== 'waiting' || room.guestUid) {
      throw new Error(`[${this.label}] 房間 ${roomId} 無法加入`);
    }

    const joinedRoom: OnlineRoom = {
      ...room,
      guestUid: this.uid,
      status: 'playing',
      updatedAt: Date.now(),
      playerColors: {
        ...(room.playerColors ?? {}),
        [this.uid]: 'black',
      },
      message: '黑方加入，準備開始對局',
    };

    await set(roomRef, serializeRoom(joinedRoom));
  }

  async setRoom(room: OnlineRoom) {
    await set(ref(this.db, `rooms/${room.roomId}`), serializeRoom(room));
  }

  async readRoom(roomId: string) {
    const snapshot = await get(ref(this.db, `rooms/${roomId}`));
    if (!snapshot.exists()) {
      throw new Error(`[${this.label}] 房間 ${roomId} 已消失`);
    }

    const room = normalizeRoom(snapshot.val());
    if (!room) {
      throw new Error(`[${this.label}] 房間 ${roomId} 資料格式不正確`);
    }

    return room;
  }

  async submitBrightMove(roomId: string, from: Position, to: Position) {
    const roomRef = ref(this.db, `rooms/${roomId}`);
    const latestRoom = await this.readRoom(roomId);
    const nextRoom = applyBrightMove(latestRoom, this.uid, from, to);
    if (!nextRoom) {
      throw new Error(
        `[${this.label}] 明棋走子失敗 (${from.row}, ${from.col}) -> (${to.row}, ${to.col})`,
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
  return Array.from({ length: BRIGHT_ROWS }, (_, rowIndex) => {
    const sourceCols = normalizeIndexedCollection(sourceRows[rowIndex]);
    return Array.from({ length: BRIGHT_COLS }, (_, colIndex) =>
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
    variant: value.variant === 'dark' ? 'dark' : 'bright',
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
    darkChessSettings: null,
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

function findUidByColor(room: OnlineRoom, color: PieceColor): string | null {
  return (
    Object.entries(room.playerColors ?? {}).find(([, playerColor]) => playerColor === color)?.[0] ||
    null
  );
}

function createInitialBrightRoom(roomId: string, hostUid: string): OnlineRoom {
  return {
    roomId,
    variant: 'bright',
    status: 'waiting',
    board: createInitialBoard(),
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
    message: '等待對手加入',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    darkChessSettings: null,
  };
}

function buildScenarioRoom(
  roomId: string,
  hostUid: string,
  guestUid: string,
  scenario: Scenario,
): OnlineRoom {
  return {
    roomId,
    variant: 'bright',
    status: 'playing',
    board: scenario.board,
    currentPlayer: scenario.startingPlayer,
    activePlayerUid: scenario.startingPlayer === 'red' ? hostUid : guestUid,
    hostUid,
    guestUid,
    playerColors: {
      [hostUid]: 'red',
      [guestUid]: 'black',
    },
    phase: 'playing',
    winner: null,
    isFlippingFirst: false,
    lastMove: null,
    message: `${scenario.startingPlayer === 'red' ? '紅方' : '黑方'}先手`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    darkChessSettings: null,
  };
}

function applyBrightMove(
  room: OnlineRoom,
  userId: string,
  from: Position,
  to: Position,
): OnlineRoom | null {
  if (room.variant !== 'bright') {
    return null;
  }

  if (room.phase !== 'playing' || room.status !== 'playing') {
    return null;
  }

  if (room.activePlayerUid !== userId) {
    return null;
  }

  const piece = room.board[from.row]?.[from.col];
  if (!piece || piece.color !== room.currentPlayer) {
    return null;
  }

  const isValidMove = getValidMoves(room.board, from).some(
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
    nextRoom.winner = room.currentPlayer;
    nextRoom.activePlayerUid = null;
    nextRoom.message = '形成困斃';
    return nextRoom;
  }

  nextRoom.currentPlayer = nextPlayer;
  nextRoom.activePlayerUid = findUidByColor(nextRoom, nextPlayer);
  nextRoom.message = `${nextPlayer === 'red' ? '紅方' : '黑方'}行棋`;
  return nextRoom;
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
    throw new Error(`${context}: 房間同步結果不一致`);
  }
}

function assertRoomInvariants(room: OnlineRoom, context: string) {
  if (room.variant !== 'bright') {
    throw new Error(`${context}: 房間類型不是明棋`);
  }

  if (room.board.length !== BRIGHT_ROWS) {
    throw new Error(`${context}: 棋盤列數錯誤 (${room.board.length})`);
  }

  for (const [rowIndex, row] of room.board.entries()) {
    if (row.length !== BRIGHT_COLS) {
      throw new Error(`${context}: 第 ${rowIndex} 列欄數錯誤 (${row.length})`);
    }

    for (const [colIndex, cell] of row.entries()) {
      if (cell === undefined) {
        throw new Error(`${context}: 棋盤 (${rowIndex}, ${colIndex}) 出現 undefined`);
      }
    }
  }

  if (room.playerColors[room.hostUid] !== 'red') {
    throw new Error(`${context}: 房主顏色不是紅方`);
  }

  if (!room.guestUid || room.playerColors[room.guestUid] !== 'black') {
    throw new Error(`${context}: 客方顏色不是黑方`);
  }
}

function assertStepExpectation(
  room: OnlineRoom,
  scenario: Scenario,
  stepIndex: number,
  expectation: StepExpectation,
) {
  const context = `${scenario.name} 第 ${stepIndex + 1} 步`;

  if (expectation.currentPlayer && room.currentPlayer !== expectation.currentPlayer) {
    throw new Error(
      `${context}: currentPlayer 預期 ${expectation.currentPlayer}，實際為 ${room.currentPlayer}`,
    );
  }

  if (expectation.phase && room.phase !== expectation.phase) {
    throw new Error(`${context}: phase 預期 ${expectation.phase}，實際為 ${room.phase}`);
  }

  if (expectation.status && room.status !== expectation.status) {
    throw new Error(`${context}: status 預期 ${expectation.status}，實際為 ${room.status}`);
  }

  if (expectation.winner !== undefined && room.winner !== expectation.winner) {
    throw new Error(`${context}: winner 預期 ${expectation.winner}，實際為 ${room.winner}`);
  }

  if (expectation.activePlayer !== undefined) {
    const expectedUid =
      expectation.activePlayer === 'host'
        ? room.hostUid
        : expectation.activePlayer === 'guest'
          ? room.guestUid
          : null;

    if (room.activePlayerUid !== expectedUid) {
      throw new Error(
        `${context}: activePlayerUid 預期 ${expectedUid ?? 'null'}，實際為 ${room.activePlayerUid ?? 'null'}`,
      );
    }
  }
}

async function loadFirebaseConfig(): Promise<FirebaseConfig> {
  const envPath = resolve(process.cwd(), '.env');
  const source = await readFile(envPath, 'utf8');
  const entries = new Map<string, string>();

  for (const rawLine of source.split(/\r?\n/u)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex < 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim().replace(/^"(.*)"$/u, '$1');
    entries.set(key, value);
  }

  const requiredKeys = [
    'VITE_FIREBASE_API_KEY',
    'VITE_FIREBASE_AUTH_DOMAIN',
    'VITE_FIREBASE_APP_ID',
    'VITE_FIREBASE_DATABASE_URL',
    'VITE_FIREBASE_PROJECT_ID',
  ] as const;

  for (const key of requiredKeys) {
    if (!entries.get(key)) {
      throw new Error(`缺少必要環境變數 ${key}，請檢查 ${envPath}`);
    }
  }

  return {
    apiKey: entries.get('VITE_FIREBASE_API_KEY')!,
    authDomain: entries.get('VITE_FIREBASE_AUTH_DOMAIN')!,
    appId: entries.get('VITE_FIREBASE_APP_ID')!,
    databaseURL: entries.get('VITE_FIREBASE_DATABASE_URL')!,
    projectId: entries.get('VITE_FIREBASE_PROJECT_ID')!,
    messagingSenderId: entries.get('VITE_FIREBASE_MESSAGING_SENDER_ID'),
    storageBucket: entries.get('VITE_FIREBASE_STORAGE_BUCKET'),
  };
}

function createEmptyBoard(): Board {
  return Array.from({ length: BRIGHT_ROWS }, () => Array(BRIGHT_COLS).fill(null));
}

function createPiece(type: Piece['type'], color: PieceColor): Piece {
  return { type, color, revealed: true };
}

function buildScenarios(): Scenario[] {
  const gameOneBoard = createEmptyBoard();
  gameOneBoard[0][4] = createPiece('general', 'black');
  gameOneBoard[9][3] = createPiece('general', 'red');
  gameOneBoard[1][4] = createPiece('chariot', 'red');

  const gameTwoBoard = createEmptyBoard();
  gameTwoBoard[0][3] = createPiece('general', 'black');
  gameTwoBoard[9][4] = createPiece('general', 'red');
  gameTwoBoard[7][4] = createPiece('cannon', 'black');
  gameTwoBoard[8][4] = createPiece('soldier', 'black');

  return [
    {
      name: '第 1 局：紅車吃將',
      board: gameOneBoard,
      startingPlayer: 'red',
      finalWinner: 'red',
      steps: [
        {
          actor: 'host',
          from: { row: 1, col: 4 },
          to: { row: 0, col: 4 },
          expect: {
            phase: 'gameOver',
            status: 'finished',
            winner: 'red',
            activePlayer: null,
          },
        },
      ],
    },
    {
      name: '第 2 局：黑炮隔山吃將',
      board: gameTwoBoard,
      startingPlayer: 'black',
      finalWinner: 'black',
      steps: [
        {
          actor: 'guest',
          from: { row: 7, col: 4 },
          to: { row: 9, col: 4 },
          expect: {
            phase: 'gameOver',
            status: 'finished',
            winner: 'black',
            activePlayer: null,
          },
        },
      ],
    },
  ];
}

async function createUniqueRoom(host: PlayerClient) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const roomId = createRoomCode();
    try {
      await host.createRoom(roomId);
      return roomId;
    } catch {
      continue;
    }
  }

  throw new Error('無法建立測試房間，請稍後再試');
}

async function runScenario(
  scenario: Scenario,
  host: PlayerClient,
  guest: PlayerClient,
  gameNumber: number,
) {
  const roomId = await createUniqueRoom(host);

  try {
    await guest.joinRoom(roomId);

    const scenarioRoom = buildScenarioRoom(roomId, host.uid, guest.uid, scenario);
    await host.setRoom(scenarioRoom);

    const afterSetupHost = await host.readRoom(roomId);
    const afterSetupGuest = await guest.readRoom(roomId);
    assertRoomsSynced(afterSetupHost, afterSetupGuest, `${scenario.name} 佈局後`);
    assertRoomInvariants(afterSetupHost, `${scenario.name} 佈局後`);

    for (const [stepIndex, step] of scenario.steps.entries()) {
      const beforeHost = await host.readRoom(roomId);
      const beforeGuest = await guest.readRoom(roomId);
      assertRoomsSynced(beforeHost, beforeGuest, `${scenario.name} 第 ${stepIndex + 1} 步前`);
      assertRoomInvariants(beforeHost, `${scenario.name} 第 ${stepIndex + 1} 步前`);

      const actor = step.actor === 'host' ? host : guest;
      const validMoves = getValidMoves(beforeHost.board, step.from);
      const hasExpectedMove = validMoves.some(
        (candidate) => candidate.row === step.to.row && candidate.col === step.to.col,
      );

      if (!hasExpectedMove) {
        throw new Error(
          `${scenario.name} 第 ${stepIndex + 1} 步不是合法步: (${step.from.row}, ${step.from.col}) -> (${step.to.row}, ${step.to.col})`,
        );
      }

      await actor.submitBrightMove(roomId, step.from, step.to);

      const hostRoom = await host.readRoom(roomId);
      const guestRoom = await guest.readRoom(roomId);
      assertRoomsSynced(hostRoom, guestRoom, `${scenario.name} 第 ${stepIndex + 1} 步後`);
      assertRoomInvariants(hostRoom, `${scenario.name} 第 ${stepIndex + 1} 步後`);
      assertStepExpectation(hostRoom, scenario, stepIndex, step.expect);

      const lastMove = hostRoom.lastMove;
      if (
        !lastMove ||
        lastMove.from.row !== step.from.row ||
        lastMove.from.col !== step.from.col ||
        lastMove.to.row !== step.to.row ||
        lastMove.to.col !== step.to.col
      ) {
        throw new Error(`${scenario.name} 第 ${stepIndex + 1} 步後 lastMove 不正確`);
      }
    }

    const finalRoom = await host.readRoom(roomId);
    if (finalRoom.winner !== scenario.finalWinner) {
      throw new Error(
        `${scenario.name} 結束後 winner 錯誤，預期 ${scenario.finalWinner}，實際為 ${finalRoom.winner}`,
      );
    }

    console.log(`Game ${gameNumber}/${TOTAL_GAMES} passed: ${scenario.name} (${roomId})`);
  } finally {
    await host.cleanupRoom(roomId);
  }
}

async function main() {
  const config = await loadFirebaseConfig();
  const host = new PlayerClient('host', config);
  const guest = new PlayerClient('guest', config);
  const scenarios = buildScenarios();

  if (scenarios.length !== TOTAL_GAMES) {
    throw new Error(`測試局數設定錯誤：預期 ${TOTAL_GAMES}，實際為 ${scenarios.length}`);
  }

  try {
    await host.signIn();
    await guest.signIn();
    console.log('Starting bright multiplayer smoke test...');

    for (const [index, scenario] of scenarios.entries()) {
      await runScenario(scenario, host, guest, index + 1);
    }

    console.log(`Bright multiplayer smoke test passed: ${TOTAL_GAMES} games completed.`);
    process.exit(0);
  } finally {
    await Promise.allSettled([host.dispose(), guest.dispose()]);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
