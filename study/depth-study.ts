/**
 * Question 3: is there a search depth beyond which extra thinking stops
 * improving play, when the opponent is effectively infinitely strong?
 *
 * Three measurements:
 *
 *  A. EXHAUSTIVE BLUNDER RATE. For EVERY reachable position that still has
 *     something to lose (91,806 of them), ask the shipped engine at depth d
 *     for its move and check against the tablebase whether it throws the
 *     result away. No sampling, so no sampling error: these are exact rates.
 *
 *  B. PARITY DIAGNOSTIC. Odd depths end the search right after the engine's
 *     own move, which flatters the position; even depths end after the
 *     opponent's reply. This isolates that effect.
 *
 *  C. GAME-LEVEL SURVIVAL vs a perfect opponent that plays for maximum
 *     pressure: among moves preserving its own result it picks the one
 *     leaving the opponent fewest safe replies. Started from many drawn
 *     positions, the engine must survive; every loss is its own fault.
 *
 * The engine under test is the real one from src/utils/engine.ts.
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

function legal(p: Pos): Array<{ cell: number; win: boolean; next?: Pos }> {
  const occ = new Set([...p.xs, ...p.os]);
  const out: Array<{ cell: number; win: boolean; next?: Pos }> = [];
  for (let c = 0; c < 9; c++) {
    if (occ.has(c)) continue;
    const r = playMove(p.xs, p.os, p.turn, c);
    out.push(r.win ? { cell: c, win: true } : { cell: c, win: false, next: at(r.key) });
  }
  return out;
}

/** Does `cell` preserve the mover's tablebase result? */
function isSafe(p: Pos, cell: number): boolean {
  const r = playMove(p.xs, p.os, p.turn, cell);
  if (r.win) return true;
  const before = tb.label[idOf(p)];
  const after = tb.label[idOf(at(r.key))];
  if (before === Label.WIN) return after === Label.LOSS;
  if (before === Label.DRAW) return after !== Label.WIN;
  return true;
}

/** Tablebase position -> engine Snapshot (age order encoded in placedAt). */
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

const engineMove = (p: Pos, depth: number): number =>
  getAiMove(toSnapshot(p), 'infinite', 'custom', depth)!;

function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const DEPTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

// --- A. exhaustive blunder rate ------------------------------------------

const winIds: number[] = [];
const drawIds: number[] = [];
for (let id = 0; id < tb.count; id++) {
  if (tb.label[id] === Label.WIN) winIds.push(id);
  else if (tb.label[id] === Label.DRAW) drawIds.push(id);
}
const winPos = winIds.map((id) => at(tb.keys[id]));
const drawPos = drawIds.map((id) => at(tb.keys[id]));

console.log('='.repeat(78));
console.log('A. EXHAUSTIVE BLUNDER RATE BY SEARCH DEPTH');
console.log('='.repeat(78));
console.log('Every reachable position with something to lose. A blunder = a move');
console.log('that throws away the result the mover already had. Lost positions are');
console.log('excluded (nothing to throw away).');
console.log('');
console.log(`won positions   : ${winPos.length.toLocaleString()}`);
console.log(`drawn positions : ${drawPos.length.toLocaleString()}`);
console.log('');
console.log('depth   blunders in WON      blunders in DRAWN     overall   us/move');

interface Row {
  depth: number;
  wRate: number;
  dRate: number;
  overall: number;
  us: number;
  wBad: number;
  dBad: number;
  /** per-position blunder flags, for the parity diagnostic */
  flags: Uint8Array;
}
const rows: Row[] = [];
const total = winPos.length + drawPos.length;

for (const depth of DEPTHS) {
  const flags = new Uint8Array(total);
  let wBad = 0;
  let dBad = 0;
  const t0 = Date.now();
  for (let i = 0; i < winPos.length; i++) {
    if (!isSafe(winPos[i], engineMove(winPos[i], depth))) {
      wBad++;
      flags[i] = 1;
    }
  }
  for (let i = 0; i < drawPos.length; i++) {
    if (!isSafe(drawPos[i], engineMove(drawPos[i], depth))) {
      dBad++;
      flags[winPos.length + i] = 1;
    }
  }
  const us = ((Date.now() - t0) * 1000) / total;
  const wRate = (100 * wBad) / winPos.length;
  const dRate = (100 * dBad) / drawPos.length;
  const overall = (100 * (wBad + dBad)) / total;
  rows.push({ depth, wRate, dRate, overall, us, wBad, dBad, flags });
  console.log(
    `${String(depth).padStart(5)}   ${wRate.toFixed(2).padStart(6)}% (${String(wBad).padStart(5)})   ` +
      `${dRate.toFixed(2).padStart(7)}% (${String(dBad).padStart(5)})   ` +
      `${overall.toFixed(2).padStart(6)}%   ${us.toFixed(0).padStart(6)}`
  );
}
console.log('');

// --- B. parity diagnostic -------------------------------------------------

console.log('='.repeat(78));
console.log('B. ODD/EVEN PARITY DIAGNOSTIC');
console.log('='.repeat(78));
console.log('Odd depth = search stops right after the ENGINE moves (optimistic).');
console.log('Even depth = search stops after the OPPONENT replies (sober).');
console.log('');
console.log('Paired comparison on identical positions, odd depth d vs even d+1:');
console.log('');
console.log('  d -> d+1    only d blunders   only d+1 blunders   net');
for (let i = 0; i + 1 < rows.length; i++) {
  const a = rows[i];
  const b = rows[i + 1];
  if (a.depth % 2 !== 1) continue;
  let onlyA = 0;
  let onlyB = 0;
  for (let k = 0; k < total; k++) {
    if (a.flags[k] && !b.flags[k]) onlyA++;
    else if (!a.flags[k] && b.flags[k]) onlyB++;
  }
  const net = onlyA - onlyB;
  console.log(
    `  ${String(a.depth).padStart(2)} -> ${String(b.depth).padStart(2)}    ` +
      `${String(onlyA).padStart(13)}   ${String(onlyB).padStart(17)}   ` +
      `${net > 0 ? 'even depth fixes ' + net : 'odd depth better by ' + -net}`
  );
}
console.log('');
console.log('Mean blunder rate by parity:');
const odd = rows.filter((r) => r.depth % 2 === 1);
const even = rows.filter((r) => r.depth % 2 === 0);
const mean = (a: Row[]) => a.reduce((s, r) => s + r.overall, 0) / a.length;
console.log(`  odd  depths (${odd.map((r) => r.depth).join(',')}) : ${mean(odd).toFixed(2)}%`);
console.log(`  even depths (${even.map((r) => r.depth).join(',')}) : ${mean(even).toFixed(2)}%`);
console.log('');
console.log('Depth-for-depth: is an even depth ever beaten by a DEEPER odd depth?');
for (const e of even) {
  const worseDeeper = odd.filter((o) => o.depth > e.depth && o.overall > e.overall);
  if (worseDeeper.length) {
    console.log(
      `  depth ${e.depth} (${e.overall.toFixed(2)}%) beats deeper odd depths ` +
        worseDeeper.map((o) => `${o.depth} (${o.overall.toFixed(2)}%)`).join(', ')
    );
  }
}
console.log('');

// --- C. survival against a perfect, trap-setting opponent ----------------

function perfectMove(p: Pos): number {
  const lab = tb.label[idOf(p)];
  const opts = legal(p);
  const immediate = opts.find((m) => m.win);
  if (immediate) return immediate.cell;

  const keep = opts.filter((m) => {
    const cl = tb.label[idOf(m.next!)];
    if (lab === Label.WIN) return cl === Label.LOSS;
    if (lab === Label.DRAW) return cl !== Label.WIN;
    return true;
  });
  const pool = keep.length > 0 ? keep : opts;

  let best = pool[0];
  let bestScore = Infinity;
  for (const m of pool) {
    const q = m.next!;
    const replies = legal(q).filter((r) => r.win || isSafe(q, r.cell)).length;
    const d = tb.dist[idOf(q)];
    const score = replies * 100 + (lab === Label.LOSS ? -d : d);
    if (score < bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best.cell;
}

const rng = makeRng(20260722);
const shuffled = [...drawIds];
for (let i = shuffled.length - 1; i > 0; i--) {
  const j = Math.floor(rng() * (i + 1));
  [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
}
const STARTS = 500;
const PLY_CAP = 60;
const holdStarts = shuffled.slice(0, STARTS).map((id) => at(tb.keys[id]));

console.log('='.repeat(78));
console.log('C. HOLDING A DRAWN POSITION vs a PERFECT TRAP-SETTING OPPONENT');
console.log('='.repeat(78));
console.log(`${STARTS} theoretically drawn starting positions, engine moves first,`);
console.log(`${PLY_CAP}-ply cap. The opponent can never win unless the engine errs,`);
console.log('so every loss is entirely the engine\'s doing.');
console.log('');
console.log('depth   held    lost   survival');
for (const depth of DEPTHS) {
  let lost = 0;
  for (const start of holdStarts) {
    let p = start;
    for (let ply = 0; ply < PLY_CAP; ply++) {
      const engineToMove = ply % 2 === 0;
      const cell = engineToMove ? engineMove(p, depth) : perfectMove(p);
      const r = playMove(p.xs, p.os, p.turn, cell);
      if (r.win) {
        if (!engineToMove) lost++;
        break;
      }
      p = at(r.key);
    }
  }
  const held = STARTS - lost;
  console.log(
    `${String(depth).padStart(5)}   ${String(held).padStart(4)}   ${String(lost).padStart(5)}   ` +
      `${((100 * held) / STARTS).toFixed(1).padStart(5)}%`
  );
}
console.log('');

// --- summary --------------------------------------------------------------

console.log('='.repeat(78));
console.log('PLATEAU CHECK');
console.log('='.repeat(78));
const best = rows.reduce((a, b) => (b.overall < a.overall ? b : a));
console.log(`lowest blunder rate: ${best.overall.toFixed(2)}% at depth ${best.depth}`);
console.log('');
console.log('step        change      cost multiplier');
for (let i = 1; i < rows.length; i++) {
  const d = rows[i].overall - rows[i - 1].overall;
  const arrow = d < -0.02 ? 'better' : d > 0.02 ? 'WORSE ' : 'flat  ';
  console.log(
    `  ${String(rows[i - 1].depth).padStart(2)} -> ${String(rows[i].depth).padStart(2)}   ` +
      `${((d >= 0 ? '+' : '') + d.toFixed(2)).padStart(7)} pp  ${arrow}   ` +
      `x${(rows[i].us / Math.max(rows[i - 1].us, 1)).toFixed(1)}`
  );
}
console.log('');
console.log('Shipped difficulty settings, for reference:');
console.log('  Hard = depth 5; Custom offers 3 / 5 / 7 / 9 (default 7) — all ODD.');
for (const d of [3, 5, 7, 9]) {
  const r = rows.find((x) => x.depth === d)!;
  console.log(`  depth ${d}: ${r.overall.toFixed(2)}% blunder rate, ${r.us.toFixed(0)} us/move`);
}
