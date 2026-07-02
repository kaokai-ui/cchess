// Shared AI-turn timer scheduler used by the solo game stores. Tracks every
// pending setTimeout so they can all be cancelled on reset / leave / undo,
// preventing a stray AI turn from firing into a fresh or torn-down game.
export interface AiTurnScheduler {
  schedule: (fn: () => void, ms: number) => ReturnType<typeof setTimeout>;
  clear: () => void;
}

export function createAiTurnScheduler(): AiTurnScheduler {
  const timers = new Set<ReturnType<typeof setTimeout>>();

  const schedule = (fn: () => void, ms: number) => {
    const id = setTimeout(() => {
      timers.delete(id);
      fn();
    }, ms);
    timers.add(id);
    return id;
  };

  const clear = () => {
    timers.forEach((id) => clearTimeout(id));
    timers.clear();
  };

  return { schedule, clear };
}
