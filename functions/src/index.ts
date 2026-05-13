import { initializeApp } from 'firebase-admin/app';
import { getDatabase } from 'firebase-admin/database';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { setGlobalOptions } from 'firebase-functions/v2';

initializeApp();
setGlobalOptions({ region: 'asia-east1' });

type PieceColor = 'red' | 'black';

interface OnlineRoom {
  roomId: string;
  variant: 'bright' | 'dark';
  status: 'waiting' | 'playing' | 'finished' | 'abandoned';
  hostUid: string;
  guestUid: string | null;
  playerColors: Record<string, PieceColor | null>;
  phase: 'playing' | 'gameOver';
  winner: PieceColor | null;
  activePlayerUid: string | null;
  message: string;
  updatedAt: number;
}

function assertAuthenticated(uid: string | undefined) {
  if (!uid) {
    throw new HttpsError('unauthenticated', '請先完成匿名登入。');
  }
}

async function assertDatabaseAdmin(uid: string | undefined) {
  assertAuthenticated(uid);

  const snapshot = await getDatabase().ref(`admins/${uid}`).get();
  if (snapshot.val() !== true) {
    throw new HttpsError('permission-denied', '目前 UID 尚未被授權為管理者。');
  }
}

async function removeSessionIfMatches(roomId: string, userId: string | null) {
  if (!userId) {
    return;
  }

  const sessionRef = getDatabase().ref(`userSessions/${userId}`);
  const snapshot = await sessionRef.get();
  if (snapshot.exists() && snapshot.child('roomId').val() === roomId) {
    await sessionRef.remove();
  }
}

export const adminDeleteRoom = onCall(
  { enforceAppCheck: true },
  async (request) => {
    await assertDatabaseAdmin(request.auth?.uid);

    const roomId = String(request.data?.roomId || '').trim().toUpperCase();
    if (!roomId) {
      throw new HttpsError('invalid-argument', '請提供欲刪除的房號。');
    }

    const roomRef = getDatabase().ref(`rooms/${roomId}`);
    const snapshot = await roomRef.get();
    if (!snapshot.exists()) {
      throw new HttpsError('not-found', '指定房間不存在。');
    }

    const room = snapshot.val() as OnlineRoom;
    const updates: Record<string, null> = {
      [`rooms/${roomId}`]: null,
      [`roomPresence/${roomId}`]: null,
    };

    await removeSessionIfMatches(roomId, room.hostUid);
    await removeSessionIfMatches(roomId, room.guestUid);
    await getDatabase().ref().update(updates);

    return {
      ok: true,
      removedRoomId: roomId,
    };
  },
);

export const adminDeleteUser = onCall(
  { enforceAppCheck: true },
  async (request) => {
    await assertDatabaseAdmin(request.auth?.uid);

    const userId = String(request.data?.userId || '').trim();
    if (!userId) {
      throw new HttpsError('invalid-argument', '請提供欲移除的 Firebase UID。');
    }

    const sessionRef = getDatabase().ref(`userSessions/${userId}`);
    const sessionSnapshot = await sessionRef.get();
    const roomId = sessionSnapshot.exists()
      ? String(sessionSnapshot.child('roomId').val() || '')
      : '';

    if (!roomId) {
      await sessionRef.remove();
      return {
        ok: true,
        removedUserId: userId,
        roomId: null,
      };
    }

    const roomRef = getDatabase().ref(`rooms/${roomId}`);
    const roomSnapshot = await roomRef.get();

    const updates: Record<string, null | OnlineRoom> = {
      [`roomPresence/${roomId}/${userId}`]: null,
      [`userSessions/${userId}`]: null,
    };

    if (!roomSnapshot.exists()) {
      await getDatabase().ref().update(updates);
      return {
        ok: true,
        removedUserId: userId,
        roomId,
      };
    }

    const room = roomSnapshot.val() as OnlineRoom;

    if (room.hostUid === userId && !room.guestUid) {
      updates[`rooms/${roomId}`] = null;
      updates[`roomPresence/${roomId}`] = null;
      await getDatabase().ref().update(updates);
      return {
        ok: true,
        removedUserId: userId,
        roomId,
      };
    }

    const remainingUid = room.hostUid === userId ? room.guestUid : room.hostUid;
    const remainingColor = remainingUid ? room.playerColors[remainingUid] ?? null : null;

    const nextRoom: OnlineRoom = {
      ...room,
      status: 'abandoned',
      phase: 'gameOver',
      winner: remainingColor,
      activePlayerUid: null,
      updatedAt: Date.now(),
      message: '連線玩家已被管理員移除',
    };

    updates[`rooms/${roomId}`] = nextRoom;

    await getDatabase().ref().update(updates);

    return {
      ok: true,
      removedUserId: userId,
      roomId,
    };
  },
);
