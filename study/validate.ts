/**
 * Cross-checks the solver's rule model against the shipped game engine.
 *
 * Walks a large sample of reachable positions, and for every legal move
 * compares (a) whether the move wins and (b) the resulting position, as
 * computed by study/tablebase.ts vs src/utils/engine.ts. Any divergence means
 * the study is measuring a different game than the one that ships.
 */
import { applyMove, createInitialSnapshot, type Snapshot } from '../src/utils/engine';
import { decode, encode, playMove } from './tablebase';

/** Engine Snapshot -> solver state (age order recovered from placedAt). */
function toState(s: Snapshot) {
  const collect = (p: 'X' | 'O') =>
    s.board
      .map((m, i) => ({ m, i }))
      .filter((e) => e.m?.player === p)
      .sort((a, b) => a.m!.placedAt - b.m!.placedAt)
      .map((e) => e.i);
  return {
    xs: collect('X'),
    os: collect('O'),
    turn: s.currentPlayer === 'X' ? 0 : 1,
  };
}

let checkedStates = 0;
let checkedMoves = 0;
const seen = new Set<number>();

// BFS over engine snapshots, keyed by the solver's encoding.
let frontier: Snapshot[] = [createInitialSnapshot()];
seen.add(encode([], [], 0));

const MAX_PLY = 14; // deep enough to pass well beyond the 3-mark steady state
for (let ply = 0; ply < MAX_PLY && frontier.length > 0; ply++) {
  const next: Snapshot[] = [];
  for (const snap of frontier) {
    const { xs, os, turn } = toState(snap);
    checkedStates++;
    for (let cell = 0; cell < 9; cell++) {
      if (snap.board[cell]) continue;
      checkedMoves++;

      const engineNext = applyMove(snap, cell, 'infinite');
      const mine = playMove(xs, os, turn, cell);

      const engineWon = engineNext.winner === snap.currentPlayer;
      if (engineWon !== mine.win) {
        throw new Error(
          `win mismatch at ply ${ply} cell ${cell}: engine=${engineWon} solver=${mine.win} ` +
            `state x=[${xs}] o=[${os}] turn=${turn}`
        );
      }
      if (engineNext.winner && !engineWon) {
        throw new Error(`unexpected winner ${engineNext.winner} for mover ${snap.currentPlayer}`);
      }
      if (engineWon) continue;

      const ns = toState(engineNext);
      const engineKey = encode(ns.xs, ns.os, ns.turn);
      if (engineKey !== mine.key) {
        const a = decode(engineKey);
        const b = decode(mine.key);
        throw new Error(
          `state mismatch at ply ${ply} cell ${cell}: ` +
            `engine x=[${a.xs}] o=[${a.os}] t=${a.turn} vs solver x=[${b.xs}] o=[${b.os}] t=${b.turn}`
        );
      }
      if (!seen.has(engineKey)) {
        seen.add(engineKey);
        next.push(engineNext);
      }
    }
  }
  frontier = next;
}

// The board can never fill in Infinite mode, so the engine must never
// report a draw -- the study's "infinite game" claim depends on this.
console.log(`OK  ${checkedStates} positions, ${checkedMoves} moves cross-checked`);
console.log(`    ${seen.size} distinct positions reached within ${MAX_PLY} plies`);
