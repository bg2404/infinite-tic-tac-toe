/**
 * Question 1 & 2: classify opening patterns as forced win for X, forced win
 * for O, or an infinite game, under optimal play by both sides.
 */
import { canonicalMoves, decode, Label, playMove, solve, type Tablebase } from './tablebase';

const t0 = Date.now();
const tb = solve();
const solveMs = Date.now() - t0;

// --- global statistics ----------------------------------------------------

let win = 0;
let loss = 0;
let draw = 0;
for (let i = 0; i < tb.count; i++) {
  if (tb.label[i] === Label.WIN) win++;
  else if (tb.label[i] === Label.LOSS) loss++;
  else draw++;
}

console.log('='.repeat(72));
console.log('INFINITE TIC-TAC-TOE — EXACT SOLUTION');
console.log('='.repeat(72));
console.log(`Reachable non-terminal positions : ${tb.count.toLocaleString()}`);
console.log(`Solved in                        : ${solveMs} ms`);
console.log('');
console.log('Position classification (from the side-to-move\'s perspective):');
const pct = (x: number) => ((100 * x) / tb.count).toFixed(1).padStart(5);
console.log(`  WIN  (mover forces a win)  : ${win.toString().padStart(7)}  ${pct(win)}%`);
console.log(`  LOSS (mover is lost)       : ${loss.toString().padStart(7)}  ${pct(loss)}%`);
console.log(`  DRAW (game runs forever)   : ${draw.toString().padStart(7)}  ${pct(draw)}%`);
console.log('');

// --- opening tree ---------------------------------------------------------

const NAMES = ['a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'c1', 'c2', 'c3'];
const CLASS = ['corner', 'edge', 'corner', 'edge', 'CENTER', 'edge', 'corner', 'edge', 'corner'];

interface Node {
  moves: number[];
  xs: number[];
  os: number[];
  turn: number;
  key: number;
}

const root: Node = { moves: [], xs: [], os: [], turn: 0, key: tb.keys[0] };

/** Verdict for a position, phrased in absolute (X / O) terms. */
function verdict(key: number, turn: number): { text: string; tag: 'X' | 'O' | 'INF'; dist: number } {
  const id = tb.id(key);
  const label = tb.label[id];
  if (label === Label.DRAW) return { text: 'infinite game', tag: 'INF', dist: 0 };
  const moverWins = label === Label.WIN;
  const moverIsX = turn === 0;
  const winner = moverWins === moverIsX ? 'X' : 'O';
  const d = tb.dist[id];
  return { text: `${winner} forces a win in ${d} ply`, tag: winner, dist: d };
}

function children(n: Node): Array<{ node: Node; immediateWin: boolean }> {
  const occupied = new Set([...n.xs, ...n.os]);
  const out: Array<{ node: Node; immediateWin: boolean }> = [];
  for (let cell = 0; cell < 9; cell++) {
    if (occupied.has(cell)) continue;
    const r = playMove(n.xs, n.os, n.turn, cell);
    if (r.win) {
      out.push({ node: { ...n, moves: [...n.moves, cell] }, immediateWin: true });
      continue;
    }
    const d = decode(r.key);
    out.push({
      node: { moves: [...n.moves, cell], xs: d.xs, os: d.os, turn: d.turn, key: r.key },
      immediateWin: false,
    });
  }
  return out;
}

const rootV = verdict(root.key, 0);
console.log('-'.repeat(72));
console.log(`THE GAME ITSELF (empty board, X to move): ${rootV.text.toUpperCase()}`);
console.log('-'.repeat(72));
console.log('');

// Ply 1: X's first move, deduplicated by symmetry.
console.log("X's opening move (3 distinct classes up to symmetry):");
const seen1 = new Set<string>();
for (const { node } of children(root)) {
  const canon = canonicalMoves(node.moves);
  if (seen1.has(canon)) continue;
  seen1.add(canon);
  const v = verdict(node.key, node.turn);
  console.log(
    `  ${NAMES[node.moves[0]]} (${CLASS[node.moves[0]].padEnd(6)}) -> ${v.text}`
  );
}
console.log('');

// Ply 2: O's reply to each distinct X opening.
console.log("O's reply (all distinct 2-ply openings up to symmetry):");
const seen2 = new Set<string>();
for (const { node: n1 } of children(root)) {
  if (canonicalMoves(n1.moves) !== canonicalMoves(n1.moves)) continue;
  for (const { node: n2 } of children(n1)) {
    const canon = canonicalMoves(n2.moves);
    if (seen2.has(canon)) continue;
    seen2.add(canon);
    const v = verdict(n2.key, n2.turn);
    const flag = v.tag === 'INF' ? '   ' : ' ! ';
    console.log(
      `${flag}X:${NAMES[n2.moves[0]]}(${CLASS[n2.moves[0]]})  O:${NAMES[n2.moves[1]]}(${CLASS[n2.moves[1]]})`.padEnd(
        44
      ) + `-> ${v.text}`
    );
  }
}
console.log('');

// Deeper: how the verdict distribution evolves with opening length.
console.log('-'.repeat(72));
console.log('VERDICT DISTRIBUTION BY OPENING LENGTH (symmetry-reduced, legal lines only)');
console.log('-'.repeat(72));
console.log('ply   distinct    X wins    O wins  infinite   losing-move share');

let frontier: Node[] = [root];
for (let ply = 1; ply <= 6; ply++) {
  const nextMap = new Map<string, Node>();
  let terminalWins = 0;
  for (const n of frontier) {
    for (const { node, immediateWin } of children(n)) {
      if (immediateWin) {
        terminalWins++;
        continue;
      }
      const canon = canonicalMoves(node.moves);
      if (!nextMap.has(canon)) nextMap.set(canon, node);
    }
  }
  const nodes = [...nextMap.values()];
  let x = 0;
  let o = 0;
  let inf = 0;
  for (const n of nodes) {
    const v = verdict(n.key, n.turn);
    if (v.tag === 'X') x++;
    else if (v.tag === 'O') o++;
    else inf++;
  }
  // A "losing move" = a move that hands a forced win to the opponent.
  const moverIsX = ply % 2 === 1;
  const blunders = moverIsX ? o : x;
  const share = nodes.length ? ((100 * blunders) / nodes.length).toFixed(1) : '0.0';
  console.log(
    `${String(ply).padStart(3)} ${String(nodes.length).padStart(10)} ` +
      `${String(x).padStart(9)} ${String(o).padStart(9)} ${String(inf).padStart(9)}   ` +
      `${share.padStart(5)}%  (${moverIsX ? 'X' : 'O'} moved${terminalWins ? `, +${terminalWins} already won` : ''})`
  );
  frontier = nodes;
}
console.log('');

export { tb };
