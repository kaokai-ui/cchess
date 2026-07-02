import type { NavigateFunction } from 'react-router-dom';
import { leaveOnlineRoom } from './service';

const LEAVE_ROOM_NAVIGATION_FALLBACK_MS = 1500;

function waitForLeaveFallback() {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, LEAVE_ROOM_NAVIGATION_FALLBACK_MS);
  });
}

export async function leaveOnlineRoomThenNavigateHome(
  roomId: string | null | undefined,
  navigate: NavigateFunction,
) {
  if (!roomId) {
    navigate('/', { replace: true });
    return;
  }

  const leaveTask = leaveOnlineRoom(roomId).catch((error) => {
    console.warn('Unable to finish online room cleanup before leaving the screen.', error);
  });

  await Promise.race([leaveTask, waitForLeaveFallback()]);
  navigate('/', { replace: true });
}
