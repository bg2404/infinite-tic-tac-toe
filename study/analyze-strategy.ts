/**
 * Turns the tablebase into human strategy: principal variations, the shape of
 * the draw region, and how forgiving each phase of the game is.
 */
import { decode, encode, Label, playMove, solve } from './tablebase';

const tb = solve();

const NAMES = ['a1', 'a2', 'a3', 'b1', 'b2', 'b3', 'c1', 'c2', 'c3'];
const KIND = (i: number) => (i === 4 ? 'center' : i % 2 === 0 ? 'corner' : 'edge');

interface Pos {
  xs: number[];
  os: number[];
  turn: number;
}

const at = (key: number): Pos => decode(key);
const idOf = (p: Pos) => tb.id(encode(p.xs, p.os, p.turn));
const labelOf = (p: Pos) => tb.label[idOf(p)];
const distOf = (p: Pos) => tb.dist[idOf(p)];

function moves(p: Pos): Array<{ cell: number; win: boolean; next?: Pos }> {
  const occ = new Set([...p.xs, ...p.os]);
  const out: Array<{ cell: number; win: boolean; next?: Pos }> = [];
  for (let c = 0; c < 9; c++) {
    if (occ.has(c)) continue;
    const r = playMove(p.xs, p.os, p.turn, c);
    out.push(r.win ? { cell: c, win: true } : { cell: c, win: false, next: at(r.key) });
  }
  return out;
}

/** Board picture. The mark due to vanish next is shown in lowercase. */
function render(p: Pos): string[] {
  const g = Array<string>(9).fill('.');
  p.xs.forEach((c, i) => (g[c] = p.xs.length === 3 && i === 0 ? 'x' : 'X'));
  p.os.forEach((c, i) => (g[c] = p.os.length === 3 && i === 0 ? 'o' : 'O'));
  return [0, 3, 6].map((r) => g.slice(r, r + 3).join(' '));
}

/**
 * Optimal line: the winner plays the fastest win, the loser resists longest.
 * In a drawn position both sides simply stay inside the draw set.
 */
function principalVariation(start: Pos, maxPly = 24) {
  const line: Array<{ cell: number; before: Pos; win: boolean }> = [];
  let p = start;
  for (let i = 0; i < maxPly; i++) {
    const lab = labelOf(p);
    const opts = moves(p);
    let pick: (typeof opts)[number] | undefined;

    if (lab === Label.WIN) {
      pick = opts.find((m) => m.win);
      if (!pick) {
        let best = Infinity;
        for (const m of opts) {
          if (m.next && labelOf(m.next) === Label.LOSS && distOf(m.next) < best) {
            best = distOf(m.next);
            pick = m;
          }
        }
      }
    } else if (lab === Label.LOSS) {
      let best = -1;
      for (const m of opts) {
        if (m.next && distOf(m.next) > best) {
          best = distOf(m.next);
          pick = m;
        }
      }
    } else {
      pick = opts.find((m) => m.next && labelOf(m.next) === Label.DRAW);
    }

    if (!pick) break;
    line.push({ cell: pick.cell, before: p, win: pick.win });
    if (pick.win) break;
    p = pick.next!;
  }
  return line;
}

function printLine(title: string, start: Pos) {
  console.log('');
  console.log('-'.repeat(72));
  console.log(title);
  console.log('-'.repeat(72));
  const pv = principalVariation(start);
  const notation = pv
    .map((s, i) => `${i + 1}.${s.before.turn === 0 ? 'X' : 'O'}${NAMES[s.cell]}${s.win ? '#' : ''}`)
    .join('  ');
  console.log(notation);
  console.log('');

  // Board strip, six positions per row.
  const frames: string[][] = [];
  const labels: string[] = [];
  let p = start;
  frames.push(render(p));
  labels.push('start');
  for (const s of pv) {
    const r = playMove(s.before.xs, s.before.os, s.before.turn, s.cell);
    if (r.win) {
      const own = [...(s.before.turn === 0 ? s.before.xs : s.before.os), s.cell];
      if (own.length > 3) own.shift();
      const q: Pos =
        s.before.turn === 0
          ? { xs: own, os: s.before.os, turn: 1 }
          : { xs: s.before.xs, os: own, turn: 0 };
      frames.push(render(q));
      labels.push(`${NAMES[s.cell]} WIN`);
      break;
    }
    p = at(r.key);
    frames.push(render(p));
    labels.push(NAMES[s.cell]);
  }

  for (let i = 0; i < frames.length; i += 6) {
    const chunk = frames.slice(i, i + 6);
    const lab = labels.slice(i, i + 6);
    console.log('  ' + lab.map((l) => l.padEnd(9)).join(' '));
    for (let row = 0; row < 3; row++) {
      console.log('  ' + chunk.map((f) => f[row].padEnd(9)).join(' '));
    }
    console.log('');
  }
}

console.log('='.repeat(72));
console.log('PRINCIPAL VARIATIONS');
console.log('='.repeat(72));
console.log('Lowercase = the mark that vanishes on its owner\'s next move.');

const empty: Pos = { xs: [], os: [], turn: 0 };

// 1. The winning edge opening, against O's toughest defence.
printLine("X's forced win: 1.Xa2 (edge) — O defends as long as possible", empty);

// 2. The two drawing openings.
const afterCenter = at(playMove([], [], 0, 4).key);
printLine('The drawing line after 1.Xb2 (center) — O must answer in a corner', afterCenter);

const afterCorner = at(playMove([], [], 0, 0).key);
printLine('The drawing line after 1.Xa1 (corner) — O must answer in the center', afterCorner);

// --- how narrow is correct play? -----------------------------------------

console.log('='.repeat(72));
console.log('HOW FORGIVING IS EACH POSITION?');
console.log('='.repeat(72));
console.log('For every reachable position, how many legal moves preserve the');
console.log('result the mover already has (i.e. are not outright blunders):');
console.log('');

const buckets = new Map<string, { n: number; safe: number; total: number; only: number }>();
for (let id = 0; id < tb.count; id++) {
  const p = at(tb.keys[id]);
  const lab = tb.label[id];
  const opts = moves(p);
  let safe = 0;
  for (const m of opts) {
    if (m.win) {
      safe++;
      continue;
    }
    const cl = tb.label[idOf(m.next!)];
    // Mover keeps a win only by moving to a LOSS; keeps a draw by DRAW or LOSS.
    if (lab === Label.WIN) {
      if (cl === Label.LOSS) safe++;
    } else if (lab === Label.DRAW) {
      if (cl !== Label.WIN) safe++;
    } else {
      safe++; // already lost: nothing to preserve
    }
  }
  const phase = `${p.xs.length}+${p.os.length} marks`;
  const key = lab === Label.WIN ? 'winning' : lab === Label.DRAW ? 'drawn' : 'lost';
  const k = `${key}|${phase}`;
  const b = buckets.get(k) ?? { n: 0, safe: 0, total: 0, only: 0 };
  b.n++;
  b.safe += safe;
  b.total += opts.length;
  if (safe === 1) b.only++;
  buckets.set(k, b);
}

console.log('state            positions   avg legal   avg safe   only-one-move');
for (const kind of ['winning', 'drawn']) {
  const rows = [...buckets.entries()].filter(([k]) => k.startsWith(kind + '|'));
  rows.sort();
  for (const [k, b] of rows) {
    const phase = k.split('|')[1];
    console.log(
      `${(kind + ' ' + phase).padEnd(20)}${String(b.n).padStart(8)}` +
        `${(b.total / b.n).toFixed(2).padStart(12)}` +
        `${(b.safe / b.n).toFixed(2).padStart(11)}` +
        `${((100 * b.only) / b.n).toFixed(1).padStart(13)}%`
    );
  }
  console.log('');
}

// --- what makes the draw set special? ------------------------------------

console.log('='.repeat(72));
console.log('STRUCTURE OF THE DRAW REGION (13,193 positions)');
console.log('='.repeat(72));
let centerOccupied = 0;
let drawTotal = 0;
const ownerOfCenter = { X: 0, O: 0, none: 0 };
for (let id = 0; id < tb.count; id++) {
  if (tb.label[id] !== Label.DRAW) continue;
  const p = at(tb.keys[id]);
  drawTotal++;
  if (p.xs.includes(4)) {
    centerOccupied++;
    ownerOfCenter.X++;
  } else if (p.os.includes(4)) {
    centerOccupied++;
    ownerOfCenter.O++;
  } else ownerOfCenter.none++;
}
console.log(`center occupied in ${((100 * centerOccupied) / drawTotal).toFixed(1)}% of drawn positions`);
console.log(`  by X: ${ownerOfCenter.X}   by O: ${ownerOfCenter.O}   empty: ${ownerOfCenter.none}`);
