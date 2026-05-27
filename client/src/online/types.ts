import type { Board, GamePhase, PieceColor, Position } from '../shared/types';
import type { GomokuBoard, GomokuStone } from '../shared/gomoku/types';
import type { DarkChessSettings } from '../stores/settingsStore';

export type GameVariant = 'bright' | 'dark' | 'gomoku';
export type OnlineRoomStatus = 'waiting' | 'playing' | 'finished' | 'abandoned';
export type OnlinePlayerColor = PieceColor | GomokuStone;
export type OnlineRoomBoard = Board | GomokuBoard;
export type OnlineReconnectSeat = 'host' | 'guest';

export interface PresenceSnapshot {
  connected: boolean;
  joinedAt: number;
  lastSeen: number;
}

interface OnlineRoomBase {
  roomId: string;
  variant: GameVariant;
  status: OnlineRoomStatus;
  activePlayerUid: string | null;
  hostUid: string;
  guestUid: string | null;
  phase: GamePhase;
  message: string;
  createdAt: number;
  updatedAt: number;
  reconnectSeat: OnlineReconnectSeat | null;
  reconnectPlayerKey: string | null;
  reconnectDeadlineAt: number | null;
  pausedMessage: string | null;
}

export interface BrightOnlineRoom extends OnlineRoomBase {
  variant: 'bright';
  board: Board;
  currentPlayer: PieceColor;
  playerColors: Record<string, PieceColor | null>;
  winner: PieceColor | null;
  isFlippingFirst: false;
  lastMove: { from: Position; to: Position } | null;
  darkChessSettings: null;
}

export interface DarkOnlineRoom extends OnlineRoomBase {
  variant: 'dark';
  board: Board;
  currentPlayer: PieceColor;
  playerColors: Record<string, PieceColor | null>;
  winner: PieceColor | null;
  isFlippingFirst: boolean;
  lastMove: { from: Position; to: Position } | null;
  darkChessSettings: DarkChessSettings | null;
}

export interface GomokuOnlineRoom extends OnlineRoomBase {
  variant: 'gomoku';
  board: GomokuBoard;
  currentPlayer: GomokuStone;
  playerColors: Record<string, GomokuStone | null>;
  winner: GomokuStone | null;
  isFlippingFirst: false;
  lastMove: { from: Position; to: Position } | null;
  darkChessSettings: null;
}

export type OnlineRoom = BrightOnlineRoom | DarkOnlineRoom | GomokuOnlineRoom;

export interface OnlineRoomSnapshot {
  room: OnlineRoom | null;
  presence: Record<string, PresenceSnapshot>;
}

export interface RecentOnlineRoomSession {
  roomId: string;
  variant: GameVariant;
  updatedAt: number;
}

export interface OnlineRoomReconnectResult {
  room: OnlineRoom | null;
  userId: string;
  isMember: boolean;
  reclaimed: boolean;
}

export function isGomokuOnlineRoom(room: OnlineRoom | null): room is GomokuOnlineRoom {
  return room?.variant === 'gomoku';
}

export function isDarkOnlineRoom(room: OnlineRoom | null): room is DarkOnlineRoom {
  return room?.variant === 'dark';
}

export function isBrightOnlineRoom(room: OnlineRoom | null): room is BrightOnlineRoom {
  return room?.variant === 'bright';
}
