import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { initializeApp, deleteApp, type FirebaseApp } from 'firebase/app';
import { getAuth, signInAnonymously, type Auth } from 'firebase/auth';
import { get, getDatabase, ref, remove, runTransaction, set, type Database } from 'firebase/database';
import {
  checkWinner,
  createInitialBoard,
  isBoardFull,
  isValidMove,
  placeStone,
} from '../src/shared/gomoku/engine';
import type { GomokuBoard, GomokuStone } from '../src/shared/gomoku/types';
import type { GomokuOnlineRoom } from '../src/online/types';
import type { Position } from '../src/shared/types';

const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const ROOM_CODE_LENGTH = 6;
const EMPTY_CELL_MARKER = 0;

interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  appId: string;
  databaseURL: string;
  projectId: string;
  messagingSenderId?: string;
  storageBucket?: string;
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
    const initialRoom = createInitialRoom(roomId, this.uid);
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
      throw new Error(`[${this.label}] 房間 ${roomId} 資料無效`);
    }

    if (room.status !== 'waiting' || room.guestUid) {
      throw new Error(`[${this.label}] 房間 ${roomId} 不可加入`);
    }

    const updatedRoom: GomokuOnlineRoom = {
      ...room,
      guestUid: this.uid,
      status: 'playing',
      updatedAt: Date.now(),
      playerColors: {
        ...room.playerColors,
        [this.uid]: 'white',
      },
      message: '黑子先手',
    };

    await set(roomRef, serializeRoom(updatedRoom));
  }

  async readRoom(roomId: string) {
    const snapshot = await get(ref(this.db, `rooms/${roomId}`));
    if (!snapshot.exists()) {
      throw new Error(`[${this.label}] 房間 ${roomId} 已不存在`);
    }

    const room = normalizeRoom(snapshot.val());
    if (!room) {
      throw new Error(`[${this.label}] 房間 ${roomId} 資料無效`);
    }

    return room;
  }

  async submitMove(roomId: string, pos: Position) {
    const roomRef = ref(this.db, `rooms/${roomId}`);
    const room = await this.readRoom(roomId);

    if (room.phase !== 'playing' || room.status !== 'playing') {
      throw new Error(`[${this.label}] 這局已結束`);
    }

    if (room.activePlayerUid !== this.uid) {
      throw new Error(`[${this.label}] 還沒輪到我`);
    }

    if (!isValidMove(room.board, pos)) {
      throw new Error(`[${this.label}] 位置 (${pos.row}, ${pos.col}) 不可落子`);
    }

    const nextBoard = placeStone(room.board, pos, room.currentPlayer);
    const nextPlayer = otherStone(room.currentPlayer);
    const winner = checkWinner(nextBoard, pos);
    const nextRoom: GomokuOnlineRoom = {
      ...room,
      board: nextBoard,
      lastMove: { from: pos, to: pos },
      updatedAt: Date.now(),
    };

    if (winner) {
      nextRoom.phase = 'gameOver';
      nextRoom.status = 'finished';
      nextRoom.winner = winner;
      nextRoom.activePlayerUid = null;
      nextRoom.message = `${winner === 'black' ? '黑子' : '白子'}獲勝`;
    } else if (isBoardFull(nextBoard)) {
      nextRoom.phase = 'gameOver';
      nextRoom.status = 'finished';
      nextRoom.winner = null;
      nextRoom.activePlayerUid = null;
      nextRoom.message = '平手，棋盤已滿';
    } else {
      nextRoom.currentPlayer = nextPlayer;
      nextRoom.activePlayerUid = nextPlayer === 'black' ? nextRoom.hostUid : nextRoom.guestUid;
      nextRoom.message = `${nextPlayer === 'black' ? '黑子' : '白子'}的回合`;
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

function otherStone(stone: GomokuStone): GomokuStone {
  return stone === 'black' ? 'white' : 'black';
}

function createRoomCode() {
  return Array.from({ length: ROOM_CODE_LENGTH }, () => {
    const index = Math.floor(Math.random() * ROOM_CODE_ALPHABET.length);
    return ROOM_CODE_ALPHABET[index];
  }).join('');
}

function createInitialRoom(roomId: string, hostUid: string): GomokuOnlineRoom {
  return {
    roomId,
    variant: 'gomoku',
    status: 'waiting',
    board: createInitialBoard(),
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
    darkChessSettings: null,
  };
}

function serializeRoom(room: GomokuOnlineRoom) {
  return {
    ...room,
    board: room.board.map((row) =>
      row.map((cell) => (cell === null ? EMPTY_CELL_MARKER : cell)),
    ),
  };
}

function normalizeRoom(value: unknown): GomokuOnlineRoom | null {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const record = value as Record<string, unknown>;
  const sourceRows = Array.isArray(record.board) ? record.board : [];
  const board = Array.from({ length: 15 }, (_, rowIndex) => {
    const row = Array.isArray(sourceRows[rowIndex]) ? sourceRows[rowIndex] : [];
    return Array.from({ length: 15 }, (_, colIndex) => {
      const cell = row[colIndex];
      return cell === 'black' || cell === 'white' ? cell : null;
    });
  }) as GomokuBoard;

  return {
    roomId: typeof record.roomId === 'string' ? record.roomId : '',
    variant: 'gomoku',
    status:
      record.status === 'playing' ||
      record.status === 'finished' ||
      record.status === 'abandoned'
        ? record.status
        : 'waiting',
    board,
    currentPlayer: record.currentPlayer === 'white' ? 'white' : 'black',
    activePlayerUid: typeof record.activePlayerUid === 'string' ? record.activePlayerUid : null,
    hostUid: typeof record.hostUid === 'string' ? record.hostUid : '',
    guestUid: typeof record.guestUid === 'string' ? record.guestUid : null,
    playerColors:
      record.playerColors && typeof record.playerColors === 'object'
        ? Object.fromEntries(
            Object.entries(record.playerColors as Record<string, unknown>).map(([uid, color]) => [
              uid,
              color === 'black' || color === 'white' ? color : null,
            ]),
          )
        : {},
    phase: record.phase === 'gameOver' ? 'gameOver' : 'playing',
    winner: record.winner === 'black' || record.winner === 'white' ? record.winner : null,
    isFlippingFirst: false,
    lastMove:
      record.lastMove &&
      typeof record.lastMove === 'object' &&
      (record.lastMove as { to?: { row?: unknown; col?: unknown } }).to &&
      typeof (record.lastMove as { to: { row?: unknown } }).to.row === 'number' &&
      typeof (record.lastMove as { to: { col?: unknown } }).to.col === 'number'
        ? (record.lastMove as GomokuOnlineRoom['lastMove'])
        : null,
    message: typeof record.message === 'string' ? record.message : '',
    createdAt: typeof record.createdAt === 'number' ? record.createdAt : Date.now(),
    updatedAt: typeof record.updatedAt === 'number' ? record.updatedAt : Date.now(),
    darkChessSettings: null,
  };
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(message);
  }
}

function assertSynced(left: GomokuOnlineRoom, right: GomokuOnlineRoom, context: string) {
  assert(
    JSON.stringify(serializeRoom(left)) === JSON.stringify(serializeRoom(right)),
    `${context}: host/guest room snapshots diverged`,
  );
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

async function main() {
  const config = await readFirebaseConfig();
  const roomId = createRoomCode();
  const host = new PlayerClient('host', config);
  const guest = new PlayerClient('guest', config);
  const sequence: Array<{ actor: 'host' | 'guest'; pos: Position; expectedNext: GomokuStone | null }> = [
    { actor: 'host', pos: { row: 7, col: 7 }, expectedNext: 'white' },
    { actor: 'guest', pos: { row: 7, col: 8 }, expectedNext: 'black' },
    { actor: 'host', pos: { row: 6, col: 6 }, expectedNext: 'white' },
    { actor: 'guest', pos: { row: 6, col: 7 }, expectedNext: 'black' },
    { actor: 'host', pos: { row: 8, col: 8 }, expectedNext: 'white' },
    { actor: 'guest', pos: { row: 8, col: 7 }, expectedNext: 'black' },
    { actor: 'host', pos: { row: 9, col: 9 }, expectedNext: 'white' },
    { actor: 'guest', pos: { row: 9, col: 7 }, expectedNext: 'black' },
    { actor: 'host', pos: { row: 10, col: 10 }, expectedNext: null },
  ];

  console.log(`online gomoku smoke start room=${roomId}`);

  try {
    await host.signIn();
    await guest.signIn();
    await host.createRoom(roomId);
    await guest.joinRoom(roomId);

    let room = await host.readRoom(roomId);
    assert(room.status === 'playing', 'room should enter playing status after guest joins');
    assert(room.currentPlayer === 'black', 'gomoku should start with black');
    assert(room.playerColors[host.uid] === 'black', 'host should be black');
    assert(room.playerColors[guest.uid] === 'white', 'guest should be white');

    for (const [index, step] of sequence.entries()) {
      const actor = step.actor === 'host' ? host : guest;
      await actor.submitMove(roomId, step.pos);
      const hostRoom = await host.readRoom(roomId);
      const guestRoom = await guest.readRoom(roomId);
      assertSynced(hostRoom, guestRoom, `step ${index + 1}`);

      room = hostRoom;
      assert(
        room.lastMove?.to.row === step.pos.row && room.lastMove?.to.col === step.pos.col,
        `step ${index + 1}: last move mismatch`,
      );

      if (step.expectedNext) {
        assert(room.currentPlayer === step.expectedNext, `step ${index + 1}: current player mismatch`);
      }
    }

    room = await host.readRoom(roomId);
    assert(room.phase === 'gameOver', 'final room should be gameOver');
    assert(room.status === 'finished', 'final room should be finished');
    assert(room.winner === 'black', 'black should win the scripted match');
    console.log('online gomoku smoke ok');
  } finally {
    try {
      await host.cleanupRoom(roomId);
    } catch {
      // ignore cleanup errors
    }

    await Promise.all([host.dispose(), guest.dispose()]);
  }
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? `${error.message}\n${error.stack ?? ''}` : String(error);
  console.error(`online gomoku smoke failed\n${message}`);
  process.exit(1);
});
