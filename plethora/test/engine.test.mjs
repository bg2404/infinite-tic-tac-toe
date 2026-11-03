/**
 * Sanity tests for the plain-JS Quantum engine and its AI
 * (plethora/src/engine.mjs, plethora/src/ai.mjs).
 * Run with: node plethora/test/engine.test.mjs
 *
 * A port of scripts/quantum.test.ts: every case except the undo/redo
 * actor-run navigation block (timelineNav is not ported), with the same
 * assertions. The entanglement/collapse logic is the subtlest code in the
 * project, so this covers the hand-built cases that are easy to get wrong
 * (parallel-edge 2-cycles, forced tree branches, the simultaneous-line
 * tie-break) and then fuzzes random games against the engine's structural
 * invariants. The last sections cover what the port adds: getQuantumMove
 * overrides, applyAiMove, decisionMaker and the export contract.
 */
import * as engineModule from '../src/engine.mjs';
import * as aiModule from '../src/ai.mjs';
import {
  availableCells,
  createInitialQuantumSnapshot,
  entanglementHighlight,
  forcedCell,
  placeForced,
  placeSpooky,
  resolveCollapse,
} from '../src/engine.mjs';
import { applyAiMove, decisionMaker, getQuantumMove, WIN_SCORE } from '../src/ai.mjs';

let failures = 0;

function expect(name, condition) {
  if (!condition) {
    failures += 1;
    console.error(`  ✗ ${name}`);
  } else {
    console.log(`  ✓ ${name}`);
  }
}

/**
 * Applies an AI decision straight through the engine. Kept separate from the
 * exported applyAiMove (as in the original test) so the legality checks do not
 * depend on the helper under test.
 */
const applyDirect = (s, move) => {
  if (move.kind === 'place') return placeSpooky(s, move.a, move.b);
  if (move.kind === 'forced') return placeForced(s, move.cell);
  return resolveCollapse(s, move.option);
};

// ---------------------------------------------------------------------------
console.log('Placement');
// ---------------------------------------------------------------------------
{
  const start = createInitialQuantumSnapshot();
  const s = placeSpooky(start, 0, 1);
  expect('a spooky mark spans two cells', s.spooky.length === 1);
  expect('subscript is the move number', s.spooky[0].id === 1);
  expect('cells are stored sorted', s.spooky[0].cells.join(',') === '0,1');
  expect('no cell collapses on a plain placement', s.collapsed.every((c) => c === null));
  expect('turn passes to O', s.currentPlayer === 'O');
  expect('still placing', s.phase === 'placing');

  expect('rejects a mark superposed onto one cell', placeSpooky(start, 3, 3) === start);
  expect('rejects out-of-range cells', placeSpooky(start, -1, 4) === start);
  expect('rejects cells off the board', placeSpooky(start, 4, 9) === start);
}

// ---------------------------------------------------------------------------
console.log('\nCollapse: parallel-edge 2-cycle');
// ---------------------------------------------------------------------------
{
  // Two marks on the SAME pair of cells form a 2-cycle. This is the case a
  // naive cycle-finder misses, because both edges join the same nodes.
  let s = placeSpooky(createInitialQuantumSnapshot(), 0, 1); // X1 {0,1}
  s = placeSpooky(s, 0, 1); // O2 {0,1} closes the 2-cycle

  expect('second mark on the same pair triggers measurement', s.phase === 'choosingCollapse');
  expect('the non-closer chooses', s.pending?.chooser === 'X');
  expect('exactly two outcomes are offered', s.pending?.options.length === 2);

  const [a, b] = s.pending.options;
  expect('outcome A seats both cells', !!a.assignment[0] && !!a.assignment[1]);
  expect('outcome B seats both cells', !!b.assignment[0] && !!b.assignment[1]);
  expect('the two outcomes genuinely differ', a.assignment[0].player !== b.assignment[0].player);

  const done = resolveCollapse(s, 0);
  expect('both cells become classical', done.collapsed[0] !== null && done.collapsed[1] !== null);
  expect('measured spooky marks are cleared', done.spooky.length === 0);
  expect('play resumes when nobody won', done.phase === 'placing');
  expect('the chooser also moves next', done.currentPlayer === 'X');
}

// ---------------------------------------------------------------------------
console.log('\nCollapse: 3-cycle and forced tree branches');
// ---------------------------------------------------------------------------
{
  let s = placeSpooky(createInitialQuantumSnapshot(), 0, 1); // X1 {0,1}
  s = placeSpooky(s, 1, 2); // O2 {1,2}
  expect('a path does not collapse', s.phase === 'placing');
  s = placeSpooky(s, 0, 2); // X3 {0,2} closes the triangle 0-1-2

  expect('closing a triangle triggers measurement', s.phase === 'choosingCollapse');
  expect(
    'the whole cyclic component is measured',
    [...s.pending.componentCells].sort((x, y) => x - y).join(',') === '0,1,2'
  );
  const resolved = resolveCollapse(s, 0);
  expect('every cycle cell collapses', [0, 1, 2].every((c) => resolved.collapsed[c] !== null));
}
{
  // A branch hanging off the cycle is FORCED: it must resolve the same way in
  // both orientations, since only the loop itself has two consistent readings.
  let s = placeSpooky(createInitialQuantumSnapshot(), 0, 1); // X1 {0,1}
  s = placeSpooky(s, 1, 4); // O2 {1,4}
  s = placeSpooky(s, 4, 3); // X3 {4,3}  <- branch out to cell 3
  s = placeSpooky(s, 0, 4); // O4 {0,4} closes cycle 0-1-4, with 3 hanging off

  expect('cycle formed with a branch attached', s.phase === 'choosingCollapse');
  expect(
    'the hanging cell is part of the measured component',
    [...s.pending.componentCells].sort((x, y) => x - y).join(',') === '0,1,3,4'
  );
  const [a, b] = s.pending.options;
  expect('hanging cell is seated in both outcomes', !!a.assignment[3] && !!b.assignment[3]);
  expect(
    'hanging cell resolves identically either way',
    a.assignment[3].subscript === b.assignment[3].subscript &&
      a.assignment[3].player === b.assignment[3].player
  );
}

// ---------------------------------------------------------------------------
console.log('\nWinning');
// ---------------------------------------------------------------------------
{
  // All three edges of the cycle belong to X, so the top row is X either way.
  let s = placeSpooky(createInitialQuantumSnapshot(), 0, 1); // X1
  s = placeSpooky(s, 3, 4); // O2 (parked away from the action)
  s = placeSpooky(s, 1, 2); // X3
  s = placeSpooky(s, 4, 5); // O4
  s = placeSpooky(s, 0, 2); // X5 closes the X-only cycle 0-1-2

  expect('cycle formed', s.phase === 'choosingCollapse');
  for (const option of [0, 1]) {
    const done = resolveCollapse(s, option);
    expect(`outcome ${option + 1}: X takes the top row`, done.winner === 'X');
    expect(`outcome ${option + 1}: win line reported`, done.winLine?.join(',') === '0,1,2');
    expect(`outcome ${option + 1}: game is over`, done.phase === 'gameover');
    expect(`outcome ${option + 1}: no tie-break subtitle`, done.winByTieBreak === false);
  }
}

// ---------------------------------------------------------------------------
console.log('\nSimultaneous lines: lowest max-subscript wins');
// ---------------------------------------------------------------------------
{
  // Craft a measurement whose outcome completes a line for BOTH players, then
  // check the documented tie-break: rank each line by its HIGHEST subscript,
  // and the line with the lower one formed first and wins.
  const craft = (xSubs, oSubs) => {
    const assignment = {};
    [0, 1, 2].forEach((cell, i) => (assignment[cell] = { player: 'X', subscript: xSubs[i] }));
    [6, 7, 8].forEach((cell, i) => (assignment[cell] = { player: 'O', subscript: oSubs[i] }));
    const spooky = [];
    return {
      ...createInitialQuantumSnapshot(),
      spooky,
      phase: 'choosingCollapse',
      currentPlayer: 'X',
      moveNumber: 6,
      pending: {
        chooser: 'X',
        componentCells: [0, 1, 2, 6, 7, 8],
        cyclicEdgeIds: [],
        options: [{ assignment }, { assignment }],
      },
    };
  };

  const xEarlier = resolveCollapse(craft([1, 2, 3], [4, 5, 6]), 0);
  expect('X wins when its highest subscript is lower', xEarlier.winner === 'X');
  expect('X win line is the top row', xEarlier.winLine?.join(',') === '0,1,2');
  expect('simultaneous lines flag the tie-break', xEarlier.winByTieBreak === true);

  const oEarlier = resolveCollapse(craft([4, 5, 6], [1, 2, 3]), 0);
  expect('O wins when its highest subscript is lower', oEarlier.winner === 'O');
  expect('O win line is the bottom row', oEarlier.winLine?.join(',') === '6,7,8');
  expect('O simultaneous win also flags the tie-break', oEarlier.winByTieBreak === true);

  // Only the maximum matters, not the sum: X's max 4 beats O's max 5.
  const byMaxNotSum = resolveCollapse(craft([1, 2, 4], [3, 3, 5]), 0);
  expect('ranking uses the highest subscript, not the total', byMaxNotSum.winner === 'X');
}

// ---------------------------------------------------------------------------
console.log('\nForced last cell');
// ---------------------------------------------------------------------------
{
  const collapsed = Array(9).fill(null);
  for (let i = 0; i < 8; i += 1) {
    // Deliberately no three-in-a-row among the first eight cells.
    collapsed[i] = { player: i % 2 ? 'O' : 'X', subscript: i + 1 };
  }
  const hand = {
    ...createInitialQuantumSnapshot(),
    collapsed,
    currentPlayer: 'X',
    moveNumber: 8,
  };
  expect('the single open cell is detected', forcedCell(hand) === 8);
  expect('one open cell means no spooky placement', availableCells(hand).length === 1);

  const filled = placeForced(hand, 8);
  expect('the forced cell takes a classical mark', filled.collapsed[8]?.player === 'X');
  expect('a filled board is terminal', filled.winner !== null);
  expect('placing the wrong forced cell is rejected', placeForced(hand, 3) === hand);
}

// ---------------------------------------------------------------------------
console.log('\nInvariants over random games (fuzz)');
// ---------------------------------------------------------------------------
{
  /** A forest satisfies |edges| = |nodes touched| - |components|. */
  function isForest(spooky) {
    const adj = new Map();
    for (const m of spooky) {
      if (!adj.has(m.cells[0])) adj.set(m.cells[0], []);
      if (!adj.has(m.cells[1])) adj.set(m.cells[1], []);
      adj.get(m.cells[0]).push(m.cells[1]);
      adj.get(m.cells[1]).push(m.cells[0]);
    }
    const seen = new Set();
    let components = 0;
    for (const node of adj.keys()) {
      if (seen.has(node)) continue;
      components += 1;
      const stack = [node];
      seen.add(node);
      while (stack.length) {
        const cur = stack.pop();
        for (const next of adj.get(cur) ?? []) {
          if (!seen.has(next)) {
            seen.add(next);
            stack.push(next);
          }
        }
      }
    }
    return spooky.length === adj.size - components;
  }

  const violations = {
    forest: 0,
    overlap: 0,
    duplicateSubscript: 0,
    unseated: 0,
    reverted: 0,
    stuck: 0,
  };

  const GAMES = 400;
  for (let g = 0; g < GAMES; g += 1) {
    let s = createInitialQuantumSnapshot();
    let guard = 0;

    while (!s.winner && s.phase !== 'gameover' && guard < 80) {
      guard += 1;
      const before = s;

      if (s.phase === 'choosingCollapse' && s.pending) {
        const { componentCells, options } = s.pending;
        const pick = Math.random() < 0.5 ? 0 : 1;
        // Every cell in the measured component must be seated by the outcome.
        if (componentCells.some((c) => options[pick].assignment[c] === undefined)) {
          violations.unseated += 1;
        }
        s = resolveCollapse(s, pick);
        // A cell that was already classical must never change.
        for (let i = 0; i < 9; i += 1) {
          const was = before.collapsed[i];
          if (was && s.collapsed[i]?.subscript !== was.subscript) violations.reverted += 1;
        }
      } else {
        const open = availableCells(s);
        if (open.length === 1) {
          s = placeForced(s, open[0]);
        } else {
          const i = Math.floor(Math.random() * open.length);
          let j = Math.floor(Math.random() * open.length);
          if (j === i) j = (j + 1) % open.length;
          s = placeSpooky(s, open[i], open[j]);
        }
      }

      if (s === before) {
        violations.stuck += 1;
        break;
      }

      // At rest the entanglement graph is always a forest: any cycle collapses
      // immediately, so one can never persist between moves.
      if (s.phase === 'placing' && !isForest(s.spooky)) violations.forest += 1;

      // A collapsed cell can never also hold superposed marks.
      for (const m of s.spooky) {
        if (s.collapsed[m.cells[0]] || s.collapsed[m.cells[1]]) violations.overlap += 1;
      }

      // Subscripts identify moves, so they must stay unique.
      const subs = [
        ...s.spooky.map((m) => m.id),
        ...s.collapsed.filter(Boolean).map((c) => c.subscript),
      ];
      if (new Set(subs).size !== subs.length) violations.duplicateSubscript += 1;
    }
  }

  expect(`forest invariant holds (${GAMES} games)`, violations.forest === 0);
  expect('no cell is both collapsed and superposed', violations.overlap === 0);
  expect('subscripts stay unique', violations.duplicateSubscript === 0);
  expect('every measured cell is seated by its outcome', violations.unseated === 0);
  expect('collapsed cells never change', violations.reverted === 0);
  expect('play never deadlocks on a legal move', violations.stuck === 0);
}

// ---------------------------------------------------------------------------
console.log('\nAI');
// ---------------------------------------------------------------------------
{
  const difficulties = ['easy', 'medium', 'hard', 'custom'];

  for (const difficulty of difficulties) {
    let s = createInitialQuantumSnapshot();
    let legal = true;
    let decided = 0;

    for (let i = 0; i < 14 && !s.winner && s.phase !== 'gameover'; i += 1) {
      const move = getQuantumMove(s, difficulty, 3);
      if (!move) break;
      const next = applyDirect(s, move);
      if (next === s) legal = false; // the engine rejected the AI's own move
      if (move.kind === 'collapse' && s.phase !== 'choosingCollapse') legal = false;
      if (move.kind === 'place' && s.phase !== 'placing') legal = false;
      s = next;
      decided += 1;
    }

    expect(`${difficulty}: every decision is legal`, legal);
    expect(`${difficulty}: keeps making progress`, decided > 0);
  }

  expect(
    'no move is offered once the game is over',
    getQuantumMove(
      { ...createInitialQuantumSnapshot(), phase: 'gameover', winner: 'X' },
      'hard',
      3
    ) === null
  );

  // A win available right now must be taken, at every difficulty.
  let s = placeSpooky(createInitialQuantumSnapshot(), 0, 1); // X1
  s = placeSpooky(s, 3, 4); // O2
  s = placeSpooky(s, 1, 2); // X3
  s = placeSpooky(s, 4, 5); // O4
  s = placeSpooky(s, 0, 2); // X5 closes an X-only cycle: either outcome wins for X
  expect('setup reached a measurement', s.phase === 'choosingCollapse');
  for (const difficulty of difficulties) {
    const move = getQuantumMove(s, difficulty, 3);
    const outcome = move ? applyDirect(s, move) : s;
    expect(`${difficulty}: takes an immediately winning measurement`, outcome.winner === 'X');
  }
}

// ---------------------------------------------------------------------------
console.log('\nEntanglement highlight');
// ---------------------------------------------------------------------------
{
  const sorted = (nums) => [...nums].sort((a, b) => a - b).join(',');

  const empty = createInitialQuantumSnapshot();
  expect('an untouched cell highlights nothing', entanglementHighlight(empty, 4).cells.length === 0);

  let s = placeSpooky(empty, 0, 1); // X1 {0,1}
  s = placeSpooky(s, 1, 4); // O2 {1,4}
  s = placeSpooky(s, 6, 7); // X3 {6,7} — a separate component

  const chain = entanglementHighlight(s, 0);
  expect('the whole chain lights up from any of its cells', sorted(chain.cells) === '0,1,4');
  expect('every mark in the component is included', sorted(chain.edgeIds) === '1,2');
  expect(
    'the far end of the chain agrees',
    sorted(entanglementHighlight(s, 4).cells) === sorted(chain.cells)
  );

  const other = entanglementHighlight(s, 6);
  expect('a separate component stays separate', sorted(other.cells) === '6,7');
  expect('and carries only its own mark', sorted(other.edgeIds) === '3');

  expect('a bare cell in a live game still highlights nothing', entanglementHighlight(s, 8).cells.length === 0);

  // Collapse the chain, then check the resulting classical cells go quiet.
  let cyc = placeSpooky(createInitialQuantumSnapshot(), 0, 1);
  cyc = placeSpooky(cyc, 0, 1);
  const done = resolveCollapse(cyc, 0);
  expect('a collapsed cell highlights nothing', entanglementHighlight(done, 0).cells.length === 0);
}

// ===========================================================================
// What the port adds
// ===========================================================================

/** Seeded PRNG (mulberry32) so random choices are reproducible. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Runs `fn` with Date.now replaced by a counting clock that advances 1 ms per
 * call (or stays at 0 when `frozen`), and Math.random by a seeded generator.
 * Returns { result, clockCalls, randomCalls }.
 */
function withControlledTime(fn, { frozen = false, seed = 1 } = {}) {
  const realNow = Date.now;
  const realRandom = Math.random;
  const rng = mulberry32(seed);
  let clockCalls = 0;
  let randomCalls = 0;
  Date.now = () => {
    clockCalls += 1;
    return frozen ? 0 : clockCalls;
  };
  Math.random = () => {
    randomCalls += 1;
    return rng();
  };
  try {
    return { result: fn(), clockCalls, randomCalls };
  } finally {
    Date.now = realNow;
    Math.random = realRandom;
  }
}

/** Plays `moves` seeded random decisions from the opening; returns the position. */
function randomPosition(moves, seed) {
  const rng = mulberry32(seed);
  let s = createInitialQuantumSnapshot();
  for (let k = 0; k < moves && s.phase !== 'gameover'; k += 1) {
    if (s.phase === 'choosingCollapse') {
      s = resolveCollapse(s, rng() < 0.5 ? 0 : 1);
      continue;
    }
    const open = availableCells(s);
    if (open.length === 1) {
      s = placeForced(s, open[0]);
      continue;
    }
    const i = Math.floor(rng() * open.length);
    let j = Math.floor(rng() * open.length);
    if (j === i) j = (j + 1) % open.length;
    s = placeSpooky(s, open[i], open[j]);
  }
  return s;
}

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** The decision a move answers must match the phase it was made in. */
const legalHere = (s, move) =>
  move !== null &&
  applyDirect(s, move) !== s &&
  (move.kind === 'collapse') === (s.phase === 'choosingCollapse');

// Positions covering each kind of decision: an opening placement, a mid-game
// placement, a measurement, and a forced last cell.
const opening = createInitialQuantumSnapshot();
const midgame = randomPosition(4, 11);
let measuring = placeSpooky(createInitialQuantumSnapshot(), 0, 1);
measuring = placeSpooky(measuring, 1, 2);
measuring = placeSpooky(measuring, 0, 2); // closes a triangle: X... O measures
const lastCell = {
  ...createInitialQuantumSnapshot(),
  collapsed: [
    { player: 'X', subscript: 1 }, { player: 'O', subscript: 2 }, { player: 'X', subscript: 3 },
    { player: 'X', subscript: 4 }, { player: 'O', subscript: 5 }, { player: 'O', subscript: 6 },
    { player: 'O', subscript: 7 }, { player: 'X', subscript: 8 }, null,
  ],
  currentPlayer: 'X',
  moveNumber: 8,
};
const positions = [
  ['opening', opening],
  ['mid-game', midgame],
  ['measurement', measuring],
  ['forced last cell', lastCell],
];

// ---------------------------------------------------------------------------
console.log('\nAI overrides');
// ---------------------------------------------------------------------------
{
  expect('fixture: mid-game position is still placing', midgame.phase === 'placing' && !midgame.winner);
  expect('fixture: measurement position is measuring', measuring.phase === 'choosingCollapse');
  expect('fixture: last-cell position has one open cell', forcedCell(lastCell) === 8 && !lastCell.winner);

  // Real clock: a capped search returns a legal move quickly.
  for (const [label, s] of positions) {
    const t0 = performance.now();
    const move = getQuantumMove(s, 'hard', 3, { maxDepth: 2, budgetMs: 30 });
    const ms = performance.now() - t0;
    expect(`${label}: hard with { maxDepth: 2, budgetMs: 30 } makes a legal move`, legalHere(s, move));
    expect(`${label}: ...in under 200 ms wall clock (${ms.toFixed(1)} ms)`, ms < 200);
  }

  // Counting clock (1 ms per Date.now call): the search's work becomes
  // deterministic, so an override's effect is exact rather than timing-bound.
  for (const [label, s] of [['opening', opening], ['mid-game', midgame], ['measurement', measuring]]) {
    // maxDepth replaces the plan's depth: hard (plan depth 6) capped at depth d
    // with custom's budget does exactly the work custom depth d does.
    for (const d of [1, 2]) {
      const viaOverride = withControlledTime(() => getQuantumMove(s, 'hard', 3, { maxDepth: d, budgetMs: 200 }));
      const viaCustom = withControlledTime(() => getQuantumMove(s, 'custom', d));
      expect(
        `${label}: hard + { maxDepth: ${d} } searches exactly like custom depth ${d}`,
        sameJson(viaOverride.result, viaCustom.result) && viaOverride.clockCalls === viaCustom.clockCalls
      );
    }
    // budgetMs replaces the plan's budget: hard's own 350 ms becomes 40 ms.
    const capped = withControlledTime(() => getQuantumMove(s, 'hard', 3, { budgetMs: 40 }));
    const uncapped = withControlledTime(() => getQuantumMove(s, 'hard', 3));
    expect(
      `${label}: { budgetMs: 40 } stops the search within budget (${capped.clockCalls} vs ${uncapped.clockCalls} clock reads)`,
      capped.clockCalls <= 42 && uncapped.clockCalls > 300 && legalHere(s, capped.result)
    );
    // A partial override keeps the other planned value.
    const depthOnly = withControlledTime(() => getQuantumMove(s, 'custom', 2, { budgetMs: undefined, maxDepth: 2 }));
    const plain = withControlledTime(() => getQuantumMove(s, 'custom', 2));
    expect(
      `${label}: unset override keys fall back to the plan`,
      sameJson(depthOnly.result, plain.result) && depthOnly.clockCalls === plain.clockCalls
    );
  }

  // Easy never searches: overrides change neither its random choice nor its
  // randomness use, and it never reads the clock.
  for (const [label, s] of positions) {
    for (const seed of [1, 2, 3, 4, 5]) {
      const withOverrides = withControlledTime(() => getQuantumMove(s, 'easy', 3, { maxDepth: 6, budgetMs: 1000 }), { seed });
      const without = withControlledTime(() => getQuantumMove(s, 'easy', 3), { seed });
      if (
        !sameJson(withOverrides.result, without.result) ||
        withOverrides.randomCalls !== without.randomCalls ||
        withOverrides.clockCalls !== 0
      ) {
        expect(`${label}: easy ignores overrides (seed ${seed})`, false);
      }
    }
  }
  expect('easy ignores overrides (4 positions x 5 seeds)', true);

  // Medium's random half draws the same randomness with or without overrides.
  let mediumSame = true;
  for (let seed = 1; seed <= 40; seed += 1) {
    const a = withControlledTime(() => getQuantumMove(midgame, 'medium', 3, { maxDepth: 3, budgetMs: 90 }), { seed });
    const b = withControlledTime(() => getQuantumMove(midgame, 'medium', 3), { seed });
    if (!sameJson(a.result, b.result) || a.randomCalls !== b.randomCalls) mediumSame = false;
  }
  expect('medium with its own plan as overrides behaves exactly as without (40 seeds)', mediumSame);
}

// ---------------------------------------------------------------------------
console.log('\napplyAiMove and decisionMaker');
// ---------------------------------------------------------------------------
{
  // Each move kind lands exactly where the engine call it names lands.
  const place = { kind: 'place', a: 2, b: 6 };
  expect('place → placeSpooky', sameJson(applyAiMove(opening, place), placeSpooky(opening, 2, 6)));
  expect('place: a legal placement is applied', applyAiMove(opening, place) !== opening);
  const placeReversed = { kind: 'place', a: 6, b: 2 };
  expect('place: argument order does not matter', sameJson(applyAiMove(opening, placeReversed), placeSpooky(opening, 2, 6)));

  const forced = { kind: 'forced', cell: 8 };
  expect('forced → placeForced', sameJson(applyAiMove(lastCell, forced), placeForced(lastCell, 8)));
  expect('forced: the last cell is filled', applyAiMove(lastCell, forced).collapsed[8]?.player === 'X');

  for (const option of [0, 1]) {
    const collapse = { kind: 'collapse', option };
    expect(
      `collapse ${option} → resolveCollapse`,
      sameJson(applyAiMove(measuring, collapse), resolveCollapse(measuring, option))
    );
  }
  expect(
    'the two collapse options give different boards',
    !sameJson(applyAiMove(measuring, { kind: 'collapse', option: 0 }), applyAiMove(measuring, { kind: 'collapse', option: 1 }))
  );

  // AI moves round-trip: every decision the AI returns applies exactly as the
  // direct engine call would, across whole games at every difficulty. Seeded
  // randomness and a counting clock keep the games reproducible, and the
  // measurement and last-cell fixtures pin the kinds a short game may skip.
  const roundTrip = withControlledTime(
    () => {
      let decisions = 0;
      let ok = true;
      const kinds = new Set();
      const check = (s, difficulty) => {
        const move = getQuantumMove(s, difficulty, 3, { maxDepth: 2, budgetMs: 25 });
        const viaHelper = applyAiMove(s, move);
        if (viaHelper === s || !sameJson(viaHelper, applyDirect(s, move))) ok = false;
        kinds.add(move.kind);
        decisions += 1;
        return viaHelper;
      };
      for (const difficulty of ['easy', 'medium', 'hard']) {
        check(measuring, difficulty);
        check(lastCell, difficulty);
        for (let game = 0; game < 4; game += 1) {
          let s = randomPosition(game * 2, 100 + game);
          while (s.phase !== 'gameover') s = check(s, difficulty);
        }
      }
      return { decisions, ok, kinds };
    },
    { seed: 2026 }
  ).result;
  expect(`AI moves round-trip through applyAiMove (${roundTrip.decisions} decisions)`, roundTrip.ok);
  expect(
    'the round-trip covered all three move kinds',
    ['place', 'forced', 'collapse'].every((k) => roundTrip.kinds.has(k))
  );

  // Illegal moves return the same reference, like the engine's own moves.
  expect('a placement onto one cell is rejected', applyAiMove(opening, { kind: 'place', a: 4, b: 4 }) === opening);
  expect('a collapse while placing is rejected', applyAiMove(opening, { kind: 'collapse', option: 0 }) === opening);
  expect('a placement while measuring is rejected', applyAiMove(measuring, { kind: 'place', a: 5, b: 6 }) === measuring);
  expect('a collapse option other than 0 or 1 is rejected', applyAiMove(measuring, { kind: 'collapse', option: 2 }) === measuring);
  expect('a forced fill of the wrong cell is rejected', applyAiMove(lastCell, { kind: 'forced', cell: 3 }) === lastCell);
  expect('a null move is rejected', applyAiMove(opening, null) === opening);
  expect('an unknown move kind is rejected', applyAiMove(opening, { kind: 'pass' }) === opening);

  expect('decisionMaker while placing is the mover', decisionMaker(midgame) === midgame.currentPlayer);
  expect('decisionMaker while measuring is the chooser', decisionMaker(measuring) === measuring.pending.chooser);
  expect('the chooser is the player who did not close the cycle', decisionMaker(measuring) === 'O');
  expect('WIN_SCORE is the original 10000', WIN_SCORE === 10000);
}

// ---------------------------------------------------------------------------
console.log('\nExport contract');
// ---------------------------------------------------------------------------
{
  const engineExports = [
    'BOARD_CELLS', 'WIN_LINES', 'availableCells', 'createInitialQuantumSnapshot',
    'entanglementHighlight', 'forcedCell', 'isCollapsed', 'marksInCell', 'otherPlayer',
    'placeForced', 'placeSpooky', 'resolveCollapse',
  ];
  const aiExports = ['WIN_SCORE', 'applyAiMove', 'decisionMaker', 'getQuantumMove'];
  expect('engine.mjs exports exactly the contract', sameJson(Object.keys(engineModule).sort(), engineExports.sort()));
  expect('ai.mjs exports exactly the contract', sameJson(Object.keys(aiModule).sort(), aiExports.sort()));
  expect(
    'ai.mjs redefines nothing engine.mjs exports',
    Object.keys(aiModule).every((name) => !engineExports.includes(name))
  );
  const fresh = createInitialQuantumSnapshot();
  expect(
    'snapshot keys keep the original order',
    Object.keys(fresh).join(',') ===
      'collapsed,spooky,currentPlayer,moveNumber,phase,pending,winner,winLine,winByTieBreak'
  );
}

// ---------------------------------------------------------------------------
console.log('\nTransposition table: bounds are not exact scores (fix over the original)');
// ---------------------------------------------------------------------------
{
  // Found while porting: the original stores alpha-beta bounds as exact scores,
  // and on this position "custom 3" (and hard, on the real clock) plays X 4-6,
  // which loses by force inside the search's own three-ply horizon.
  let s = createInitialQuantumSnapshot();
  for (const [a, b] of [[5, 3], [8, 5], [2, 3], [3, 6], [1, 3], [7, 0]]) s = placeSpooky(s, a, b);
  expect('repro position reached with X to move', s.phase === 'placing' && s.currentPlayer === 'X');

  /** Every legal continuation, collapses included. */
  const kids = (snap) => {
    if (snap.phase === 'choosingCollapse' && snap.pending) return [0, 1].map((o) => resolveCollapse(snap, o));
    const open = availableCells(snap);
    if (open.length === 1) return [placeForced(snap, open[0])];
    const out = [];
    for (let i = 0; i < open.length; i += 1) {
      for (let j = i + 1; j < open.length; j += 1) out.push(placeSpooky(snap, open[i], open[j]));
    }
    return out;
  };
  /** Can `player` force a win within `plies` placements? Measurements are free, as in the AI. */
  const forcedWin = (snap, player, plies) => {
    if (snap.winner) return snap.winner === player;
    const measuring = snap.phase === 'choosingCollapse';
    if (plies === 0 && !measuring) return false;
    const left = measuring ? plies : plies - 1;
    const next = kids(snap);
    return decisionMaker(snap) === player
      ? next.some((c) => forcedWin(c, player, left))
      : next.every((c) => forcedWin(c, player, left));
  };
  const after46 = placeSpooky(s, 4, 6);
  expect('X 4-6 loses by force within two more placements', forcedWin(after46, 'O', 2));

  const legacy = getQuantumMove(s, 'custom', 3, { budgetMs: 5000, legacyTt: true });
  expect(
    'legacy table reproduces the original blunder (4-6)',
    !!legacy && legacy.kind === 'place' && legacy.a === 4 && legacy.b === 6
  );

  const fixed = getQuantumMove(s, 'custom', 3, { budgetMs: 5000 });
  const describe = (m) => (m ? (m.kind === 'place' ? `place ${m.a}-${m.b}` : m.kind) : 'nothing');
  expect(
    `fixed table avoids the forced loss (played ${describe(fixed)})`,
    !!fixed && !forcedWin(applyAiMove(s, fixed), 'O', 2)
  );

  const hard = getQuantumMove(s, 'hard', 3, { budgetMs: 2000 });
  expect(
    `hard with the fixed table also avoids it (played ${describe(hard)})`,
    !!hard && !forcedWin(applyAiMove(s, hard), 'O', 2)
  );
}

console.log(failures === 0 ? '\nAll tests passed.' : `\n${failures} test(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
