// Web Worker entry: runs the (potentially long) bright-chess search off the main
// thread so the UI never freezes while the AI thinks (B6). It imports only pure
// logic (ai -> engine -> types); no store / DOM dependencies.
import { getAIMove, type AIMove } from './ai';
import type { Board, PieceColor } from '../types';

export interface BrightAiWorkerRequest {
  requestId: number;
  board: Board;
  aiColor: PieceColor;
  difficulty: 'easy' | 'normal' | 'hard' | 'master';
}

export interface BrightAiWorkerResponse {
  requestId: number;
  move: AIMove | null;
}

// Type `self` narrowly instead of pulling in the "webworker" lib, which would
// clash with the "DOM" lib used by the rest of the app.
const ctx = self as unknown as {
  postMessage: (message: BrightAiWorkerResponse) => void;
  addEventListener: (
    type: 'message',
    listener: (event: MessageEvent<BrightAiWorkerRequest>) => void,
  ) => void;
};

ctx.addEventListener('message', (event) => {
  const { requestId, board, aiColor, difficulty } = event.data;
  const move = getAIMove(board, aiColor, difficulty);
  ctx.postMessage({ requestId, move });
});
