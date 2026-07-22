/**
 * Is the odd/even depth split actually useful?
 *
 * depth-study.ts established that odd depths play worse, and that the effect
 * survives far deeper here than in ordinary games because drawn positions
 * contain no terminal node to anchor the search. That is a fact about the
 * variant. This asks whether it is also a *tool*.
 *
 * The test: a real engine has no tablebase. But it can cheaply compute its
 * move at two adjacent depths and check whether they agree. If disagreement
 * concentrates the blunders, then parity instability is an oracle-free
 * runtime signal for "this position is not resolved" — usable in any game,
 * not just one small enough to solve.
 *
 * Reports, for each pair (d, d+1):
 *   - how often the two depths disagree
 *   - blunder rate at d given they disagree, versus given they agree
 *   - what share of all of d's blunders fall in the disagreement set
 */
import { getAiMove, type Player, type Snapshot } from '../src/utils/engine';
import { decode, encode, Label, playMove, solve } from './tablebase';

const tb = solve();

interface Pos {
  xs: number[];
  os: number[];
  turn: number;
}
const at = (k: number): Pos => decode(k);
const idOf = (p: Pos) => tb.id(encode(p.xs, p.os, p.turn));

function isSafe(p: Pos, cell: number): boolean {
  const r = playMove(p.xs, p.os, p.turn, cell);
  if (r.win) return true;
  const before = tb.label[idOf(p)];
  const after = tb.label[idOf(at(r.key))];
  if (before === Label.WIN) return after === Label.LOSS;
  if (before === Label.DRAW) return after !== Label.WIN;
  return true;
}

function toSnapshot(p: Pos): Snapshot {
  const board: Array<{ player: Player; placedAt: number } | null> = Array(9).fill(null);
  p.xs.forEach((c, i) => (board[c] = { player: 'X', placedAt: i + 1 }));
  p.os.forEach((c, i) => (board[c] = { player: 'O', placedAt: i + 1 }));
  return {
    board,
    currentPlayer: p.turn === 0 ? 'X' : 'O',
    moveNumber: 10,
    winner: null,
    winLine: null,
  };
}
const engineMove = (p: Pos, depth: number) =>
  getAiMove(toSnapshot(p), 'infinite', 'custom', depth)!;

// Every drawn position, plus an equal-sized deterministic sample of won ones.
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const drawIds: number[] = [];
const winIds: number[] = [];
for (let id = 0; id < tb.count; id++) {
  if (tb.label[id] === Label.DRAW) drawIds.push(id);
  else if (tb.label[id] === Label.WIN) winIds.push(id);
}
const r = rng(20260722);
for (let i = winIds.length - 1; i > 0; i--) {
  const j = Math.floor(r() * (i + 1));
  [winIds[i], winIds[j]] = [winIds[j], winIds[i]];
}
const sample = [
  ...drawIds.map((id) => ({ pos: at(tb.keys[id]), drawn: true })),
  ...winIds.slice(0, drawIds.length).map((id) => ({ pos: at(tb.keys[id]), drawn: false })),
];

const DEPTHS = [5, 6, 7, 8, 9, 10, 11];
console.log('='.repeat(78));
console.log('IS THE ODD/EVEN SPLIT USABLE AT RUNTIME?');
console.log('='.repeat(78));
console.log(`${sample.length.toLocaleString()} positions (${drawIds.length.toLocaleString()} drawn,`);
console.log(`${drawIds.length.toLocaleString()} won). Computing engine moves at depths ${DEPTHS.join(', ')}…`);
console.log('');

// moves[d][i] = engine's chosen cell at depth d for sample position i
const moves = new Map<number, Uint8Array>();
for (const d of DEPTHS) {
  const t0 = Date.now();
  const arr = new Uint8Array(sample.length);
  for (let i = 0; i < sample.length; i++) arr[i] = engineMove(sample[i].pos, d);
  moves.set(d, arr);
  console.log(`  depth ${String(d).padStart(2)} done in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
}
console.log('');

const safeCache = new Map<string, boolean>();
const blunders = (d: number, i: number) => {
  const k = `${d}:${i}`;
  let v = safeCache.get(k);
  if (v === undefined) {
    v = !isSafe(sample[i].pos, moves.get(d)![i]);
    safeCache.set(k, v);
  }
  return v;
};

console.log('-'.repeat(78));
console.log('DOES DISAGREEMENT BETWEEN ADJACENT DEPTHS PREDICT A BLUNDER?');
console.log('-'.repeat(78));
console.log('For each pair, the blunder rate of the SHALLOWER depth, split by');
console.log('whether the two depths chose the same move.');
console.log('');
console.log('pair     disagree   blunder|disagree   blunder|agree    lift   recall');

for (let k = 0; k + 1 < DEPTHS.length; k++) {
  const d = DEPTHS[k];
  const e = DEPTHS[k + 1];
  const a = moves.get(d)!;
  const b = moves.get(e)!;

  let disagree = 0;
  let badGivenDisagree = 0;
  let badGivenAgree = 0;
  for (let i = 0; i < sample.length; i++) {
    const differs = a[i] !== b[i];
    const bad = blunders(d, i);
    if (differs) {
      disagree++;
      if (bad) badGivenDisagree++;
    } else if (bad) badGivenAgree++;
  }
  const agree = sample.length - disagree;
  const pD = disagree ? (100 * badGivenDisagree) / disagree : 0;
  const pA = agree ? (100 * badGivenAgree) / agree : 0;
  const totalBad = badGivenDisagree + badGivenAgree;
  const recall = totalBad ? (100 * badGivenDisagree) / totalBad : 0;
  console.log(
    `${String(d).padStart(2)}→${String(e).padEnd(2)}  ` +
      `${((100 * disagree) / sample.length).toFixed(1).padStart(8)}%   ` +
      `${pD.toFixed(2).padStart(14)}%   ${pA.toFixed(2).padStart(12)}%   ` +
      `${(pA > 0 ? pD / pA : Infinity).toFixed(1).padStart(5)}x  ${recall.toFixed(1).padStart(5)}%`
  );
}

console.log('');
console.log('lift   = how many times more likely a blunder is when the depths disagree');
console.log('recall = share of all the shallower depth\'s blunders that land in that set');
console.log('');

// Does the signal fire where the theory says it should -- on drawn positions?
console.log('-'.repeat(78));
console.log('WHERE DOES THE DISAGREEMENT CONCENTRATE?');
console.log('-'.repeat(78));
console.log('Drawn positions have no terminal node at any depth; won positions do.');
console.log('');
console.log('pair     disagree (drawn)   disagree (won)');
for (let k = 0; k + 1 < DEPTHS.length; k++) {
  const d = DEPTHS[k];
  const e = DEPTHS[k + 1];
  const a = moves.get(d)!;
  const b = moves.get(e)!;
  let dd = 0;
  let dw = 0;
  let nd = 0;
  let nw = 0;
  for (let i = 0; i < sample.length; i++) {
    const differs = a[i] !== b[i];
    if (sample[i].drawn) {
      nd++;
      if (differs) dd++;
    } else {
      nw++;
      if (differs) dw++;
    }
  }
  console.log(
    `${String(d).padStart(2)}→${String(e).padEnd(2)}  ` +
      `${((100 * dd) / nd).toFixed(1).padStart(16)}%   ${((100 * dw) / nw).toFixed(1).padStart(13)}%`
  );
}
console.log('');

// The practical question: given one more ply of budget, spend it on parity
// (odd -> even) or on raw depth (odd -> odd+2)?
console.log('-'.repeat(78));
console.log('SPEND THE NEXT PLY ON PARITY, OR ON DEPTH?');
console.log('-'.repeat(78));
console.log('Blunder rate over the whole sample, for each option from an odd depth.');
console.log('');
console.log('from   +1 ply (even)      +2 plies (odd)');
for (const d of DEPTHS.filter((x) => x % 2 === 1)) {
  const rate = (dd: number) => {
    if (!moves.has(dd)) return null;
    let bad = 0;
    for (let i = 0; i < sample.length; i++) if (blunders(dd, i)) bad++;
    return (100 * bad) / sample.length;
  };
  const base = rate(d)!;
  const even = rate(d + 1);
  const deeper = rate(d + 2);
  const fmt = (v: number | null) =>
    v === null ? '     —   ' : `${v.toFixed(2)}%`.padStart(9);
  console.log(
    `${String(d).padStart(2)} (${base.toFixed(2)}%)  ${fmt(even)}        ${fmt(deeper)}`
  );
}
