/**
 * Sanity tests for the Quantum engine and its AI.
 * Run with: npx tsx scripts/quantum.test.ts
 *
 * The entanglement/collapse logic is the subtlest code in the project, so this
 * covers the hand-built cases that are easy to get wrong (parallel-edge
 * 2-cycles, forced tree branches, the simultaneous-line tie-break) and then
 * fuzzes thousands of random games against the engine's structural invariants.
 */
import {
  availableCells,
  ClassicalMark,
  createInitialQuantumSnapshot,
  entanglementHighlight,
  forcedCell,
  placeForced,
  placeSpooky,
  QuantumSnapshot,
  resolveCollapse,
  SpookyMark,
} from '../src/utils/quantum';
import { getQuantumMove, QuantumAiMove } from '../src/utils/quantumAi';
import { redoActorRun, undoActorRun } from '../src/utils/timelineNav';
import { Difficulty, Player } from '../src/utils/engine';

let failures = 0;

function expect(name: string, condition: boolean) {
  if (!condition) {
    failures += 1;
    console.error(`  ✗ ${name}`);
  } else {
    console.log(`  ✓ ${name}`);
  }
}

/** Whoever must decide now: the chooser mid-measurement, else the mover. */
const decisionMaker = (s: QuantumSnapshot): Player =>
  s.phase === 'choosingCollapse' && s.pending ? s.pending.chooser : s.currentPlayer;

const applyAiMove = (s: QuantumSnapshot, move: QuantumAiMove): QuantumSnapshot => {
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

  const [a, b] = s.pending!.options;
  expect('outcome A seats both cells', !!a.assignment[0] && !!a.assignment[1]);
  expect('outcome B seats both cells', !!b.assignment[0] && !!b.assignment[1]);
  expect('the two outcomes genuinely differ', a.assignment[0]!.player !== b.assignment[0]!.player);

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
    [...s.pending!.componentCells].sort((x, y) => x - y).join(',') === '0,1,2'
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
    [...s.pending!.componentCells].sort((x, y) => x - y).join(',') === '0,1,3,4'
  );
  const [a, b] = s.pending!.options;
  expect('hanging cell is seated in both outcomes', !!a.assignment[3] && !!b.assignment[3]);
  expect(
    'hanging cell resolves identically either way',
    a.assignment[3]!.subscript === b.assignment[3]!.subscript &&
      a.assignment[3]!.player === b.assignment[3]!.player
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
  for (const option of [0, 1] as const) {
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
  const craft = (
    xSubs: [number, number, number],
    oSubs: [number, number, number]
  ): QuantumSnapshot => {
    const assignment: Record<number, ClassicalMark> = {};
    [0, 1, 2].forEach((cell, i) => (assignment[cell] = { player: 'X', subscript: xSubs[i] }));
    [6, 7, 8].forEach((cell, i) => (assignment[cell] = { player: 'O', subscript: oSubs[i] }));
    const spooky: SpookyMark[] = [];
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
  const collapsed: Array<ClassicalMark | null> = Array(9).fill(null);
  for (let i = 0; i < 8; i += 1) {
    // Deliberately no three-in-a-row among the first eight cells.
    collapsed[i] = { player: i % 2 ? 'O' : 'X', subscript: i + 1 };
  }
  const hand: QuantumSnapshot = {
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
  function isForest(spooky: ReadonlyArray<SpookyMark>): boolean {
    const adj = new Map<number, number[]>();
    for (const m of spooky) {
      if (!adj.has(m.cells[0])) adj.set(m.cells[0], []);
      if (!adj.has(m.cells[1])) adj.set(m.cells[1], []);
      adj.get(m.cells[0])!.push(m.cells[1]);
      adj.get(m.cells[1])!.push(m.cells[0]);
    }
    const seen = new Set<number>();
    let components = 0;
    for (const node of adj.keys()) {
      if (seen.has(node)) continue;
      components += 1;
      const stack = [node];
      seen.add(node);
      while (stack.length) {
        const cur = stack.pop()!;
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
        ...s.collapsed.filter(Boolean).map((c) => c!.subscript),
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
  const difficulties: Difficulty[] = ['easy', 'medium', 'hard', 'custom'];

  for (const difficulty of difficulties) {
    let s = createInitialQuantumSnapshot();
    let legal = true;
    let decided = 0;

    for (let i = 0; i < 14 && !s.winner && s.phase !== 'gameover'; i += 1) {
      const move = getQuantumMove(s, difficulty, 3);
      if (!move) break;
      const next = applyAiMove(s, move);
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
    const outcome = move ? applyAiMove(s, move) : s;
    expect(`${difficulty}: takes an immediately winning measurement`, outcome.winner === 'X');
  }
}

// ---------------------------------------------------------------------------
console.log('\nUndo/redo actor-run navigation (vs AI)');
// ---------------------------------------------------------------------------
{
  type P = 'X' | 'O' | null;

  // Normal exchange: human place, AI place.
  const normal: P[] = [null, 'X', 'O'];
  expect('normal undo returns to before the human move', undoActorRun(normal, 2, 'O') === 0);
  expect('normal redo restores the full exchange', redoActorRun(normal, 0, 'O') === 2);

  // Cycle close: human place → AI measure → AI place (three snapshots).
  const cycle: P[] = [null, 'X', 'O', 'O'];
  expect('cycle undo skips both AI decisions', undoActorRun(cycle, 3, 'O') === 0);
  expect('cycle redo restores measure + place', redoActorRun(cycle, 0, 'O') === 3);
  expect('mid-AI undo still lands before the human move', undoActorRun(cycle, 2, 'O') === 0);

  // Human measure + place after AI closed a cycle, then AI reply.
  const humanDouble: P[] = [null, 'X', 'O', 'X', 'X', 'O'];
  expect(
    'human measure+place undoes as one turn',
    undoActorRun(humanDouble, 5, 'O') === 2
  );
  expect(
    'redo after that restores measure, place, and AI reply',
    redoActorRun(humanDouble, 2, 'O') === 5
  );
}

// ---------------------------------------------------------------------------
console.log('\nEntanglement highlight');
// ---------------------------------------------------------------------------
{
  const sorted = (nums: number[]) => [...nums].sort((a, b) => a - b).join(',');

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

console.log(failures === 0 ? '\nAll tests passed.' : `\n${failures} test(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
