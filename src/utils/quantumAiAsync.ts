import { Difficulty } from './engine';
import { QuantumSnapshot } from './quantum';
import { getQuantumMove, QuantumAiMove } from './quantumAi';

/**
 * Async entry for the quantum AI. Prefer this from UI code so a future Worker
 * can drop in without changing callers.
 *
 * NOTE: Expo's `new Worker(new URL(..., import.meta.url))` transform leaves a
 * raw `import.meta` in the classic (non-module) web bundle, which throws
 * `Cannot use 'import.meta' outside a module` and blanks the whole app. Until
 * that ships cleanly, search stays on the main thread behind a microtask so
 * React can paint "Computer is thinking…" before the minimax runs.
 */
export function getQuantumMoveAsync(
  snapshot: QuantumSnapshot,
  difficulty: Difficulty,
  customDepth: number
): Promise<QuantumAiMove | null> {
  return new Promise((resolve) => {
    // Yield one frame so the thinking status can render before a deep search.
    const run = () => resolve(getQuantumMove(snapshot, difficulty, customDepth));
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => setTimeout(run, 0));
    } else {
      setTimeout(run, 0);
    }
  });
}
