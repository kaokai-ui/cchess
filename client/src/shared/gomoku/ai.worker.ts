// Web Worker entry: runs the gomoku AI off the main thread so the deep levels
// (棋神 / 天元 / 無極) can think for seconds without freezing the board. It
// imports only pure logic (ai -> search -> bitboard -> patterns); no store / DOM
// access.
//
// A request may carry a config override, which is how 無極 gives one worker the
// deep search and the others the VCF / VCT hunt for the same position.
import { computeGomokuMove, type GomokuAIDifficulty } from './ai';
import type { GomokuSearchConfig, GomokuSearchResult } from './search';
import type { GomokuBoard, GomokuPosition, GomokuStone } from './types';

export interface GomokuAiWorkerRequest {
  requestId: number;
  board: GomokuBoard;
  aiStone: GomokuStone;
  difficulty: GomokuAIDifficulty;
  overrides?: Partial<GomokuSearchConfig>;
}

export interface GomokuAiWorkerResponse {
  requestId: number;
  move: GomokuPosition | null;
  result: GomokuSearchResult | null;
}

// Type `self` narrowly instead of pulling in the "webworker" lib, which would
// clash with the "DOM" lib used by the rest of the app.
const ctx = self as unknown as {
  postMessage: (message: GomokuAiWorkerResponse) => void;
  addEventListener: (
    type: 'message',
    listener: (event: MessageEvent<GomokuAiWorkerRequest>) => void,
  ) => void;
};

ctx.addEventListener('message', (event) => {
  const { requestId, board, aiStone, difficulty, overrides } = event.data;
  const { move, result } = computeGomokuMove(board, aiStone, difficulty, overrides);
  ctx.postMessage({ requestId, move, result });
});
