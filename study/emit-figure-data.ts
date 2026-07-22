/**
 * Emits the exact numbers the blog post quotes, as JSON, so the write-up is
 * generated from the solver rather than transcribed by hand.
 */
import { decode, encode, Label, playMove, solve } from './tablebase';

const tb = solve();

interface Pos {
  xs: number[];
  os: number[];
  turn: number;
}
const at = (k: number): Pos => decode(k);
const idOf = (p: Pos) => tb.id(encode(p.xs, p.os, p.turn));
const NAMES = ['a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'c1', 'c2', 'c3'];

function legal(p: Pos) {
  const occ = new Set([...p.xs, ...p.os]);
  const out: Array<{ cell: number; win: boolean; next?: Pos }> = [];
  for (let c = 0; c < 9; c++) {
    if (occ.has(c)) continue;
    const r = playMove(p.xs, p.os, p.turn, c);
    out.push(r.win ? { cell: c, win: true } : { cell: c, win: false, next: at(r.key) });
  }
  return out;
}

const verdictOf = (p: Pos) => {
  const lab = tb.label[idOf(p)];
  if (lab === Label.DRAW) return { result: 'infinite' as const, dist: 0 };
  const winner = (lab === Label.WIN) === (p.turn === 0) ? 'X' : 'O';
  return { result: winner as 'X' | 'O', dist: tb.dist[idOf(p)] };
};

const empty: Pos = { xs: [], os: [], turn: 0 };

// 1. Verdict for each of X's nine opening moves.
const openings = Array.from({ length: 9 }, (_, cell) => {
  const p = at(playMove([], [], 0, cell).key);
  const v = verdictOf(p);
  // O's replies, with the verdict of each.
  const replies = legal(p).map((m) => ({
    cell: m.cell,
    name: NAMES[m.cell],
    ...verdictOf(m.next!),
  }));
  return {
    cell,
    name: NAMES[cell],
    kind: cell === 4 ? 'center' : cell % 2 === 0 ? 'corner' : 'edge',
    ...v,
    savingReplies: replies.filter((r) => r.result !== 'X').map((r) => r.name),
    replies,
  };
});

// 2. The forced win: X plays fastest, O resists longest.
function pv(start: Pos, maxPly: number) {
  const out: number[] = [];
  let p = start;
  for (let i = 0; i < maxPly; i++) {
    const lab = tb.label[idOf(p)];
    const opts = legal(p);
    let pick: (typeof opts)[number] | undefined;
    if (lab === Label.WIN) {
      pick = opts.find((m) => m.win);
      if (!pick) {
        let best = Infinity;
        for (const m of opts) {
          const l = tb.label[idOf(m.next!)];
          if (l === Label.LOSS && tb.dist[idOf(m.next!)] < best) {
            best = tb.dist[idOf(m.next!)];
            pick = m;
          }
        }
      }
    } else if (lab === Label.LOSS) {
      let best = -1;
      for (const m of opts) {
        const d = tb.dist[idOf(m.next!)];
        if (d > best) {
          best = d;
          pick = m;
        }
      }
    } else {
      pick = opts.find((m) => tb.label[idOf(m.next!)] === Label.DRAW);
    }
    if (!pick) break;
    out.push(pick.cell);
    if (pick.win) break;
    p = pick.next!;
  }
  return out;
}

const winLine = pv(empty, 30);

// 3. A drawn line, played out until the position literally repeats.
function drawCycle(start: Pos, maxPly = 200) {
  const moves: number[] = [];
  const seen = new Map<number, number>();
  let p = start;
  seen.set(encode(p.xs, p.os, p.turn), 0);
  for (let i = 0; i < maxPly; i++) {
    const opts = legal(p);
    const pick = opts.find((m) => !m.win && tb.label[idOf(m.next!)] === Label.DRAW);
    if (!pick) break;
    moves.push(pick.cell);
    p = pick.next!;
    const k = encode(p.xs, p.os, p.turn);
    if (seen.has(k)) {
      return { moves, cycleStart: seen.get(k)!, cycleEnd: i + 1 };
    }
    seen.set(k, i + 1);
  }
  return { moves, cycleStart: -1, cycleEnd: -1 };
}

const centerDraw = drawCycle(at(playMove([], [], 0, 4).key));
const cornerDraw = drawCycle(at(playMove([], [], 0, 0).key));

// 4. Census.
let win = 0;
let loss = 0;
let draw = 0;
for (let i = 0; i < tb.count; i++) {
  if (tb.label[i] === Label.WIN) win++;
  else if (tb.label[i] === Label.LOSS) loss++;
  else draw++;
}

// 5. Uniqueness of correct play in the 3v3 steady state.
let steady = 0;
let steadyUnique = 0;
let steadySafeTotal = 0;
for (let id = 0; id < tb.count; id++) {
  const p = at(tb.keys[id]);
  if (p.xs.length !== 3 || p.os.length !== 3) continue;
  const lab = tb.label[id];
  if (lab === Label.LOSS) continue;
  let safe = 0;
  for (const m of legal(p)) {
    if (m.win) {
      safe++;
      continue;
    }
    const cl = tb.label[idOf(m.next!)];
    if (lab === Label.WIN ? cl === Label.LOSS : cl !== Label.WIN) safe++;
  }
  steady++;
  steadySafeTotal += safe;
  if (safe === 1) steadyUnique++;
}

const out = {
  census: { total: tb.count, win, loss, draw },
  rootVerdict: verdictOf(empty),
  openings,
  winLine: { moves: winLine, names: winLine.map((c) => NAMES[c]) },
  centerDraw: { ...centerDraw, names: centerDraw.moves.map((c) => NAMES[c]) },
  cornerDraw: { ...cornerDraw, names: cornerDraw.moves.map((c) => NAMES[c]) },
  steadyState: {
    positions: steady,
    uniqueCorrectMove: steadyUnique,
    uniquePct: (100 * steadyUnique) / steady,
    avgSafeMoves: steadySafeTotal / steady,
  },
};

console.log(JSON.stringify(out, null, 2));
