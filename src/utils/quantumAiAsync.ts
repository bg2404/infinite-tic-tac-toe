import { Difficulty } from './engine';
import { QuantumSnapshot } from './quantum';
import { getQuantumMove, QuantumAiMove } from './quantumAi';
import type { QuantumAiRequest, QuantumAiResponse } from './quantumAi.worker';

let worker: Worker | null = null;
let nextId = 1;
let workerFailed = false;

function getWorker(): Worker | null {
  if (workerFailed) return null;
  if (worker) return worker;
  if (typeof Worker === 'undefined') {
    workerFailed = true;
    return null;
  }
  try {
    // Metro/Expo web resolves module workers via this URL pattern.
    worker = new Worker(new URL('./quantumAi.worker.ts', import.meta.url));
    worker.onerror = () => {
      workerFailed = true;
      worker?.terminate();
      worker = null;
    };
    return worker;
  } catch {
    workerFailed = true;
    return null;
  }
}

/**
 * Runs the quantum AI search off the main thread when a Worker is available,
 * falling back to the synchronous search otherwise. Keeps the UI responsive
 * for the larger Custom think-time budgets.
 */
export function getQuantumMoveAsync(
  snapshot: QuantumSnapshot,
  difficulty: Difficulty,
  customDepth: number
): Promise<QuantumAiMove | null> {
  const w = getWorker();
  if (!w) {
    return Promise.resolve(getQuantumMove(snapshot, difficulty, customDepth));
  }

  const id = nextId++;
  const request: QuantumAiRequest = { id, snapshot, difficulty, customDepth };

  return new Promise((resolve) => {
    const onMessage = (event: MessageEvent<QuantumAiResponse>) => {
      if (event.data.id !== id) return;
      w.removeEventListener('message', onMessage);
      resolve(event.data.move);
    };
    w.addEventListener('message', onMessage);
    w.postMessage(request);
  });
}
