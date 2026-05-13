import type { Board, GamePhase, PieceColor, Position } from '../shared/types';
import type { DarkChessSettings } from '../stores/settingsStore';

export type GameVariant = 'bright' | 'dark';
export type OnlineRoomStatus = 'waiting' | 'playing' | 'finished' | 'abandoned';

export interface PresenceSnapshot {
  connected: boolean;
  joinedAt: number;
  lastSeen: number;
}

export interface OnlineRoom {
  roomId: string;
  variant: GameVariant;
  status: OnlineRoomStatus;
  board: Board;
  currentPlayer: PieceColor;
  activePlayerUid: string | null;
  hostUid: string;
  guestUid: string | null;
  playerColors: Record<string, PieceColor | null>;
  phase: GamePhase;
  winner: PieceColor | null;
  isFlippingFirst: boolean;
  lastMove: { from: Position; to: Position } | null;
  message: string;
  createdAt: number;
  updatedAt: number;
  darkChessSettings: DarkChessSettings | null;
}

export interface OnlineRoomSnapshot {
  room: OnlineRoom | null;
  presence: Record<string, PresenceSnapshot>;
}

export interface AdminOverview {
  rooms: Record<string, OnlineRoom>;
  sessions: Record<
    string,
    {
      connected: boolean;
      lastSeen: number;
      roomId: string;
      variant: GameVariant;
    }
  >;
}
