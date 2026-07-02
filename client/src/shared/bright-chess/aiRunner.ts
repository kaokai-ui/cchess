// Runs the bright-chess AI in a Web Worker (off the main thread) with a robust
// synchronous fallback. Callers get a Promise either way, so the store code path
// is identical whether or not workers are available (tests / SSR fall back).
import { getAIMove, type AIMove } from './ai';
import type { Board, PieceColor } from '../types';
import type {
  BrightAiWorkerRequest,
  BrightAiWorkerResponse,
} from './ai.worker';

export type BrightDifficulty = 'easy' | 'normal' | 'hard' | 'master';

let worker: Worker | null = null;
let workerUnavailable = false;
let requestSeq = 0;

function getWorker(): Worker | null {
  if (workerUnavailable) {
    return null;
  }

  if (typeof Worker === 'undefined') {
    workerUnavailable = true;
    return null;
  }

  if (!worker) {
    try {
      worker = new Worker(new URL('./ai.worker.ts', import.meta.url), {
        type: 'module',
      });
    } catch {
      workerUnavailable = true;
      worker = null;
    }
  }

  return worker;
}

export function computeBrightAiMove(
  board: Board,
  aiColor: PieceColor,
  difficulty: BrightDifficulty,
): Promise<AIMove | null> {
  const activeWorker = getWorker();

  if (!activeWorker) {
    // No worker environment: run synchronously so play always continues.
    return Promise.resolve(getAIMove(board, aiColor, difficulty));
  }

  return new Promise((resolve) => {
    const requestId = (requestSeq += 1);
    let settled = false;

    const finish = (move: AIMove | null) => {
      if (settled) {
        return;
      }
      settled = true;
      activeWorker.removeEventListener('message', onMessage);
      activeWorker.removeEventListener('error', onError);
      resolve(move);
    };

    const onMessage = (event: MessageEvent<BrightAiWorkerResponse>) => {
      if (event.data.requestId !== requestId) {
        return;
      }
      finish(event.data.move);
    };

    const onError = () => {
      // Worker failed: disable it and fall back synchronously for this and
      // subsequent moves so the game never stalls.
      workerUnavailable = true;
      worker = null;
      finish(getAIMove(board, aiColor, difficulty));
    };

    activeWorker.addEventListener('message', onMessage);
    activeWorker.addEventListener('error', onError);

    try {
      const request: BrightAiWorkerRequest = { requestId, board, aiColor, difficulty };
      activeWorker.postMessage(request);
    } catch {
      onError();
    }
  });
}
