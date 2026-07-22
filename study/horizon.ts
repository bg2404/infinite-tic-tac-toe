/**
 * The horizon question.
 *
 * In Classic tic-tac-toe, depth 9 is perfect: the board fills, so the search
 * reaches real terminal nodes and the heuristic never gets consulted.
 *
 * Infinite mode has no terminal draw. A drawn position is one where play
 * cycles forever. A fixed-depth search can never *see* that -- it always
 * bottoms out in a heuristic guess about a position that is, in truth,
 * neither won nor lost. This script asks whether extra depth eventually
 * washes that out, or whether a residue of permanently-misjudged positions
 * survives at every depth.
 *
 * Measures depths 13..16 on drawn positions only (the expensive, interesting
 * set), and identifies positions blundered at EVERY depth tested.
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

const drawIds: number[] = [];
for (let id = 0; id < tb.count; id++) if (tb.label[id] === Label.DRAW) drawIds.push(id);
const drawPos = drawIds.map((id) => at(tb.keys[id]));

const NAMES = ['a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'c1', 'c2', 'c3'];

console.log('='.repeat(78));
console.log('BLUNDER RATE IN DRAWN POSITIONS, DEEP SEARCH');
console.log('='.repeat(78));
console.log(`${drawPos.length.toLocaleString()} theoretically drawn positions.`);
console.log('A drawn position has no terminal node anywhere below it -- play cycles.');
console.log('');
console.log('depth   blunders    rate     ms/move');

const DEPTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
const flagsByDepth = new Map<number, Uint8Array>();

for (const depth of DEPTHS) {
  const flags = new Uint8Array(drawPos.length);
  let bad = 0;
  const t0 = Date.now();
  for (let i = 0; i < drawPos.length; i++) {
    if (!isSafe(drawPos[i], engineMove(drawPos[i], depth))) {
      bad++;
      flags[i] = 1;
    }
  }
  const ms = (Date.now() - t0) / drawPos.length;
  flagsByDepth.set(depth, flags);
  const parity = depth % 2 === 1 ? 'odd ' : 'even';
  console.log(
    `${String(depth).padStart(5)}   ${String(bad).padStart(8)}   ` +
      `${((100 * bad) / drawPos.length).toFixed(2).padStart(6)}%   ${ms.toFixed(2).padStart(7)}  ${parity}`
  );
}
console.log('');

// --- permanent blind spots -----------------------------------------------

console.log('='.repeat(78));
console.log('PERMANENT BLIND SPOTS');
console.log('='.repeat(78));
console.log('Drawn positions the engine mishandles at EVERY depth tested:');
console.log('');

const always: number[] = [];
const deepAlways: number[] = []; // blundered at every depth >= 8
for (let i = 0; i < drawPos.length; i++) {
  if (DEPTHS.every((d) => flagsByDepth.get(d)![i])) always.push(i);
  if (DEPTHS.filter((d) => d >= 8).every((d) => flagsByDepth.get(d)![i])) deepAlways.push(i);
}
console.log(`blundered at all depths 1-16  : ${always.length}`);
console.log(`blundered at all depths 8-16  : ${deepAlways.length}`);
console.log('');

const render = (p: Pos) => {
  const g = Array<string>(9).fill('.');
  p.xs.forEach((c, i) => (g[c] = p.xs.length === 3 && i === 0 ? 'x' : 'X'));
  p.os.forEach((c, i) => (g[c] = p.os.length === 3 && i === 0 ? 'o' : 'O'));
  return [0, 3, 6].map((r) => g.slice(r, r + 3).join(' '));
};

for (const i of deepAlways.slice(0, 3)) {
  const p = drawPos[i];
  const rows = render(p);
  const mover = p.turn === 0 ? 'X' : 'O';
  const safeMoves: number[] = [];
  const occ = new Set([...p.xs, ...p.os]);
  for (let c = 0; c < 9; c++) if (!occ.has(c) && isSafe(p, c)) safeMoves.push(c);
  console.log(`  ${rows[0]}    ${mover} to move. This position is a DRAW.`);
  console.log(`  ${rows[1]}    only move that holds it: ${safeMoves.map((c) => NAMES[c]).join(', ')}`);
  console.log(`  ${rows[2]}    engine plays: ` + DEPTHS.map((d) => NAMES[engineMove(p, d)]).join(' '));
  console.log(`             (depths ${DEPTHS.join(' ')})`.replace(/\d+/g, (m) => m.padStart(2)));
  console.log('');
}

// --- monotonicity ---------------------------------------------------------

console.log('='.repeat(78));
console.log('IS DEEPER ALWAYS BETTER, IN DRAWN POSITIONS?');
console.log('='.repeat(78));
let regressions = 0;
for (let i = 1; i < DEPTHS.length; i++) {
  const a = flagsByDepth.get(DEPTHS[i - 1])!.reduce((s, v) => s + v, 0);
  const b = flagsByDepth.get(DEPTHS[i])!.reduce((s, v) => s + v, 0);
  if (b > a) {
    regressions++;
    console.log(
      `  depth ${DEPTHS[i - 1]} -> ${DEPTHS[i]}: ${a} -> ${b} blunders  ` +
        `(+${b - a}, WORSE despite searching a ply deeper)`
    );
  }
}
if (regressions === 0) console.log('  no regressions');
console.log('');
console.log(`${regressions} of ${DEPTHS.length - 1} extra plies made play strictly worse.`);
