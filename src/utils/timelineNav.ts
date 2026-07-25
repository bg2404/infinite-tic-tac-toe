import { Player } from './engine';

/**
 * Against the AI, undo/redo must span a full human turn plus the AI's reply —
 * but a turn is not always one snapshot. Closing a cycle makes the AI measure
 * then place (two decisions); measuring a cycle the AI closed can make the
 * human measure then place. Walk by contiguous actor runs instead of a fixed
 * stride.
 *
 * `actors[i]` is who committed the transition that produced `history[i]`.
 * `actors[0]` is always null (the initial position).
 */

/** Rewind past the trailing AI run (if any), then past the human run before it. */
export function undoActorRun(
  actors: ReadonlyArray<Player | null>,
  pointer: number,
  ai: Player
): number {
  if (pointer <= 0) return 0;
  let p = pointer;
  while (p > 0 && actors[p] === ai) p -= 1;
  const human: Player = ai === 'O' ? 'X' : 'O';
  while (p > 0 && actors[p] === human) p -= 1;
  return p;
}

/** Advance through the next human run, then through the AI reply that follows. */
export function redoActorRun(
  actors: ReadonlyArray<Player | null>,
  pointer: number,
  ai: Player
): number {
  const last = actors.length - 1;
  if (pointer >= last) return pointer;
  let p = pointer + 1;
  const human: Player = ai === 'O' ? 'X' : 'O';
  while (p < last && actors[p + 1] === human) p += 1;
  while (p < last && actors[p + 1] === ai) p += 1;
  return p;
}
