/**
 * Lockstep differential test: the plain-JS port (plethora/src/engine.mjs,
 * plethora/src/ai.mjs) against the TypeScript original (src/utils/quantum.ts,
 * src/utils/quantumAi.ts).
 * Run with: npx --yes tsx plethora/test/differential.test.ts
 *
 * Engine: 2000 random full games from a fixed-seed PRNG (mulberry32). Every
 * decision (a random legal spooky pair, a random collapse option, the forced
 * fill) is applied to both engines in lockstep, and after every step the two
 * snapshots must be identical: JSON.stringify (which also pins key insertion
 * order) plus a stricter canonical form that tells null from undefined, holes
 * and prototypes apart. entanglementHighlight and marksInCell for every cell,
 * isCollapsed, forcedCell and availableCells must agree too. At every step a
 * set of probe moves (same-cell pairs, out-of-range and non-cell indices,
 * collapsed cells, wrong-phase calls, both collapse options and nonexistent
 * ones, forced fills of every cell, and every ordered placement pair) must be
 * rejected with the same reference by both engines or by neither, throw in
 * both or neither, and give identical results when accepted.
 *
 * AI: Date.now is replaced by a deterministic clock and Math.random by a
 * seeded generator, so both AIs are deterministic and must return the same
 * decision with the same number of clock reads and random draws on positions
 * sampled from those games: easy and medium on the same random stream; custom
 * depths 1-3 on a frozen clock (full-depth search, no time cutoff); hard and
 * custom 6/9 on a clock that ticks once per read (the time budget then cuts
 * the search at the same node in both); and the port's `overrides` against
 * the original's custom tier. Equal clock-read counts mean the same number of
 * search nodes were expanded.
 *
 * Any divergence prints the replayable move sequence and exits 1.
 */
import * as TS from '../../src/utils/quantum';
import { getQuantumMove as tsGetQuantumMove } from '../../src/utils/quantumAi';
import { BOARD_CELLS as TS_BOARD_CELLS, WIN_LINES as TS_WIN_LINES } from '../../src/utils/constants';
import { otherPlayer as tsOtherPlayer } from '../../src/utils/engine';
import * as JS from '../src/engine.mjs';
import * as JSAI from '../src/ai.mjs';

const SEED = 20261102;
const GAMES = 2000;
/** The port fixes the original's transposition table; this flag reproduces the original for lockstep comparison. */
const LEGACY = { legacyTt: true };

type Snap = TS.QuantumSnapshot;
type Decision = ['place', number, number] | ['collapse', 0 | 1] | ['forced', number];

const tsEngine: any = TS;
const jsEngine: any = JS;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Structural fingerprint stricter than JSON: keeps undefined, -0, NaN, holes, prototypes, key order. */
function canon(value: unknown): string {
  if (value === null) return 'null';
  if (value === undefined) return 'undefined';
  if (typeof value === 'number') return Object.is(value, -0) ? '-0' : String(value);
  if (typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    const parts: string[] = [];
    for (let i = 0; i < value.length; i += 1) parts.push(i in value ? canon(value[i]) : '<hole>');
    return `[${parts.join(',')}]`;
  }
  if (typeof value === 'object') {
    const proto = Object.getPrototypeOf(value);
    const tag = proto === Object.prototype ? '' : proto === null ? '<null-proto>' : '<exotic>';
    const record = value as Record<string, unknown>;
    return `${tag}{${Object.keys(record).map((k) => `${JSON.stringify(k)}:${canon(record[k])}`).join(',')}}`;
  }
  return `<${typeof value}>`;
}

let currentGame = -1;

function describe(log: Decision[]): string {
  return log
    .map((d) => (d[0] === 'place' ? `P${d[1]}-${d[2]}` : d[0] === 'collapse' ? `C${d[1]}` : `F${d[1]}`))
    .join(' ');
}

function fail(what: string, log: Decision[], detail?: string): never {
  console.error(`\n✗ DIVERGENCE: ${what}`);
  console.error(`  seed ${SEED}, game ${currentGame}, after ${log.length} decision(s)`);
  console.error(`  moves:  ${describe(log) || '(initial position)'}`);
  console.error(`  replay: ${JSON.stringify(log)}`);
  if (detail) console.error(detail);
  process.exit(1);
}

function same(what: string, tsValue: unknown, jsValue: unknown, log: Decision[]): void {
  const a = JSON.stringify(tsValue);
  const b = JSON.stringify(jsValue);
  if (a !== b || canon(tsValue) !== canon(jsValue)) {
    fail(what, log, `  ts: ${a}\n  js: ${b}\n  ts canon: ${canon(tsValue)}\n  js canon: ${canon(jsValue)}`);
  }
}

// ---------------------------------------------------------------------------
console.log('Constants');
// ---------------------------------------------------------------------------
same('WIN_LINES', TS_WIN_LINES, JS.WIN_LINES, []);
same('BOARD_CELLS', TS_BOARD_CELLS, JS.BOARD_CELLS, []);
same('otherPlayer', [tsOtherPlayer('X'), tsOtherPlayer('O')], [JS.otherPlayer('X'), JS.otherPlayer('O')], []);
same('initial snapshot', TS.createInitialQuantumSnapshot(), JS.createInitialQuantumSnapshot(), []);
console.log('  ✓ WIN_LINES, BOARD_CELLS, otherPlayer and the initial snapshot agree');

// ---------------------------------------------------------------------------
console.log('\nEngine lockstep');
// ---------------------------------------------------------------------------

const stats = {
  steps: 0,
  places: 0,
  collapses: 0,
  forced: 0,
  cycleCloses: 0,
  probes: 0,
  probesRejectedByBoth: 0,
  probesAcceptedByBoth: 0,
  probesThrewInBoth: 0,
  outcomes: { X: 0, O: 0, draw: 0, tieBreak: 0 } as Record<string, number>,
};

interface Position {
  ts: Snap;
  js: any;
  log: Decision[];
  game: number;
}
const pool: Position[] = [];
const finished: Position[] = [];

function compareState(ts: Snap, js: any, log: Decision[]): void {
  const a = JSON.stringify(ts);
  const b = JSON.stringify(js);
  if (a !== b) fail('snapshots differ (JSON.stringify)', log, `  ts: ${a}\n  js: ${b}`);
  same('snapshot (canonical form)', ts, js, log);
  same('availableCells', TS.availableCells(ts), JS.availableCells(js), log);
  same('forcedCell', TS.forcedCell(ts), JS.forcedCell(js), log);
  for (let cell = 0; cell < 9; cell += 1) {
    same(`entanglementHighlight(${cell})`, TS.entanglementHighlight(ts, cell), JS.entanglementHighlight(js, cell), log);
    same(`marksInCell(${cell})`, TS.marksInCell(ts, cell), JS.marksInCell(js, cell), log);
    same(`isCollapsed(${cell})`, TS.isCollapsed(ts, cell), JS.isCollapsed(js, cell), log);
  }
}

type ProbeRun = (engine: any, s: any) => any;

function runProbe(label: string, run: ProbeRun, ts: Snap, js: any, log: Decision[]): void {
  stats.probes += 1;
  let tsOut: any;
  let jsOut: any;
  let tsThrew: string | null = null;
  let jsThrew: string | null = null;
  try {
    tsOut = run(tsEngine, ts);
  } catch (err) {
    tsThrew = (err as Error).constructor.name;
  }
  try {
    jsOut = run(jsEngine, js);
  } catch (err) {
    jsThrew = (err as Error).constructor.name;
  }
  if (tsThrew !== jsThrew) fail(`probe ${label}: ts threw ${tsThrew}, js threw ${jsThrew}`, log);
  if (tsThrew) {
    stats.probesThrewInBoth += 1;
    return;
  }
  const tsRejected = tsOut === ts;
  const jsRejected = jsOut === js;
  if (tsRejected !== jsRejected) {
    fail(`probe ${label}: ts ${tsRejected ? 'rejected' : 'accepted'} it, js ${jsRejected ? 'rejected' : 'accepted'} it`, log);
  }
  if (tsRejected) {
    stats.probesRejectedByBoth += 1;
    return;
  }
  stats.probesAcceptedByBoth += 1;
  same(`probe ${label} result`, tsOut, jsOut, log);
}

function probeAll(ts: Snap, js: any, log: Decision[]): void {
  // Same-cell pairs, and forced fills of every cell (legal only for the forced one).
  for (let c = 0; c < 9; c += 1) {
    runProbe(`placeSpooky(${c},${c})`, (E, s) => E.placeSpooky(s, c, c), ts, js, log);
    runProbe(`placeForced(${c})`, (E, s) => E.placeForced(s, c), ts, js, log);
  }
  // Out-of-range and non-cell indices.
  const odd: Array<[number, number]> = [
    [-1, 4], [4, -1], [4, 9], [9, 4], [0, 10], [-3, 12], [NaN, 3], [3, NaN], [1.5, 2], [2, 2.5],
  ];
  for (const [a, b] of odd) runProbe(`placeSpooky(${a},${b})`, (E, s) => E.placeSpooky(s, a, b), ts, js, log);
  runProbe('placeForced(-1)', (E, s) => E.placeForced(s, -1), ts, js, log);
  runProbe('placeForced(9)', (E, s) => E.placeForced(s, 9), ts, js, log);
  // Collapsed cells paired with an open cell (both orders) and with each other.
  const open = TS.availableCells(ts);
  const closed = [0, 1, 2, 3, 4, 5, 6, 7, 8].filter((c) => !open.includes(c));
  for (const c of closed) {
    if (open.length > 0) {
      runProbe(`placeSpooky(${c},${open[0]})`, (E, s) => E.placeSpooky(s, c, open[0]), ts, js, log);
      runProbe(`placeSpooky(${open[0]},${c})`, (E, s) => E.placeSpooky(s, open[0], c), ts, js, log);
    }
    const other = closed.find((d) => d !== c);
    if (other !== undefined) runProbe(`placeSpooky(${c},${other})`, (E, s) => E.placeSpooky(s, c, other), ts, js, log);
  }
  // Both collapse options (legal only while measuring), and option indices
  // that do not exist (the original throws while measuring; both must agree).
  for (const option of [0, 1, 2, -1]) {
    runProbe(`resolveCollapse(${option})`, (E, s) => E.resolveCollapse(s, option), ts, js, log);
  }
  // Every ordered placement pair (legal ones while placing; all rejected otherwise).
  for (let a = 0; a < 9; a += 1) {
    for (let b = 0; b < 9; b += 1) {
      if (a !== b) runProbe(`placeSpooky(${a},${b})`, (E, s) => E.placeSpooky(s, a, b), ts, js, log);
    }
  }
}

const rng = mulberry32(SEED);
const engineStart = performance.now();
for (let g = 0; g < GAMES; g += 1) {
  currentGame = g;
  let ts = TS.createInitialQuantumSnapshot();
  let js: any = JS.createInitialQuantumSnapshot();
  const log: Decision[] = [];
  compareState(ts, js, log);
  let guard = 0;

  while (!ts.winner && ts.phase !== 'gameover') {
    guard += 1;
    if (guard > 80) fail('the game did not finish within 80 decisions', log);
    pool.push({ ts, js, log: [...log], game: g });
    probeAll(ts, js, log);

    let decision: Decision;
    if (ts.phase === 'choosingCollapse' && ts.pending) {
      decision = ['collapse', rng() < 0.5 ? 0 : 1];
    } else {
      const open = TS.availableCells(ts);
      if (open.length === 1) {
        decision = ['forced', open[0]];
      } else {
        const i = Math.floor(rng() * open.length);
        let j = Math.floor(rng() * open.length);
        if (j === i) j = (j + 1) % open.length;
        decision = ['place', open[i], open[j]];
      }
    }

    let tsNext: Snap;
    let jsNext: any;
    if (decision[0] === 'collapse') {
      tsNext = TS.resolveCollapse(ts, decision[1]);
      jsNext = JS.resolveCollapse(js, decision[1]);
      stats.collapses += 1;
    } else if (decision[0] === 'forced') {
      tsNext = TS.placeForced(ts, decision[1]);
      jsNext = JS.placeForced(js, decision[1]);
      stats.forced += 1;
    } else {
      tsNext = TS.placeSpooky(ts, decision[1], decision[2]);
      jsNext = JS.placeSpooky(js, decision[1], decision[2]);
      stats.places += 1;
      if (tsNext.phase === 'choosingCollapse') stats.cycleCloses += 1;
    }
    log.push(decision);
    if (tsNext === ts || jsNext === js) {
      fail(`a legal decision was rejected (ts ${tsNext === ts ? 'rejected' : 'accepted'}, js ${jsNext === js ? 'rejected' : 'accepted'})`, log);
    }
    ts = tsNext;
    js = jsNext;
    stats.steps += 1;
    compareState(ts, js, log);
  }

  // Game over: every move must now be refused by both.
  probeAll(ts, js, log);
  finished.push({ ts, js, log: [...log], game: g });
  stats.outcomes[ts.winner as string] += 1;
  if (ts.winByTieBreak) stats.outcomes.tieBreak += 1;
}
const engineMs = performance.now() - engineStart;
console.log(
  `  ✓ ${GAMES} games, ${stats.steps} decisions in lockstep (${stats.places} placements, ` +
    `${stats.cycleCloses} closing a cycle; ${stats.collapses} collapses; ${stats.forced} forced fills); ` +
    `snapshots, highlights, marksInCell, isCollapsed, forcedCell and availableCells identical after every step`
);
console.log(
  `  ✓ outcomes: X ${stats.outcomes.X}, O ${stats.outcomes.O}, draw ${stats.outcomes.draw}; ` +
    `${stats.outcomes.tieBreak} decided by the subscript tie-break`
);
console.log(
  `  ✓ ${stats.probes} probe moves agree: ${stats.probesRejectedByBoth} rejected (same reference) by both, ` +
    `${stats.probesAcceptedByBoth} accepted by both with identical results, ${stats.probesThrewInBoth} threw in both ` +
    `(${(engineMs / 1000).toFixed(1)} s)`
);

// ---------------------------------------------------------------------------
console.log('\nAI lockstep (deterministic clock and randomness)');
// ---------------------------------------------------------------------------

type Clock = 'frozen' | 'ticking';
interface Controlled {
  result: unknown;
  clockReads: number;
  randomDraws: number;
}

/** Runs fn with Date.now frozen at 0 or ticking 1 per read, and Math.random seeded. */
function controlled(fn: () => unknown, clock: Clock, seed: number): Controlled {
  const realNow = Date.now;
  const realRandom = Math.random;
  const random = mulberry32(seed);
  let clockReads = 0;
  let randomDraws = 0;
  Date.now = () => {
    clockReads += 1;
    return clock === 'frozen' ? 0 : clockReads;
  };
  Math.random = () => {
    randomDraws += 1;
    return random();
  };
  try {
    return { result: fn(), clockReads, randomDraws };
  } finally {
    Date.now = realNow;
    Math.random = realRandom;
  }
}

/** Evenly spaced picks from a list. */
function spread<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items;
  const out: T[] = [];
  for (let k = 0; k < n; k += 1) out.push(items[Math.floor((k * items.length) / n)]);
  return out;
}

/** A stratified sample: measurements, forced fills, opening-phase and later placements. */
function sample(n: number): Position[] {
  const measuring = pool.filter((p) => p.ts.phase === 'choosingCollapse');
  const forcedFill = pool.filter((p) => p.ts.phase === 'placing' && TS.availableCells(p.ts).length === 1);
  const quiet = pool.filter((p) => p.ts.phase === 'placing' && TS.availableCells(p.ts).length === 9);
  const later = pool.filter((p) => p.ts.phase === 'placing' && TS.availableCells(p.ts).length > 1 && TS.availableCells(p.ts).length < 9);
  const quarter = Math.ceil(n / 4);
  return [
    ...spread(measuring, quarter),
    ...spread(forcedFill, Math.ceil(quarter / 2)),
    ...spread(quiet, quarter),
    ...spread(later, n - 2 * quarter - Math.ceil(quarter / 2)),
  ];
}

const customBudget = (depth: number) => Math.max(200, Math.min(depth * 100, 900));

interface Mode {
  name: string;
  clock: Clock;
  /** The budget in ms (= clock ticks) the search runs under, when the clock ticks. */
  budget?: number;
  positions: Position[];
  seeds: number[];
  ts: (s: Snap) => unknown;
  js: (s: any) => unknown;
}

const modes: Mode[] = [
  {
    name: 'easy (seeded random)',
    clock: 'ticking',
    positions: sample(1200),
    seeds: [1, 2, 3],
    ts: (s) => tsGetQuantumMove(s, 'easy', 3),
    js: (s) => JSAI.getQuantumMove(s, 'easy', 3, LEGACY),
  },
  {
    name: 'medium (seeded random, ticking clock)',
    clock: 'ticking',
    budget: 90,
    positions: sample(500),
    seeds: [1, 2],
    ts: (s) => tsGetQuantumMove(s, 'medium', 3),
    js: (s) => JSAI.getQuantumMove(s, 'medium', 3, LEGACY),
  },
  ...[1, 2].map((depth) => ({
    name: `custom ${depth} (frozen clock: full-depth search)`,
    clock: 'frozen' as Clock,
    positions: sample(800),
    seeds: [1],
    ts: (s: Snap) => tsGetQuantumMove(s, 'custom', depth),
    js: (s: any) => JSAI.getQuantumMove(s, 'custom', depth, LEGACY),
  })),
  {
    name: 'custom 3 (frozen clock: full-depth search)',
    clock: 'frozen',
    positions: sample(160),
    seeds: [1],
    ts: (s) => tsGetQuantumMove(s, 'custom', 3),
    js: (s) => JSAI.getQuantumMove(s, 'custom', 3, LEGACY),
  },
  {
    name: 'hard (ticking clock: budget cuts the search)',
    clock: 'ticking',
    budget: 350,
    positions: sample(500),
    seeds: [1],
    ts: (s) => tsGetQuantumMove(s, 'hard', 3),
    js: (s) => JSAI.getQuantumMove(s, 'hard', 3, LEGACY),
  },
  ...[6, 9].map((depth) => ({
    name: `custom ${depth} (ticking clock)`,
    clock: 'ticking' as Clock,
    budget: customBudget(depth),
    positions: sample(120),
    seeds: [1],
    ts: (s: Snap) => tsGetQuantumMove(s, 'custom', depth),
    js: (s: any) => JSAI.getQuantumMove(s, 'custom', depth, LEGACY),
  })),
  ...[1, 2, 3, 4].map((depth) => ({
    name: `js hard + overrides { maxDepth: ${depth}, budgetMs: ${customBudget(depth)} } vs ts custom ${depth} (ticking clock)`,
    clock: 'ticking' as Clock,
    budget: customBudget(depth),
    positions: sample(150),
    seeds: [1],
    ts: (s: Snap) => tsGetQuantumMove(s, 'custom', depth),
    js: (s: any) => JSAI.getQuantumMove(s, 'hard', 3, { maxDepth: depth, budgetMs: customBudget(depth), legacyTt: true }),
  })),
  {
    name: 'game over: no move offered (all difficulties)',
    clock: 'ticking',
    positions: spread(finished, 200),
    seeds: [1],
    ts: (s) => ['easy', 'medium', 'hard', 'custom'].map((d) => tsGetQuantumMove(s, d as 'easy', 3)),
    js: (s) => ['easy', 'medium', 'hard', 'custom'].map((d) => JSAI.getQuantumMove(s, d, 3, LEGACY)),
  },
];

let aiComparisons = 0;
for (const mode of modes) {
  const start = performance.now();
  const kinds: Record<string, number> = {};
  let reads = 0;
  let stoppedByBudget = 0;
  mode.positions.forEach((position, index) => {
    currentGame = position.game;
    for (const baseSeed of mode.seeds) {
      // A different stream per position, so the first draw (medium's coin
      // flip, easy's pick) covers the whole [0, 1) range across positions.
      const seed = (baseSeed * 1000003 + index) >>> 0;
      const a = controlled(() => mode.ts(position.ts), mode.clock, seed);
      const b = controlled(() => mode.js(position.js), mode.clock, seed);
      aiComparisons += 1;
      reads += a.clockReads;
      // The deadline is the first read (1) plus the budget, so a search that
      // reads the clock past it was cut short (or stopped deepening) by time.
      if (mode.budget !== undefined && a.clockReads >= mode.budget + 2) stoppedByBudget += 1;
      const tsJson = JSON.stringify(a.result);
      const jsJson = JSON.stringify(b.result);
      if (tsJson !== jsJson || a.clockReads !== b.clockReads || a.randomDraws !== b.randomDraws) {
        fail(
          `AI ${mode.name}, random seed ${seed}`,
          position.log,
          `  ts: ${tsJson} (clock reads ${a.clockReads}, random draws ${a.randomDraws})\n` +
            `  js: ${jsJson} (clock reads ${b.clockReads}, random draws ${b.randomDraws})`
        );
      }
      const kind = (a.result as { kind?: string } | null)?.kind ?? (Array.isArray(a.result) ? 'none' : 'null');
      kinds[kind] = (kinds[kind] ?? 0) + 1;
    }
  });
  const mix = Object.entries(kinds).map(([k, v]) => `${k} ${v}`).join(', ');
  const budgetNote = mode.budget === undefined ? '' : `, ${stoppedByBudget} stopped by the time budget`;
  console.log(
    `  ✓ ${mode.name}: ${mode.positions.length * mode.seeds.length} decisions identical ` +
      `(${mix}; ${reads} clock reads each side${budgetNote}; ${((performance.now() - start) / 1000).toFixed(1)} s)`
  );
}

console.log(`\nAll differential checks passed (${stats.steps} engine steps, ${stats.probes} probes, ${aiComparisons} AI decisions).`);
process.exit(0);
