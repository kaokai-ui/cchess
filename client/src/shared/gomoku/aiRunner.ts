// Runs the gomoku AI in Web Workers with a synchronous fallback. Callers always
// get a Promise, so the store path is the same whether or not workers exist
// (tests / SSR fall back to running inline).
//
// Most levels use a single worker. 無極 asks `getParallelPlan` how to spread the
// move over the machine: with enough cores the deep search and the VCF / VCT
// solvers run at the same time on the same position, and `pickParallelResult`
// decides which answer wins (a proven win always beats a heuristic move).
import {
  computeGomokuMove,
  getParallelPlan,
  pickParallelResult,
  type GomokuAIDifficulty,
} from './ai';
import type { GomokuAiWorkerRequest, GomokuAiWorkerResponse } from './ai.worker';
import type { GomokuSearchConfig, GomokuSearchResult } from './search';
import type { GomokuBoard, GomokuPosition, GomokuStone } from './types';

const MAX_WORKERS = 3;

const workers: (Worker | null)[] = [];
let workersUnavailable = false;
let requestSeq = 0;

function availableSlots(): number {
  const cores =
    typeof navigator !== 'undefined' && typeof navigator.hardwareConcurrency === 'number'
      ? navigator.hardwareConcurrency
      : 0;

  if (cores <= 0) {
    return 1;
  }

  // Leave a core for the UI thread and the browser itself.
  return Math.max(1, Math.min(MAX_WORKERS, cores - 1));
}

function getWorker(slot: number): Worker | null {
  if (workersUnavailable || typeof Worker === 'undefined') {
    workersUnavailable = true;
    return null;
  }

  if (!workers[slot]) {
    try {
      workers[slot] = new Worker(new URL('./ai.worker.ts', import.meta.url), {
        type: 'module',
      });
    } catch {
      workersUnavailable = true;
      workers[slot] = null;
    }
  }

  return workers[slot] ?? null;
}

function disableWorkers(): void {
  workersUnavailable = true;

  for (const worker of workers) {
    worker?.terminate();
  }

  workers.length = 0;
}

interface WorkerOutcome {
  move: GomokuPosition | null;
  result: GomokuSearchResult | null;
}

function runInWorker(
  worker: Worker,
  board: GomokuBoard,
  aiStone: GomokuStone,
  difficulty: GomokuAIDifficulty,
  overrides: Partial<GomokuSearchConfig>,
): Promise<WorkerOutcome> {
  return new Promise((resolve) => {
    const requestId = (requestSeq += 1);
    let settled = false;

    const finish = (outcome: WorkerOutcome) => {
      if (settled) {
        return;
      }

      settled = true;
      worker.removeEventListener('message', onMessage);
      worker.removeEventListener('error', onError);
      resolve(outcome);
    };

    const onMessage = (event: MessageEvent<GomokuAiWorkerResponse>) => {
      if (event.data.requestId !== requestId) {
        return;
      }

      finish({ move: event.data.move, result: event.data.result });
    };

    const onError = () => {
      // Worker failed: disable the pool and fall back inline for this and every
      // later move so the game never stalls.
      disableWorkers();
      finish(computeGomokuMove(board, aiStone, difficulty, overrides));
    };

    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', onError);

    try {
      const request: GomokuAiWorkerRequest = {
        requestId,
        board,
        aiStone,
        difficulty,
        overrides,
      };
      worker.postMessage(request);
    } catch {
      onError();
    }
  });
}

export async function computeGomokuAiMove(
  board: GomokuBoard,
  aiStone: GomokuStone,
  difficulty: GomokuAIDifficulty,
): Promise<GomokuPosition | null> {
  const plan = getParallelPlan(difficulty, availableSlots());
  const pool: Worker[] = [];

  for (let slot = 0; slot < plan.length; slot += 1) {
    const worker = getWorker(slot);

    if (!worker) {
      break;
    }

    pool.push(worker);
  }

  // No workers at all: run the whole (sequential) pipeline inline.
  if (pool.length === 0) {
    return computeGomokuMove(board, aiStone, difficulty).move;
  }

  // Fewer workers than the plan wanted: re-plan for what we actually got, so a
  // partial pool can never end up running "search only" with nobody hunting for
  // a forced win.
  const activePlan =
    pool.length === plan.length ? plan : getParallelPlan(difficulty, pool.length);
  const outcomes = await Promise.all(
    activePlan.map((overrides, slot) =>
      runInWorker(pool[slot], board, aiStone, difficulty, overrides),
    ),
  );

  if (activePlan.length === 1) {
    return outcomes[0].move;
  }

  const best = pickParallelResult(outcomes.map((outcome) => outcome.result));

  if (best) {
    const winner = outcomes.find((outcome) => outcome.result === best);

    if (winner?.move) {
      return winner.move;
    }
  }

  return outcomes.find((outcome) => outcome.move)?.move ?? null;
}
