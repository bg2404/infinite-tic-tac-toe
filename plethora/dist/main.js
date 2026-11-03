// Plethora Bit · docs and draft upload: https://agent.plethora.studio/v1/agent/start.md
(() => {
"use strict";
// ---- src/engine.mjs ----
/**
 * Quantum tic-tac-toe rules engine: a plain-JavaScript port of
 * src/utils/quantum.ts, together with the constants and helper it imports from
 * src/utils/constants.ts and src/utils/engine.ts. Semantics are identical to
 * the TypeScript original; plethora/test/differential.test.ts plays both
 * engines in lockstep and compares every snapshot.
 *
 * Quantum Tic-Tac-Toe (Goff's 2006 ruleset), locked variant:
 *  - A move places a "spooky mark": the same symbol superposed in TWO cells,
 *    tagged with the move number (its subscript). Each spooky mark is an edge
 *    in an entanglement graph whose nodes are cells.
 *  - At rest the graph is always a forest — closing a cycle triggers collapse
 *    (measurement) immediately, so a cycle never persists between moves.
 *  - Collapse resolves the whole cyclic component to classical marks. A
 *    unicyclic component has exactly two consistent measurement outcomes; the
 *    player who did NOT close the cycle chooses between them (canonical Goff).
 *  - Sudden-death scoring: the first completed three-in-a-row wins. When a
 *    single collapse completes lines for both players, the line with the lower
 *    maximum subscript ("measured first") wins.
 */

/*
 * Data shapes. Snapshots are plain data and are never mutated: every move
 * returns a new snapshot, or the same reference when the move is illegal.
 *
 * Snapshot
 *   collapsed      Array of 9: ClassicalMark | null. The classical board; null
 *                  where a cell has not yet collapsed.
 *   spooky         SpookyMark[]: active superposed marks (edges of the
 *                  entanglement forest), in placement order.
 *   currentPlayer  'X' | 'O'.
 *   moveNumber     Moves made so far (placements and forced fills).
 *   phase          'placing' | 'choosingCollapse' | 'gameover'.
 *   pending        PendingCollapse, present only while phase is
 *                  'choosingCollapse'; null otherwise.
 *   winner         'X' | 'O' | 'draw' | null.
 *   winLine        [a, b, c] cell indices of the winning line, or null.
 *   winByTieBreak  True when both players completed a line on the same
 *                  collapse and subscript order decided it.
 *
 * SpookyMark { id, player, cells: [lo, hi] }
 *   A superposed move: one symbol occupying two cells at once. `id` is the
 *   move number this mark was placed at and doubles as its subscript. `cells`
 *   are the two distinct cells it is superposed across, always sorted
 *   ascending.
 *
 * ClassicalMark { player, subscript }
 *   A cell that has collapsed to a definite classical mark. `subscript` is the
 *   id of the spooky mark that resolved into this cell.
 *
 * PendingCollapse { chooser, componentCells, cyclicEdgeIds, options }
 *   chooser         The player who resolves the measurement (did not close the
 *                   cycle).
 *   componentCells  Cells being measured: everything in the newly-cyclic
 *                   component.
 *   cyclicEdgeIds   Spooky-mark ids that form the closed cycle (for the
 *                   measurement flash).
 *   options         Exactly two consistent measurement outcomes, each
 *                   { assignment }: a sparse object keyed by cell index that
 *                   gives the ClassicalMark for every cell in the component.
 */

/** The 8 possible three-in-a-row lines on a 3x3 board. */
const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

const BOARD_CELLS = 9;

const otherPlayer = (player) => (player === 'X' ? 'O' : 'X');

const createInitialQuantumSnapshot = () => ({
  collapsed: Array(BOARD_CELLS).fill(null),
  spooky: [],
  currentPlayer: 'X',
  moveNumber: 0,
  phase: 'placing',
  pending: null,
  winner: null,
  winLine: null,
  winByTieBreak: false,
});

/** A cell is available for a new spooky mark until it has collapsed. */
const isCollapsed = (snapshot, cell) => snapshot.collapsed[cell] !== null;

function availableCells(snapshot) {
  const cells = [];
  for (let i = 0; i < BOARD_CELLS; i += 1) {
    if (snapshot.collapsed[i] === null) cells.push(i);
  }
  return cells;
}

/** Spooky marks that touch a given cell, in placement order. */
function marksInCell(snapshot, cell) {
  return snapshot.spooky.filter((mark) => mark.cells[0] === cell || mark.cells[1] === cell);
}

// ---------------------------------------------------------------------------
// Entanglement graph
// ---------------------------------------------------------------------------

/** Adjacency: cell -> list of { to, edgeId } across all spooky marks. */
function buildAdjacency(spooky) {
  const adj = {};
  for (const mark of spooky) {
    const [a, b] = mark.cells;
    (adj[a] ?? (adj[a] = [])).push({ to: b, edgeId: mark.id });
    (adj[b] ?? (adj[b] = [])).push({ to: a, edgeId: mark.id });
  }
  return adj;
}

/** Cells reachable from `start` through spooky edges (the connected component). */
function componentOf(start, adj) {
  const seen = new Set([start]);
  const stack = [start];
  while (stack.length) {
    const node = stack.pop();
    for (const { to } of adj[node] ?? []) {
      if (!seen.has(to)) {
        seen.add(to);
        stack.push(to);
      }
    }
  }
  return [...seen];
}

/**
 * Returns true if `a` and `b` are already connected through spooky edges,
 * i.e. adding an edge between them would close a cycle.
 */
function alreadyConnected(a, b, adj) {
  return componentOf(a, adj).includes(b);
}

const EMPTY_HIGHLIGHT = { cells: [], edgeIds: [] };

/**
 * The connected component a cell belongs to, for showing a player everything a
 * measurement there would drag along with it. Collapsed cells and cells with
 * no spooky marks highlight nothing.
 *
 * Returns { cells, edgeIds }: everything entangled with `cell`, i.e. its whole
 * component plus the ids of the marks in it.
 */
function entanglementHighlight(snapshot, cell) {
  if (snapshot.collapsed[cell] !== null) return EMPTY_HIGHLIGHT;

  const adj = buildAdjacency(snapshot.spooky);
  if (!adj[cell]) return EMPTY_HIGHLIGHT;

  const cells = componentOf(cell, adj);
  const members = new Set(cells);
  const edgeIds = snapshot.spooky
    .filter((mark) => members.has(mark.cells[0]) || members.has(mark.cells[1]))
    .map((mark) => mark.id);

  return { cells, edgeIds };
}

/**
 * The unique tree path between `a` and `b` in a forest, as ordered nodes plus
 * the edge ids linking consecutive nodes. `edges[i]` connects `nodes[i]` and
 * `nodes[i + 1]`. Assumes `a` and `b` are connected.
 */
function pathInForest(a, b, adj) {
  const parentNode = new Map();
  const parentEdge = new Map();
  const seen = new Set([a]);
  const stack = [a];

  while (stack.length) {
    const node = stack.pop();
    if (node === b) break;
    for (const { to, edgeId } of adj[node] ?? []) {
      if (!seen.has(to)) {
        seen.add(to);
        parentNode.set(to, node);
        parentEdge.set(to, edgeId);
        stack.push(to);
      }
    }
  }

  const nodes = [b];
  const edges = [];
  let cur = b;
  while (cur !== a) {
    edges.push(parentEdge.get(cur));
    cur = parentNode.get(cur);
    nodes.push(cur);
  }
  nodes.reverse();
  edges.reverse();
  return { nodes, edges };
}

/**
 * Builds the two consistent measurement outcomes for a unicyclic component.
 * The cycle can be oriented two ways; each orientation seats the cycle marks,
 * and the tree branches hanging off the cycle are then forced outward.
 *
 * `cycle`/`cycleEdges` describe the loop: `cycleEdges[i]` connects `cycle[i]`
 * to `cycle[(i + 1) % k]`.
 */
function buildCollapseOptions(componentCells, cycle, cycleEdges, spookyById, adj) {
  const k = cycle.length;
  const cycleEdgeSet = new Set(cycleEdges);

  const orient = (dir) => {
    // cell -> edgeId that lands its mark there
    const landing = new Map();
    // Seat the cycle: edge i (between cycle[i], cycle[i+1]) lands on one end.
    for (let i = 0; i < k; i += 1) {
      const target = dir === 0 ? cycle[(i + 1) % k] : cycle[i];
      landing.set(target, cycleEdges[i]);
    }
    // Force the tree branches outward from the seated cycle nodes.
    const occupied = new Set(cycle);
    const queue = [...cycle];
    while (queue.length) {
      const node = queue.shift();
      for (const { to, edgeId } of adj[node] ?? []) {
        if (cycleEdgeSet.has(edgeId)) continue;
        if (occupied.has(to)) continue;
        landing.set(to, edgeId);
        occupied.add(to);
        queue.push(to);
      }
    }

    const assignment = {};
    for (const cell of componentCells) {
      const edgeId = landing.get(cell);
      if (edgeId === undefined) continue; // defensive: every component cell should be seated
      const mark = spookyById.get(edgeId);
      assignment[cell] = { player: mark.player, subscript: mark.id };
    }
    return { assignment };
  };

  return { options: [orient(0), orient(1)], cyclicEdgeIds: cycleEdges };
}

// ---------------------------------------------------------------------------
// Win detection
// ---------------------------------------------------------------------------

/**
 * Every completed line on the board, as { player, line, maxSubscript,
 * subscriptsDesc }: `maxSubscript` is the highest subscript among the line's
 * three cells, and `subscriptsDesc` the three subscripts sorted descending
 * (for exact tie-breaking).
 */
function completedLines(collapsed) {
  const lines = [];
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    const ma = collapsed[a];
    const mb = collapsed[b];
    const mc = collapsed[c];
    if (ma && mb && mc && ma.player === mb.player && mb.player === mc.player) {
      const subs = [ma.subscript, mb.subscript, mc.subscript].sort((x, y) => y - x);
      lines.push({
        player: ma.player,
        line,
        maxSubscript: subs[0],
        subscriptsDesc: subs,
      });
    }
  }
  return lines;
}

/** Lower descending-subscript vector wins (measured earliest). */
function preferEarlier(a, b) {
  const len = Math.max(a.subscriptsDesc.length, b.subscriptsDesc.length);
  for (let i = 0; i < len; i += 1) {
    const av = a.subscriptsDesc[i] ?? Infinity;
    const bv = b.subscriptsDesc[i] ?? Infinity;
    if (av !== bv) return av < bv ? a : b;
  }
  return a;
}

/**
 * Resolves the outcome after a collapse. Sudden-death: any completed line ends
 * the game. If both players completed lines on the same collapse, the earliest
 * (lowest max-subscript) line wins. Returns { winner, winLine, winByTieBreak }.
 */
function evaluateOutcome(collapsed) {
  const lines = completedLines(collapsed);
  if (lines.length === 0) {
    const full = collapsed.every((cell) => cell !== null);
    return { winner: full ? 'draw' : null, winLine: null, winByTieBreak: false };
  }
  // Best (earliest) line for each player, then the earlier of those wins.
  const best = new Map();
  for (const line of lines) {
    const cur = best.get(line.player);
    best.set(line.player, cur ? preferEarlier(cur, line) : line);
  }
  const contenders = [...best.values()];
  const winning = contenders.reduce((acc, l) => preferEarlier(acc, l));
  return {
    winner: winning.player,
    winLine: winning.line,
    winByTieBreak: contenders.length > 1,
  };
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

/**
 * Places a spooky mark across cells `a` and `b`. If it closes a cycle, the
 * returned snapshot enters `choosingCollapse` for the non-closing player;
 * otherwise the turn passes normally. Returns the same reference if illegal.
 */
function placeSpooky(snapshot, a, b) {
  if (snapshot.phase !== 'placing') return snapshot;
  if (a === b) return snapshot;
  if (a < 0 || b < 0 || a >= BOARD_CELLS || b >= BOARD_CELLS) return snapshot;
  if (isCollapsed(snapshot, a) || isCollapsed(snapshot, b)) return snapshot;

  const [lo, hi] = a < b ? [a, b] : [b, a];
  const id = snapshot.moveNumber + 1;
  const newMark = { id, player: snapshot.currentPlayer, cells: [lo, hi] };
  const spooky = [...snapshot.spooky, newMark];
  const nextPlayer = otherPlayer(snapshot.currentPlayer);

  const priorAdj = buildAdjacency(snapshot.spooky);
  const closesCycle = alreadyConnected(lo, hi, priorAdj);

  if (!closesCycle) {
    return {
      ...snapshot,
      spooky,
      moveNumber: id,
      currentPlayer: nextPlayer,
    };
  }

  // A cycle formed. The closing edge is the new mark; the rest of the loop is
  // the unique tree path between its two cells in the PRIOR forest.
  const adj = buildAdjacency(spooky);
  const componentCells = componentOf(lo, adj);
  const { nodes: cycle, edges: pathEdges } = pathInForest(lo, hi, priorAdj);
  const cycleEdges = [...pathEdges, id]; // last edge (the new mark) closes hi -> lo
  const spookyById = new Map(spooky.map((m) => [m.id, m]));
  const { options, cyclicEdgeIds } = buildCollapseOptions(
    componentCells,
    cycle,
    cycleEdges,
    spookyById,
    adj
  );

  return {
    ...snapshot,
    spooky,
    moveNumber: id,
    currentPlayer: nextPlayer, // the non-closer, who both measures and moves next
    phase: 'choosingCollapse',
    pending: {
      chooser: nextPlayer,
      componentCells,
      cyclicEdgeIds,
      options,
    },
  };
}

/**
 * Commits one of the two measurement outcomes (optionIndex 0 or 1) chosen by
 * the non-closer. The measured spooky marks become classical and the game
 * outcome is evaluated. Returns the same reference if no measurement is pending.
 */
function resolveCollapse(snapshot, optionIndex) {
  if (snapshot.phase !== 'choosingCollapse' || !snapshot.pending) return snapshot;

  const { assignment } = snapshot.pending.options[optionIndex];
  const collapsed = snapshot.collapsed.map((cell, i) => assignment[i] ?? cell);
  const measured = new Set(snapshot.pending.componentCells);
  const spooky = snapshot.spooky.filter(
    (mark) => !measured.has(mark.cells[0]) || !measured.has(mark.cells[1])
  );

  const { winner, winLine, winByTieBreak } = evaluateOutcome(collapsed);

  return {
    ...snapshot,
    collapsed,
    spooky,
    phase: winner ? 'gameover' : 'placing',
    pending: null,
    winner,
    winLine,
    winByTieBreak,
  };
}

/**
 * Fills the single remaining empty cell with a definite classical mark. Used
 * for the endgame "last square" where a two-cell superposition is impossible.
 * Returns the same reference if illegal.
 */
function placeForced(snapshot, cell) {
  if (snapshot.phase !== 'placing') return snapshot;
  const open = availableCells(snapshot);
  if (open.length !== 1 || open[0] !== cell) return snapshot;

  const id = snapshot.moveNumber + 1;
  const collapsed = snapshot.collapsed.map((c, i) =>
    i === cell ? { player: snapshot.currentPlayer, subscript: id } : c
  );
  const { winner, winLine, winByTieBreak } = evaluateOutcome(collapsed);

  return {
    ...snapshot,
    collapsed,
    moveNumber: id,
    currentPlayer: otherPlayer(snapshot.currentPlayer),
    phase: winner ? 'gameover' : 'placing',
    winner,
    winLine,
    winByTieBreak,
  };
}

/** The single open cell when only one remains (forcing a classical placement), else null. */
function forcedCell(snapshot) {
  const open = availableCells(snapshot);
  return open.length === 1 ? open[0] : null;
}
// ---- src/ai.mjs ----

/**
 * AI for Quantum mode: a plain-JavaScript port of src/utils/quantumAi.ts with
 * the same algorithm. The port adds only the optional `overrides` argument to
 * getQuantumMove, the exported decisionMaker and WIN_SCORE, and applyAiMove.
 *
 * The engine is perfect-information and deterministic (collapse outcomes are
 * chosen by a player, not random), so a depth-limited minimax works — but
 * turns do NOT strictly alternate: after a player closes a cycle, the OTHER
 * player both measures and moves next, taking two decisions in a row. So every
 * node is labelled with its decision-maker rather than assuming alternation,
 * and we maximise the AI's evaluation on its nodes, minimise on the opponent's.
 * The search therefore captures, for free, the key quantum idea that closing a
 * loop hands the collapse choice to your opponent.
 *
 * Moves:
 *   { kind: 'place', a, b }       a spooky mark across cells a and b
 *   { kind: 'forced', cell }      the classical fill of the single open cell
 *   { kind: 'collapse', option }  measurement outcome 0 or 1
 */

/** Whoever must decide right now: the chooser mid-measurement, else the mover. */
function decisionMaker(snapshot) {
  return snapshot.phase === 'choosingCollapse' && snapshot.pending
    ? snapshot.pending.chooser
    : snapshot.currentPlayer;
}

/** Every legal decision from a state, as { snap, move } (resulting snapshot, move) pairs. */
function genChildren(snapshot) {
  if (snapshot.phase === 'choosingCollapse' && snapshot.pending) {
    return [0, 1].map((option) => ({
      snap: resolveCollapse(snapshot, option),
      move: { kind: 'collapse', option },
    }));
  }

  const open = availableCells(snapshot);
  if (open.length === 1) {
    return [{ snap: placeForced(snapshot, open[0]), move: { kind: 'forced', cell: open[0] } }];
  }

  const children = [];
  for (let i = 0; i < open.length; i += 1) {
    for (let j = i + 1; j < open.length; j += 1) {
      children.push({
        snap: placeSpooky(snapshot, open[i], open[j]),
        move: { kind: 'place', a: open[i], b: open[j] },
      });
    }
  }
  return children;
}

// ---------------------------------------------------------------------------
// Evaluation — fractional line potential from a player's perspective.
// ---------------------------------------------------------------------------

/** Value of 0/1/2 collapsed marks in a still-live line (3 is terminal). */
const LINE_COLLAPSED = [0, 3, 18];
/** Weight per line-cell a player could still land a superposed mark into. */
const SUPER_WEIGHT = 1.5;
const CENTER_INDEX = 4;
const CENTER_WEIGHT = 2;
const WIN_SCORE = 10000;

function evaluate(snapshot, player) {
  const opp = otherPlayer(player);
  const { collapsed, spooky } = snapshot;

  // Which open cells each player has a spooky mark touching (superposed reach).
  const reach = { [player]: new Set(), [opp]: new Set() };
  for (const mark of spooky) {
    for (const cell of mark.cells) {
      if (collapsed[cell] === null) reach[mark.player].add(cell);
    }
  }

  let score = 0;
  for (const line of WIN_LINES) {
    let mine = 0;
    let theirs = 0;
    for (const cell of line) {
      const c = collapsed[cell];
      if (c?.player === player) mine += 1;
      else if (c?.player === opp) theirs += 1;
    }
    if (mine > 0 && theirs > 0) continue; // contested line is dead for both

    const openCells = line.filter((cell) => collapsed[cell] === null);
    if (theirs === 0) {
      score += LINE_COLLAPSED[mine];
      score += openCells.filter((cell) => reach[player].has(cell)).length * SUPER_WEIGHT;
    }
    if (mine === 0) {
      score -= LINE_COLLAPSED[theirs];
      score -= openCells.filter((cell) => reach[opp].has(cell)).length * SUPER_WEIGHT;
    }
  }

  const center = collapsed[CENTER_INDEX];
  if (center?.player === player) score += CENTER_WEIGHT;
  else if (center?.player === opp) score -= CENTER_WEIGHT;

  return score;
}

/** Terminal value from the AI's perspective; sooner wins score higher. Null when not terminal. */
function terminalValue(snapshot, ai, depth) {
  if (!snapshot.winner) return null;
  if (snapshot.winner === 'draw') return 0;
  return snapshot.winner === ai ? WIN_SCORE + depth : -WIN_SCORE - depth;
}

// ---------------------------------------------------------------------------
// Search — iterative deepening with alpha-beta, move ordering, and a time
// budget. Deeper difficulty settings really do search deeper (bounded by time,
// not an arbitrary cap); if a depth can't finish in the budget, the last fully
// completed depth is used, so the AI always returns a sound move.
// ---------------------------------------------------------------------------

/** Placement branching can hit 36; a wide beam keeps deep search tractable
 *  without discarding plausible moves the way a narrow one does. */
const BEAM = 18;

/*
 * Search context: { ai, deadline, aborted, tt, legacyTt }, where tt maps
 * ttKey(snapshot) to { depth, score, flag }. flag records what alpha-beta
 * actually proved about `score`: 0 exact, 1 a lower bound (the node failed
 * high and was cut off), -1 an upper bound (every child failed low).
 *
 * The TypeScript original stores every score as exact and reuses it in any
 * window, which occasionally returns a bound as the node's value and, on a
 * reproducible position, makes "hard" play a move that loses by force. The
 * port fixes that by honouring the flag. legacyTt: true restores the original
 * behaviour; the differential test uses it to prove the rest of the port is
 * byte-for-byte faithful.
 */
const TT_EXACT = 0;
const TT_LOWER = 1;
const TT_UPPER = -1;

/** Compact key for transposition: classical board + forest + phase + mover. */
function ttKey(snapshot) {
  const collapsed = snapshot.collapsed
    .map((c) => (c ? `${c.player}${c.subscript}` : '-'))
    .join('');
  const spooky = snapshot.spooky
    .map((m) => `${m.id}:${m.player}:${m.cells[0]}-${m.cells[1]}`)
    .slice()
    .sort()
    .join('|');
  const pending = snapshot.pending
    ? `${snapshot.pending.chooser}:${[...snapshot.pending.cyclicEdgeIds].sort().join(',')}`
    : '';
  return `${collapsed};${spooky};${snapshot.phase};${pending};${decisionMaker(snapshot)}`;
}

/** Order children best-first for the mover; beam only away from the leaves. */
function orderAndBeam(children, mover, remainingDepth) {
  if (children.length <= 3) return children;
  const scored = children
    .map((c) => ({ c, q: evaluate(c.snap, mover) }))
    .sort((x, y) => y.q - x.q);
  const beam = remainingDepth >= 2 && scored.length > BEAM ? BEAM : scored.length;
  return scored.slice(0, beam).map((s) => s.c);
}

function search(snapshot, depth, alpha, beta, ctx) {
  const terminal = terminalValue(snapshot, ctx.ai, depth);
  if (terminal !== null) return terminal;

  // Quiescence: never evaluate mid-measurement — resolve the collapse first
  // without spending a ply (only two children, so the cost is tiny).
  const pendingCollapse = snapshot.phase === 'choosingCollapse' && snapshot.pending !== null;
  if (depth === 0 && !pendingCollapse) return evaluate(snapshot, ctx.ai);

  if (ctx.aborted || Date.now() > ctx.deadline) {
    ctx.aborted = true;
    return evaluate(snapshot, ctx.ai);
  }

  const key = ttKey(snapshot);
  const hit = ctx.tt.get(key);
  if (hit && hit.depth >= depth) {
    if (ctx.legacyTt || hit.flag === TT_EXACT) return hit.score;
    // A bound only settles the node when it already falls outside the window.
    if (hit.flag === TT_LOWER && hit.score >= beta) return hit.score;
    if (hit.flag === TT_UPPER && hit.score <= alpha) return hit.score;
  }

  const alphaOrig = alpha;
  const betaOrig = beta;
  const dm = decisionMaker(snapshot);
  const maximizing = dm === ctx.ai;
  const children = orderAndBeam(genChildren(snapshot), dm, Math.max(depth, 1));
  let best = maximizing ? -Infinity : Infinity;
  const childDepth = pendingCollapse ? depth : depth - 1;

  for (const { snap } of children) {
    const value = search(snap, childDepth, alpha, beta, ctx);
    if (maximizing) {
      best = Math.max(best, value);
      alpha = Math.max(alpha, value);
    } else {
      best = Math.min(best, value);
      beta = Math.min(beta, value);
    }
    if (beta <= alpha) break;
  }

  if (!ctx.aborted) {
    // Same rule for both node types: a value at or below the entry alpha is
    // an upper bound (fail low), at or above the entry beta a lower bound
    // (cut off), anything strictly inside the window is exact.
    const flag = best <= alphaOrig ? TT_UPPER : best >= betaOrig ? TT_LOWER : TT_EXACT;
    ctx.tt.set(key, { depth, score: best, flag });
  }
  return best;
}

function bestByEval(children, player) {
  let best = children[0];
  let bestVal = -Infinity;
  for (const child of children) {
    const value = evaluate(child.snap, player);
    if (value > bestVal) {
      bestVal = value;
      best = child;
    }
  }
  return best.move;
}

/**
 * Iterative deepening: search depth 1, 2, 3 … up to maxDepth or the time
 * budget, whichever comes first. Root children are re-ordered by each
 * iteration's scores so the best line is tried first next time (sharper
 * pruning), and an unfinished depth is discarded in favour of the last
 * completed one.
 */
function bestBySearch(children, ai, maxDepth, budgetMs, legacyTt) {
  const deadline = Date.now() + budgetMs;
  const tt = new Map();
  let ordered = children
    .map((c) => ({ c, q: evaluate(c.snap, ai) }))
    .sort((x, y) => y.q - x.q)
    .map((s) => s.c);
  let bestMove = ordered[0].move;

  for (let depth = 1; depth <= maxDepth; depth += 1) {
    const ctx = { ai, deadline, aborted: false, tt, legacyTt: legacyTt === true };
    const scores = new Map();
    let localBest = ordered[0];
    let localVal = -Infinity;
    let alpha = -Infinity;

    for (const child of ordered) {
      const value = search(child.snap, depth - 1, alpha, Infinity, ctx);
      if (ctx.aborted) break;
      scores.set(child, value);
      if (value > localVal) {
        localVal = value;
        localBest = child;
      }
      alpha = Math.max(alpha, value);
    }

    if (ctx.aborted) break; // discard the unfinished depth, keep the last one
    bestMove = localBest.move;
    if (localVal >= WIN_SCORE) break; // a forced win — no need to search deeper
    ordered = [...ordered].sort((a, b) => (scores.get(b) ?? 0) - (scores.get(a) ?? 0));
    if (Date.now() > deadline) break;
  }
  return bestMove;
}

/** How hard each tier thinks, as { maxDepth, budgetMs }. Budgets bound the main-thread pause per move. */
function planFor(difficulty, customDepth) {
  switch (difficulty) {
    case 'medium':
      return { maxDepth: 3, budgetMs: 90 };
    case 'hard':
      return { maxDepth: 6, budgetMs: 350 };
    case 'custom':
      // Honour the chosen depth; the budget scales with it and caps the pause.
      return {
        maxDepth: Math.max(1, Math.min(customDepth, 9)),
        budgetMs: Math.max(200, Math.min(customDepth * 100, 900)),
      };
    case 'easy':
      return { maxDepth: 1, budgetMs: 20 };
  }
}

/**
 * The AI's move for the current state — a placement, a forced last-cell fill, or
 * a collapse choice, depending on the phase. Returns null when there's nothing
 * to do (game over).
 *
 * `difficulty` is 'easy' | 'medium' | 'hard' | 'custom'; `customDepth` matters
 * only for 'custom'. The optional `overrides` object ({ maxDepth, budgetMs },
 * either key optional) replaces the planFor() values, used as given, whenever
 * the move is searched: medium's searched half, hard and custom. Easy, and
 * medium's random placements, never search, so overrides do not change them.
 * `overrides.legacyTt: true` reproduces the original's transposition-table
 * behaviour (bounds reused as exact scores); it exists for the differential
 * test and should not be used for play.
 */
function getQuantumMove(snapshot, difficulty, customDepth, overrides) {
  if (snapshot.phase === 'gameover' || snapshot.winner) return null;

  const ai = decisionMaker(snapshot);
  const children = genChildren(snapshot);
  if (children.length === 0) return null;

  // Always take an immediately winning decision, whatever the difficulty.
  const winning = children.find((c) => c.snap.winner === ai);
  if (winning) return winning.move;

  // Easy plays loose: random placements, and a shallow (but not blind) pick when
  // it has to measure — a wrong collapse can simply hand away the game.
  if (difficulty === 'easy') {
    return snapshot.phase === 'choosingCollapse'
      ? bestByEval(children, ai)
      : children[Math.floor(Math.random() * children.length)].move;
  }

  // Medium mixes in randomness on placements only; measurement is always searched.
  if (difficulty === 'medium' && snapshot.phase === 'placing' && Math.random() < 0.5) {
    return children[Math.floor(Math.random() * children.length)].move;
  }

  // Medium/Hard/Custom search everything — crucially including collapse choices,
  // which are pivotal and were previously decided only one ply deep.
  const { maxDepth: planDepth, budgetMs: planBudget } = planFor(difficulty, customDepth);
  const maxDepth = overrides?.maxDepth ?? planDepth;
  const budgetMs = overrides?.budgetMs ?? planBudget;
  return bestBySearch(children, ai, maxDepth, budgetMs, overrides?.legacyTt === true);
}

/**
 * Applies a move through the engine: place → placeSpooky, forced →
 * placeForced, collapse → resolveCollapse. Like the engine's own moves, it
 * returns the same snapshot reference when the move is illegal, including a
 * missing move, an unknown kind, or a collapse option other than 0 or 1.
 */
function applyAiMove(snapshot, move) {
  if (!move) return snapshot;
  if (move.kind === 'place') return placeSpooky(snapshot, move.a, move.b);
  if (move.kind === 'forced') return placeForced(snapshot, move.cell);
  if (move.kind === 'collapse') {
    return move.option === 0 || move.option === 1 ? resolveCollapse(snapshot, move.option) : snapshot;
  }
  return snapshot;
}
// ---- src/bit.mjs ----
// ---------------------------------------------------------------------------
// Quantum Tic Tac Toe · Plethora Bit (host integration, rendering, UX).
//
// The rules engine (engine.mjs) and the computer opponent (ai.mjs) are ports
// of the TypeScript originals in src/utils; this file owns everything the
// player sees and touches: a full-screen Canvas2D board, a DOM HUD inside the
// content safe area, the measurement choice, the coached first game, the
// result sheet with the streak leaderboard, music, haptics and persistence.
// ---------------------------------------------------------------------------

const HUMAN = 'X';
const COMPUTER = 'O';
const DIFFICULTIES = ['easy', 'medium', 'hard'];
const DIFFICULTY_LABEL = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
const PROFILE_VERSION = 1;
const RECORD_CHANNEL = 'streak';
const PROFILE_CHANNEL = 'profile';
const FONT_FAMILY = '"QTT Display", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, system-ui, sans-serif';

/** Deep-space observatory palette: dark indigo glass, cyan X, pink O, amber measurement. */
const C = {
  bg: '#070B16',
  bgMid: '#0D1428',
  bgLow: '#090E1C',
  cell: '#141B2D',
  cellLit: '#1A2338',
  cellLine: 'rgba(255,255,255,0.06)',
  cellTop: 'rgba(255,255,255,0.05)',
  x: '#22D3EE',
  o: '#F472B6',
  ink: '#F4F6FB',
  muted: '#94A0B8',
  amber: '#F5B544',
  card: '#0F162A',
  cardLine: 'rgba(255,255,255,0.09)',
};

/** Animation timings in milliseconds. */
const T = {
  pop: 260,
  thread: 300,
  collapse: 520,
  fade: 420,
  flashHold: 760,
  winLine: 520,
  toast: 1700,
  breath: 1600,
  threadBreath: 1700,
  sheetDelay: 900,
  narrate: 1400, // the computer's chosen outcome is previewed this long before it settles
  afterCollapse: 700, // extra pause before the computer moves again after a collapse
  tutorialRead: 1700, // extra pause so a coaching line can be read before the computer acts
};

const SUBSCRIPT_DIGITS = ['₀', '₁', '₂', '₃', '₄', '₅', '₆', '₇', '₈', '₉'];
const toSubscript = (n) => String(n).split('').map((d) => SUBSCRIPT_DIGITS[Number(d)] ?? d).join('');

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, t) => a + (b - a) * t;
const easeOutCubic = (t) => 1 - Math.pow(1 - clamp01(t), 3);
const easeOutBack = (t) => {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  const x = clamp01(t) - 1;
  return 1 + c3 * x * x * x + c1 * x * x;
};

/** Hex colour to rgba() with the given alpha. */
const rgbaCache = new Map();
function rgba(hex, alpha) {
  let rgb = rgbaCache.get(hex);
  if (!rgb) {
    const v = parseInt(hex.slice(1), 16);
    rgb = [(v >> 16) & 255, (v >> 8) & 255, v & 255];
    rgbaCache.set(hex, rgb);
  }
  return `rgba(${rgb[0]},${rgb[1]},${rgb[2]},${alpha.toFixed(3)})`;
}

/** Small deterministic PRNG for the star field (same sky every visit). */
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function prefersReducedMotion() {
  try {
    return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch (_) {
    return false;
  }
}

function freshProfile(defaultDifficulty) {
  const perDifficulty = (make) => ({ easy: make(), medium: make(), hard: make() });
  return {
    v: PROFILE_VERSION,
    difficulty: DIFFICULTIES.includes(defaultDifficulty) ? defaultDifficulty : 'medium',
    streaks: perDifficulty(() => 0),
    best: perDifficulty(() => 0),
    stats: perDifficulty(() => ({ w: 0, l: 0, d: 0 })),
    tutorialDone: false,
    muted: false,
    /** Difficulty of a game in progress; still set on the next visit means it was abandoned. */
    live: null,
  };
}

/** Merges a saved profile into a fresh one, validating every field it touches. */
function mergeProfile(base, saved) {
  if (!saved || typeof saved !== 'object' || saved.v !== PROFILE_VERSION) return base;
  const out = freshProfile(base.difficulty);
  if (DIFFICULTIES.includes(saved.difficulty)) out.difficulty = saved.difficulty;
  for (const d of DIFFICULTIES) {
    const streak = Number(saved.streaks && saved.streaks[d]);
    const best = Number(saved.best && saved.best[d]);
    if (Number.isFinite(streak) && streak >= 0) out.streaks[d] = Math.floor(streak);
    if (Number.isFinite(best) && best >= 0) out.best[d] = Math.floor(best);
    const stats = saved.stats && saved.stats[d];
    if (stats && typeof stats === 'object') {
      for (const k of ['w', 'l', 'd']) {
        const n = Number(stats[k]);
        if (Number.isFinite(n) && n >= 0) out.stats[d][k] = Math.floor(n);
      }
    }
  }
  out.tutorialDone = saved.tutorialDone === true;
  out.muted = saved.muted === true;
  out.live = DIFFICULTIES.includes(saved.live) ? saved.live : null;
  return out;
}

const HUD_CSS = `
.qtt-hud, .qtt-modal { font-family: ${FONT_FAMILY}; color: ${C.ink}; -webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent; -webkit-font-smoothing: antialiased; }
.qtt-hud *, .qtt-modal * { box-sizing: border-box; }
.qtt-top { position: absolute; left: 0; display: flex; flex-direction: column; align-items: center; gap: 6px; text-align: center; }
.qtt-row { width: 100%; display: flex; justify-content: space-between; align-items: center; min-height: 22px; }
.qtt-kicker { font-size: 11px; font-weight: 800; letter-spacing: 1.8px; text-transform: uppercase; color: ${C.muted}; }
.qtt-chip { font-size: 12px; font-weight: 800; letter-spacing: 0.3px; color: ${C.amber}; background: rgba(245,181,68,0.13); padding: 4px 10px; border-radius: 999px; }
.qtt-chip.is-best { color: ${C.muted}; background: rgba(255,255,255,0.06); }
.qtt-status { font-size: 22px; font-weight: 800; letter-spacing: 0.2px; line-height: 28px; min-height: 28px; max-height: 56px; overflow: hidden; }
.qtt-status .qtt-x { color: ${C.x}; } .qtt-status .qtt-o { color: ${C.o}; } .qtt-status .qtt-amber { color: ${C.amber}; }
.qtt-hint { font-size: 14px; font-weight: 500; color: ${C.muted}; line-height: 19px; min-height: 19px; max-width: 100%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.qtt-seg { display: flex; gap: 3px; padding: 3px; background: rgba(255,255,255,0.06); border-radius: 999px; pointer-events: auto; margin-top: 4px; }
.qtt-seg button { all: unset; display: inline-block; cursor: pointer; padding: 7px 0; width: 76px; border-radius: 999px; font-size: 13px; font-weight: 700; color: ${C.muted}; text-align: center; }
.qtt-seg button.is-active { background: ${C.ink}; color: #0B1020; }
.qtt-seg button:active { opacity: 0.8; }
.qtt-bottom { position: absolute; }
.qtt-actions { position: absolute; left: 0; right: 0; bottom: 0; display: flex; align-items: center; gap: 10px; }
.qtt-spacer { flex: 1; }
.qtt-icon { all: unset; display: flex; pointer-events: auto; width: 44px; height: 44px; border-radius: 999px; background: rgba(255,255,255,0.07); align-items: center; justify-content: center; color: ${C.ink}; cursor: pointer; }
.qtt-icon svg { width: 20px; height: 20px; display: block; }
.qtt-text { all: unset; display: inline-block; pointer-events: auto; padding: 12px 18px; border-radius: 999px; background: rgba(255,255,255,0.07); font-size: 14px; font-weight: 700; color: ${C.ink}; cursor: pointer; }
.qtt-primary { all: unset; display: block; pointer-events: auto; padding: 13px 22px; border-radius: 999px; background: ${C.amber}; color: #1A1206; font-size: 15px; font-weight: 800; letter-spacing: 0.3px; cursor: pointer; text-align: center; }
.qtt-icon:active, .qtt-text:active, .qtt-primary:active { transform: scale(0.97); opacity: 0.9; }
.qtt-commit { position: absolute; left: 0; right: 0; }
.qtt-skipwrap { position: absolute; left: 0; right: 0; bottom: 0; display: flex; justify-content: center; }
.qtt-toast { position: absolute; left: 50%; transform: translateX(-50%); padding: 8px 14px; border-radius: 999px; background: rgba(20,27,45,0.94); border: 1px solid rgba(255,255,255,0.08); color: ${C.ink}; font-size: 13px; font-weight: 600; opacity: 0; transition: opacity 220ms; pointer-events: none; white-space: nowrap; }
.qtt-toast.is-on { opacity: 1; }
.qtt-backdrop { position: absolute; inset: 0; background: rgba(4,7,14,0.55); opacity: 0; visibility: hidden; transition: opacity 200ms, visibility 0s linear 200ms; pointer-events: none; }
.qtt-backdrop.is-open { opacity: 1; visibility: visible; transition: opacity 200ms, visibility 0s; pointer-events: auto; }
.qtt-sheet { position: absolute; left: 16px; right: 16px; background: rgba(15,22,42,0.97); border: 1px solid rgba(255,255,255,0.09); border-radius: 22px; padding: 18px 18px 16px; pointer-events: none; visibility: hidden; transform: translateY(28px); opacity: 0; transition: transform 280ms cubic-bezier(.2,.8,.2,1), opacity 220ms, visibility 0s linear 280ms; box-shadow: 0 18px 50px rgba(0,0,0,0.5); }
.qtt-sheet.is-open { transform: none; opacity: 1; visibility: visible; pointer-events: auto; transition: transform 280ms cubic-bezier(.2,.8,.2,1), opacity 220ms, visibility 0s; }
.qtt-sheet-title { font-size: 26px; font-weight: 800; letter-spacing: 0.2px; }
.qtt-sheet-title.is-x { color: ${C.x}; } .qtt-sheet-title.is-o { color: ${C.o}; }
.qtt-sheet-sub { margin-top: 4px; font-size: 14px; font-weight: 600; color: ${C.muted}; line-height: 19px; }
.qtt-sheet-stats { margin-top: 2px; font-size: 12px; font-weight: 600; color: ${C.muted}; opacity: 0.85; }
.qtt-board { margin-top: 14px; padding: 12px 14px; border-radius: 14px; background: rgba(255,255,255,0.04); }
.qtt-board-head { display: flex; justify-content: space-between; font-size: 11px; font-weight: 800; letter-spacing: 1.2px; text-transform: uppercase; color: ${C.muted}; }
.qtt-board-rows { margin-top: 8px; display: flex; flex-direction: column; gap: 6px; }
.qtt-board-row { display: flex; align-items: center; gap: 10px; font-size: 14px; font-weight: 600; }
.qtt-board-row .qtt-rank { width: 26px; color: ${C.muted}; font-weight: 800; }
.qtt-board-row .qtt-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.qtt-board-row .qtt-val { font-weight: 800; color: ${C.amber}; }
.qtt-board-row.is-you { color: ${C.ink}; } .qtt-board-row.is-you .qtt-rank { color: ${C.amber}; }
.qtt-board-note { margin-top: 6px; font-size: 12px; color: ${C.muted}; }
.qtt-sheet-actions { margin-top: 14px; display: flex; gap: 10px; align-items: center; }
.qtt-sheet-actions .qtt-primary { flex: 1; }
.qtt-rules-title { font-size: 20px; font-weight: 800; }
.qtt-rules ul { margin: 12px 0 0; padding: 0 0 0 18px; display: flex; flex-direction: column; gap: 9px; font-size: 14px; line-height: 20px; color: ${C.ink}; font-weight: 500; }
.qtt-rules li::marker { color: ${C.amber}; }
.qtt-rules b.qtt-x { color: ${C.x}; } .qtt-rules b.qtt-o { color: ${C.o}; } .qtt-rules b.qtt-amber { color: ${C.amber}; }
.is-hidden { display: none !important; }
`;

const SPEAKER_ON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
const SPEAKER_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H3v6h3l5 4V5z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/></svg>';
const HELP_GLYPH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7"/><path d="M12 17h.01"/></svg>';

window.plethoraBit = {
  async init(ctx) {
    // ------------------------------------------------------------------
    // Host, surfaces, state
    // ------------------------------------------------------------------
    let disposed = false;
    ctx.onDestroy(() => {
      // A debounced save must not die with the runtime: write it now.
      if (saveQueued && profileLoaded) writeProfile();
      disposed = true;
    });

    const reduceMotion = prefersReducedMotion();
    const area = () => ctx.contentSafeArea ?? ctx.safeArea;

    const bg = ctx.createCanvas2D({ layer: 'background', input: 'passthrough', coordinateSpace: 'css', maxDpr: 2 });
    const bgCtx = bg.getContext('2d');
    const canvas = ctx.createCanvas2D({ layer: 'content', coordinateSpace: 'css', maxDpr: 2 });
    const g = canvas.getContext('2d');
    const hud = ctx.createRoot({ layer: 'overlay', input: 'passthrough', className: 'qtt-hud' });
    const modal = ctx.createRoot({ layer: 'modal', input: 'passthrough', className: 'qtt-modal' });

    const tuneChoice = (id, fallback) => {
      try {
        const v = ctx.tune && ctx.tune.choice(id);
        return v === undefined ? fallback : v;
      } catch (_) {
        return fallback;
      }
    };
    const tuneNumber = (getter, id, fallback) => {
      try {
        const v = ctx.tune && ctx.tune[getter](id);
        return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
      } catch (_) {
        return fallback;
      }
    };
    const knobs = {
      hardThinkMs: () => tuneNumber('integer', 'hard_think_ms', 350),
      pauseMs: () => tuneNumber('durationMs', 'computer_pause_ms', 520),
      glow: () => tuneNumber('percent', 'thread_glow', 0.7),
      musicVolume: () => tuneNumber('percent', 'music_volume', 0.35),
    };

    let profile = freshProfile(tuneChoice('default_difficulty', 'medium'));
    let difficulty = profile.difficulty;
    // The saved profile is the source of truth for streaks and records. Until
    // it has been read, nothing is written back (a fresh profile must never
    // overwrite a returning viewer's data), and choices made meanwhile are
    // kept and merged in when the read lands.
    let profileLoaded = false;
    const preLoad = { difficulty: null, muted: null };

    // Game state ---------------------------------------------------------
    let snapshot = createInitialQuantumSnapshot();
    let selected = null; // first cell of a half-placed spooky mark
    let gameId = 0; // fences async work (AI timers, leaderboard reads) to one game
    let started = false; // ctx.platform.start() sent for this game
    let now = 0; // loop clock in ms
    let measuring = null; // { chooser, preview, at, cycleEdgeIds } while phase === 'choosingCollapse'
    let ai = { at: null, thinking: false, dots: -1, staged: null }; // computer scheduling: wall-clock deadline, staged measurement
    let winAt = null;
    let tutorial = null; // coached first game state
    let resultOpen = false;
    let rulesOpen = false;

    // Animation bookkeeping (ids and cells → birth time on the loop clock).
    const markBorn = new Map();
    const solidBorn = new Map();
    let fading = null; // { at, marks: SpookyMark[] } ghosts/threads leaving after a collapse
    let lastCollapsed = null; // { at, cells: Set } amber flash on freshly measured cells
    let toastUntil = 0;

    // Layout -------------------------------------------------------------
    let L = null;
    let stars = [];

    // ------------------------------------------------------------------
    // HUD DOM
    // ------------------------------------------------------------------
    hud.innerHTML = `<style>${HUD_CSS}</style>
      <div class="qtt-top">
        <div class="qtt-row"><div class="qtt-kicker">Quantum Tic Tac Toe</div><div class="qtt-chip is-hidden"></div></div>
        <div class="qtt-status"></div>
        <div class="qtt-hint"></div>
        <div class="qtt-seg" role="group" aria-label="Difficulty">
          <button type="button" data-d="easy">Easy</button>
          <button type="button" data-d="medium">Medium</button>
          <button type="button" data-d="hard">Hard</button>
        </div>
      </div>
      <div class="qtt-toast" role="status"></div>
      <div class="qtt-bottom">
        <div class="qtt-actions">
          <button type="button" class="qtt-icon qtt-sound" aria-label="Sound">${SPEAKER_ON}</button>
          <button type="button" class="qtt-icon qtt-help" aria-label="How to play">${HELP_GLYPH}</button>
          <span class="qtt-spacer"></span>
          <button type="button" class="qtt-text qtt-new">New game</button>
        </div>
        <button type="button" class="qtt-primary qtt-commit is-hidden">Collapse</button>
        <div class="qtt-skipwrap is-hidden"><button type="button" class="qtt-text qtt-skip">Skip walkthrough</button></div>
      </div>`;
    const el = {
      top: hud.querySelector('.qtt-top'),
      chip: hud.querySelector('.qtt-chip'),
      status: hud.querySelector('.qtt-status'),
      hint: hud.querySelector('.qtt-hint'),
      seg: hud.querySelector('.qtt-seg'),
      segButtons: Array.from(hud.querySelectorAll('.qtt-seg button')),
      toast: hud.querySelector('.qtt-toast'),
      bottom: hud.querySelector('.qtt-bottom'),
      actions: hud.querySelector('.qtt-actions'),
      sound: hud.querySelector('.qtt-sound'),
      help: hud.querySelector('.qtt-help'),
      newGame: hud.querySelector('.qtt-new'),
      commit: hud.querySelector('.qtt-commit'),
      skipWrap: hud.querySelector('.qtt-skipwrap'),
      skip: hud.querySelector('.qtt-skip'),
    };

    modal.innerHTML = `
      <div class="qtt-backdrop"></div>
      <div class="qtt-sheet qtt-result">
        <div class="qtt-sheet-title"></div>
        <div class="qtt-sheet-sub"></div>
        <div class="qtt-sheet-stats"></div>
        <div class="qtt-board is-hidden">
          <div class="qtt-board-head"><span class="qtt-board-name"></span><span class="qtt-board-state"></span></div>
          <div class="qtt-board-rows"></div>
          <div class="qtt-board-note is-hidden"></div>
        </div>
        <div class="qtt-sheet-actions"><button type="button" class="qtt-text qtt-view">View board</button><button type="button" class="qtt-primary qtt-again">Play again</button></div>
      </div>
      <div class="qtt-sheet qtt-rules">
        <div class="qtt-rules-title">How to play</div>
        <ul>
          <li>Each move places a <b class="qtt-amber">spooky mark</b>: your symbol in two cells at once, numbered by move. Any cell without a solid mark is open, even if spooky marks sit in it.</li>
          <li>Marks that share a cell are <b class="qtt-amber">entangled</b>. The threads show the links.</li>
          <li>Close a <b class="qtt-amber">loop</b> of threads and the loop collapses: every mark in it, plus any marks hanging off it, lands in one cell and turns solid.</li>
          <li>Whoever did <b>not</b> close the loop picks which of the two outcomes happens. Amber rings warn you when a second tap would close a loop.</li>
          <li>Three solid marks in a line wins. If one collapse completes a line for both players, compare each line's newest move number: the lower one wins.</li>
          <li>When only one open cell is left, a move simply fills it.</li>
        </ul>
        <div class="qtt-sheet-actions"><button type="button" class="qtt-text qtt-replay-tour">Replay walkthrough</button><button type="button" class="qtt-primary qtt-close-rules">Got it</button></div>
      </div>`;
    const md = {
      backdrop: modal.querySelector('.qtt-backdrop'),
      result: modal.querySelector('.qtt-result'),
      title: modal.querySelector('.qtt-sheet-title'),
      sub: modal.querySelector('.qtt-sheet-sub'),
      stats: modal.querySelector('.qtt-sheet-stats'),
      board: modal.querySelector('.qtt-board'),
      boardName: modal.querySelector('.qtt-board-name'),
      boardState: modal.querySelector('.qtt-board-state'),
      boardRows: modal.querySelector('.qtt-board-rows'),
      boardNote: modal.querySelector('.qtt-board-note'),
      again: modal.querySelector('.qtt-again'),
      view: modal.querySelector('.qtt-view'),
      rules: modal.querySelector('.qtt-rules'),
      replayTour: modal.querySelector('.qtt-replay-tour'),
      closeRules: modal.querySelector('.qtt-close-rules'),
    };

    // ------------------------------------------------------------------
    // Layout: everything actionable sits inside the content safe area.
    // ------------------------------------------------------------------
    function layout() {
      const W = ctx.width;
      const H = ctx.height;
      const a = area();
      const padX = 20;
      const headerH = 158; // room for a two-line headline above the difficulty pills
      // Short phones get a tighter measurement zone so the board keeps its size.
      const short = H - a.top - a.bottom < 640;
      const cardH = short ? 98 : 114;
      const footerH = cardH + 10 + 44 + 10;
      const top = a.top + 8;
      const bottom = H - a.bottom - 8;
      const boardTop = top + headerH + 8;
      const boardBottom = bottom - footerH - 8;
      const avail = Math.max(150, boardBottom - boardTop);
      const maxW = Math.min(W - padX * 2, 392);
      const size = Math.max(150, Math.min(maxW, avail));
      const bx = (W - size) / 2;
      const by = boardTop + (avail - size) / 2;
      const gap = Math.round(size * 0.034);
      const cell = (size - gap * 2) / 3;
      // The footer (cards, commit button, action row) keeps the full width even
      // when a short screen shrinks the board, so buttons never wrap.
      const fx = (W - maxW) / 2;
      const footerY = boardBottom + 8;
      const cardGap = 10;
      const cardW = (maxW - cardGap) / 2;
      L = {
        W,
        H,
        board: { x: bx, y: by, size, gap, cell, r: Math.max(10, cell * 0.16) },
        footer: { x: fx, y: footerY, w: maxW, h: footerH },
        cards: [
          { x: fx, y: footerY, w: cardW, h: cardH },
          { x: fx + cardW + cardGap, y: footerY, w: cardW, h: cardH },
        ],
        commitY: footerY + cardH + 10,
        top,
        headerH,
        bottom,
      };

      el.top.style.top = `${top}px`;
      el.top.style.width = `${W}px`;
      el.top.style.padding = `0 ${padX}px`;
      el.toast.style.top = `${footerY + 10}px`;
      el.bottom.style.left = `${fx}px`;
      el.bottom.style.top = `${footerY}px`;
      el.bottom.style.width = `${maxW}px`;
      el.bottom.style.height = `${footerH}px`;
      el.commit.style.top = `${L.commitY - footerY}px`;
      const sheetBottom = a.bottom + 12;
      md.result.style.bottom = `${sheetBottom}px`;
      md.rules.style.bottom = `${sheetBottom}px`;
      const sheetSide = Math.max(16, (W - 440) / 2);
      md.result.style.left = `${sheetSide}px`;
      md.result.style.right = `${sheetSide}px`;
      md.rules.style.left = `${sheetSide}px`;
      md.rules.style.right = `${sheetSide}px`;

      paintBackground();
    }

    function paintBackground() {
      const W = L.W;
      const H = L.H;
      const grad = bgCtx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, C.bg);
      grad.addColorStop(0.45, C.bgMid);
      grad.addColorStop(1, C.bgLow);
      bgCtx.fillStyle = grad;
      bgCtx.fillRect(0, 0, W, H);

      // A soft indigo nebula behind the board.
      const b = L.board;
      const cx = b.x + b.size / 2;
      const cy = b.y + b.size / 2;
      const glow = bgCtx.createRadialGradient(cx, cy, b.size * 0.1, cx, cy, b.size * 1.05);
      glow.addColorStop(0, 'rgba(99,102,241,0.20)');
      glow.addColorStop(0.55, 'rgba(99,102,241,0.07)');
      glow.addColorStop(1, 'rgba(99,102,241,0)');
      bgCtx.fillStyle = glow;
      bgCtx.fillRect(0, 0, W, H);

      // Sparse star field, deterministic so the sky is the same every visit.
      const rand = mulberry32(20261102);
      const count = Math.round((W * H) / 5200);
      stars = [];
      for (let i = 0; i < count; i += 1) {
        stars.push({ x: rand() * W, y: rand() * H, r: 0.4 + rand() * 1.2, a: 0.18 + rand() * 0.55 });
      }
      for (const s of stars) {
        bgCtx.fillStyle = `rgba(226,232,255,${s.a.toFixed(3)})`;
        bgCtx.beginPath();
        bgCtx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        bgCtx.fill();
      }
    }

    // ------------------------------------------------------------------
    // Geometry helpers
    // ------------------------------------------------------------------
    const cellOrigin = (index) => {
      const b = L.board;
      return { x: b.x + (index % 3) * (b.cell + b.gap), y: b.y + Math.floor(index / 3) * (b.cell + b.gap) };
    };
    const cellCenter = (index) => {
      const o = cellOrigin(index);
      return { x: o.x + L.board.cell / 2, y: o.y + L.board.cell / 2 };
    };
    const hitCell = (x, y) => {
      for (let i = 0; i < 9; i += 1) {
        const o = cellOrigin(i);
        if (x >= o.x && x <= o.x + L.board.cell && y >= o.y && y <= o.y + L.board.cell) return i;
      }
      return null;
    };
    const inRect = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
    const inBoard = (x, y) => {
      const b = L.board;
      return x >= b.x && x <= b.x + b.size && y >= b.y && y <= b.y + b.size;
    };

    function roundRect(c, x, y, w, h, r) {
      const rr = Math.min(r, w / 2, h / 2);
      c.beginPath();
      c.moveTo(x + rr, y);
      c.arcTo(x + w, y, x + w, y + h, rr);
      c.arcTo(x + w, y + h, x, y + h, rr);
      c.arcTo(x, y + h, x, y, rr);
      c.arcTo(x, y, x + w, y, rr);
      c.closePath();
    }

    /** Draws "X" + subscript centred on (x, y); size is the letter's font size. */
    function drawMark(c, player, subscript, x, y, size, color, alpha, scale) {
      c.save();
      c.globalAlpha = alpha;
      c.translate(x, y);
      if (scale !== 1) c.scale(scale, scale);
      c.textBaseline = 'middle';
      c.textAlign = 'left';
      c.font = `800 ${size}px ${FONT_FAMILY}`;
      const letterW = c.measureText(player).width;
      const subSize = Math.max(7, size * 0.46);
      c.font = `700 ${subSize}px ${FONT_FAMILY}`;
      const subText = String(subscript);
      const subW = c.measureText(subText).width;
      const total = letterW + subW * 0.9;
      const x0 = -total / 2;
      c.fillStyle = color;
      c.font = `800 ${size}px ${FONT_FAMILY}`;
      c.fillText(player, x0, 0);
      c.font = `700 ${subSize}px ${FONT_FAMILY}`;
      c.fillStyle = color;
      c.globalAlpha = alpha * 0.85;
      c.fillText(subText, x0 + letterW + subW * 0.05, size * 0.32);
      c.restore();
    }

    // ------------------------------------------------------------------
    // Derived state
    // ------------------------------------------------------------------
    const playerColor = (p) => (p === HUMAN ? C.x : C.o);
    const isAiTurn = () => snapshot.phase !== 'gameover' && decisionMaker(snapshot) === COMPUTER;
    const humanChoosing = () => snapshot.phase === 'choosingCollapse' && snapshot.pending && snapshot.pending.chooser === HUMAN;
    const breath = (period, phase) => (reduceMotion ? 0.5 : 0.5 + 0.5 * Math.sin((now / period) * Math.PI * 2 + phase));

    /** Cells and marks entangled with the half-placed selection (touch has no hover). */
    function highlightFor() {
      if (selected === null || snapshot.phase !== 'placing') return null;
      const h = entanglementHighlight(snapshot, selected);
      return h.cells.length ? { cells: new Set(h.cells), edges: new Set(h.edgeIds) } : null;
    }

    /** Open cells that, paired with the selection, would close a loop and hand the choice away. */
    function loopClosersFor(sel) {
      const out = new Set();
      if (sel === null || snapshot.phase !== 'placing') return out;
      for (let c = 0; c < 9; c += 1) {
        if (c === sel || snapshot.collapsed[c]) continue;
        if (placeSpooky(snapshot, sel, c).phase === 'choosingCollapse') out.add(c);
      }
      return out;
    }

    /** Completed lines for a player on the current classical board. */
    const linesFor = (player) => WIN_LINES.filter((line) => line.every((i) => snapshot.collapsed[i] && snapshot.collapsed[i].player === player));
    const newestOf = (line) => Math.max(...line.map((i) => snapshot.collapsed[i].subscript));

    /** Whether the two measurement outcomes put the same player in every cell (only move numbers differ). */
    function outcomesLookAlike() {
      if (!snapshot.pending) return false;
      const [a, b] = snapshot.pending.options;
      return snapshot.pending.componentCells.every((c) => a.assignment[c] && b.assignment[c] && a.assignment[c].player === b.assignment[c].player);
    }

    // ------------------------------------------------------------------
    // Rendering
    // ------------------------------------------------------------------
    function render() {
      const W = L.W;
      const H = L.H;
      g.clearRect(0, 0, W, H);
      drawBoard();
      if (measuring && humanChoosing()) drawOptionCards();
    }

    function drawBoard() {
      const b = L.board;
      const highlight = highlightFor();
      const gameOver = snapshot.phase === 'gameover';
      const winnerLines = gameOver && snapshot.winner && snapshot.winner !== 'draw' ? linesFor(snapshot.winner) : [];
      const loserLines = gameOver && snapshot.winByTieBreak ? linesFor(snapshot.winner === HUMAN ? COMPUTER : HUMAN) : [];
      const winCells = winnerLines.length ? new Set([].concat(...winnerLines, ...loserLines)) : null;
      const showPreview = measuring && snapshot.pending && (humanChoosing() || measuring.pickedAt);
      const preview = showPreview ? snapshot.pending.options[measuring.preview].assignment : null;
      const pendingCells = snapshot.pending ? new Set(snapshot.pending.componentCells) : null;
      const flashEdges = snapshot.pending ? new Set(snapshot.pending.cyclicEdgeIds) : null;
      const tutorialCells = tutorial && tutorial.ringCells ? tutorial.ringCells : null;
      const loopCells = selected !== null && !gameOver ? loopClosersFor(selected) : null;

      // Cells -------------------------------------------------------------
      for (let i = 0; i < 9; i += 1) {
        const o = cellOrigin(i);
        const lit = (highlight && highlight.cells.has(i)) || (pendingCells && pendingCells.has(i));
        g.fillStyle = lit ? C.cellLit : C.cell;
        roundRect(g, o.x, o.y, b.cell, b.cell, b.r);
        g.fill();
        // Glass highlight along the top edge.
        const sheen = g.createLinearGradient(0, o.y, 0, o.y + b.cell);
        sheen.addColorStop(0, C.cellTop);
        sheen.addColorStop(0.5, 'rgba(255,255,255,0)');
        g.fillStyle = sheen;
        g.fill();
        g.lineWidth = 1;
        g.strokeStyle = C.cellLine;
        g.stroke();
        if (highlight && highlight.cells.has(i)) {
          g.fillStyle = rgba(C.amber, 0.09);
          g.fill();
        }
        if (pendingCells && pendingCells.has(i) && !gameOver) {
          g.fillStyle = rgba(C.amber, 0.05 + 0.05 * breath(T.threadBreath, 0));
          g.fill();
        }
        if (lastCollapsed && lastCollapsed.cells.has(i)) {
          const k = clamp01((now - lastCollapsed.at) / T.collapse);
          if (k < 1) {
            g.fillStyle = rgba(C.amber, 0.28 * (1 - k));
            g.fill();
          }
        }
        if (selected === i) {
          g.lineWidth = 2;
          g.strokeStyle = rgba(C.ink, 0.9);
          roundRect(g, o.x + 1, o.y + 1, b.cell - 2, b.cell - 2, b.r - 1);
          g.stroke();
        }
        if (tutorialCells && tutorialCells.has(i)) {
          const k = breath(1100, i);
          g.lineWidth = 2.5;
          g.strokeStyle = rgba(C.amber, 0.45 + 0.5 * k);
          roundRect(g, o.x - 3, o.y - 3, b.cell + 6, b.cell + 6, b.r + 3);
          g.stroke();
        } else if (loopCells && loopCells.has(i)) {
          // Pairing the selection with this cell closes a loop: the computer would choose.
          g.save();
          g.setLineDash([6, 5]);
          g.lineWidth = 2;
          g.strokeStyle = rgba(C.amber, 0.55 + 0.3 * breath(1300, i));
          roundRect(g, o.x + 2, o.y + 2, b.cell - 4, b.cell - 4, b.r - 2);
          g.stroke();
          g.restore();
        }
      }

      // Threads (under the marks) ----------------------------------------
      // Threads between non-adjacent cells bow sideways so they do not read as
      // passing through the cell in between; marks on the same pair of cells
      // (a two-mark loop) are drawn side by side instead of on top of each other.
      const glow = knobs.glow();
      const pairIndex = new Map();
      const pairCount = new Map();
      for (const mark of snapshot.spooky) {
        const key = `${mark.cells[0]}-${mark.cells[1]}`;
        pairIndex.set(mark.id, pairCount.get(key) || 0);
        pairCount.set(key, (pairCount.get(key) || 0) + 1);
      }
      const threadPoints = (mark, grow) => {
        const a = cellCenter(mark.cells[0]);
        const c2 = cellCenter(mark.cells[1]);
        const dx = c2.x - a.x;
        const dy = c2.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const colA = mark.cells[0] % 3;
        const rowA = Math.floor(mark.cells[0] / 3);
        const colB = mark.cells[1] % 3;
        const rowB = Math.floor(mark.cells[1] / 3);
        const far = Math.max(Math.abs(colA - colB), Math.abs(rowA - rowB)) >= 2;
        const key = `${mark.cells[0]}-${mark.cells[1]}`;
        const count = pairCount.get(key) || 1;
        const index = pairIndex.get(mark.id) || 0;
        const shift = count > 1 ? (index - (count - 1) / 2) * 7 : 0;
        const bow = far ? L.board.cell * 0.42 * (mark.id % 2 === 0 ? 1 : -1) : 0;
        const pts = [];
        if (!far) {
          const sx = nx * shift;
          const sy = ny * shift;
          pts.push({ x: a.x + sx, y: a.y + sy });
          pts.push({ x: lerp(a.x, c2.x, grow) + sx, y: lerp(a.y, c2.y, grow) + sy });
          return pts;
        }
        const cx = (a.x + c2.x) / 2 + nx * (bow + shift);
        const cy = (a.y + c2.y) / 2 + ny * (bow + shift);
        const steps = 18;
        for (let i = 0; i <= steps; i += 1) {
          const t = (i / steps) * grow;
          const u = 1 - t;
          pts.push({ x: u * u * a.x + 2 * u * t * cx + t * t * c2.x, y: u * u * a.y + 2 * u * t * cy + t * t * c2.y });
        }
        return pts;
      };
      const strokePoints = (pts) => {
        g.beginPath();
        g.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i += 1) g.lineTo(pts[i].x, pts[i].y);
        g.stroke();
      };
      const drawThread = (mark, alphaMul, grow) => {
        const flashing = flashEdges && flashEdges.has(mark.id) && !gameOver;
        const lit = highlight && highlight.edges.has(mark.id);
        const color = flashing || lit ? C.amber : playerColor(mark.player);
        const t = breath(T.threadBreath, mark.id * 0.7);
        let alpha = flashing ? 0.72 + 0.28 * t : lit ? 0.55 + 0.25 * t : 0.34 + 0.24 * t;
        alpha *= alphaMul;
        const width = flashing ? 4 : lit ? 3.2 : 2.5;
        const pts = threadPoints(mark, grow);
        g.lineCap = 'round';
        g.lineJoin = 'round';
        if (glow > 0) {
          g.strokeStyle = rgba(color, alpha * 0.22 * glow);
          g.lineWidth = width + 7 * glow;
          strokePoints(pts);
        }
        g.strokeStyle = rgba(color, alpha);
        g.lineWidth = width;
        strokePoints(pts);
      };
      for (const mark of snapshot.spooky) {
        const born = markBorn.get(mark.id);
        const grow = born === undefined || reduceMotion ? 1 : Math.max(0.02, easeOutCubic((now - born) / T.thread));
        drawThread(mark, 1, grow);
      }
      if (fading) {
        const k = clamp01((now - fading.at) / T.fade);
        if (k >= 1) fading = null;
        else for (const mark of fading.marks) drawThread(mark, 1 - k, 1);
      }

      // Marks --------------------------------------------------------------
      const ghostsByCell = new Map();
      for (const mark of snapshot.spooky) {
        for (const cell of mark.cells) {
          if (!ghostsByCell.has(cell)) ghostsByCell.set(cell, []);
          ghostsByCell.get(cell).push(mark);
        }
      }
      if (fading) {
        const k = clamp01((now - fading.at) / T.fade);
        for (const mark of fading.marks) {
          for (const cell of mark.cells) {
            if (snapshot.collapsed[cell] && !lastCollapsed) continue;
            const list = ghostsByCell.get(cell) || [];
            list.push(Object.assign({}, mark, { fadeAlpha: 1 - k }));
            ghostsByCell.set(cell, list);
          }
        }
      }

      for (let i = 0; i < 9; i += 1) {
        const centre = cellCenter(i);
        const classical = snapshot.collapsed[i];
        const dim = gameOver && winCells && !winCells.has(i) ? 0.35 : gameOver && !winCells ? 0.55 : 1;
        if (classical) {
          const born = solidBorn.get(i);
          const k = born === undefined || reduceMotion ? 1 : clamp01((now - born) / T.pop);
          const scale = reduceMotion ? 1 : lerp(1.32, 1, easeOutBack(k));
          const flashK = born === undefined ? 1 : clamp01((now - born) / 460);
          const color = flashK < 1 ? blend(C.amber, playerColor(classical.player), flashK) : playerColor(classical.player);
          const ghostsHere = ghostsByCell.get(i);
          if (ghostsHere) {
            // Ghosts leaving a freshly collapsed cell fade under the solid mark.
            drawGhostRing(centre, ghostsHere, 1);
          }
          drawMark(g, classical.player, classical.subscript, centre.x, centre.y, L.board.cell * 0.46, color, dim, scale);
          continue;
        }
        if (preview && preview[i]) {
          drawMark(g, preview[i].player, preview[i].subscript, centre.x, centre.y, L.board.cell * 0.46, playerColor(preview[i].player), 0.72, 1);
          continue;
        }
        const ghosts = ghostsByCell.get(i);
        if (ghosts && ghosts.length) drawGhostRing(centre, ghosts, dim);
      }

      // Win lines ----------------------------------------------------------
      // Every completed line of the winner is struck through; on a tie-break
      // the loser's completed line is shown too, thin and dashed, so the
      // player can see what was compared.
      if (gameOver && winnerLines.length && winAt !== null) {
        const k = reduceMotion ? 1 : easeOutCubic((now - winAt - 180) / T.winLine);
        if (k > 0) {
          g.lineCap = 'round';
          for (const line of winnerLines) {
            const a = cellCenter(line[0]);
            const c2 = cellCenter(line[2]);
            const color = playerColor(snapshot.winner);
            g.strokeStyle = rgba(color, 0.22);
            g.lineWidth = 16;
            g.beginPath();
            g.moveTo(a.x, a.y);
            g.lineTo(lerp(a.x, c2.x, k), lerp(a.y, c2.y, k));
            g.stroke();
            g.strokeStyle = rgba(color, 0.95);
            g.lineWidth = 5;
            g.beginPath();
            g.moveTo(a.x, a.y);
            g.lineTo(lerp(a.x, c2.x, k), lerp(a.y, c2.y, k));
            g.stroke();
          }
          for (const line of loserLines) {
            const a = cellCenter(line[0]);
            const c2 = cellCenter(line[2]);
            const color = playerColor(snapshot.winner === HUMAN ? COMPUTER : HUMAN);
            g.save();
            g.setLineDash([10, 8]);
            g.strokeStyle = rgba(color, 0.6);
            g.lineWidth = 3;
            g.beginPath();
            g.moveTo(a.x, a.y);
            g.lineTo(lerp(a.x, c2.x, k), lerp(a.y, c2.y, k));
            g.stroke();
            g.restore();
          }
        }
      }
    }

    /** Superposed marks orbit the cell centre and breathe out of phase. */
    function drawGhostRing(centre, ghosts, dimMul) {
      const cell = L.board.cell;
      const ringR = cell * 0.27;
      const n = ghosts.length;
      const glyph = cell * (n > 4 ? 0.165 : 0.21);
      for (let j = 0; j < n; j += 1) {
        const mark = ghosts[j];
        const angle = (j / n) * Math.PI * 2 - Math.PI / 2;
        const t = breath(T.breath, j * 0.9 + mark.id * 0.3);
        const born = markBorn.get(mark.id);
        const pop = born === undefined || reduceMotion ? 1 : easeOutBack((now - born) / T.pop);
        const alpha = (0.52 + 0.3 * t) * (mark.fadeAlpha === undefined ? 1 : mark.fadeAlpha) * dimMul;
        const scale = (0.9 + 0.16 * t) * pop;
        const x = centre.x + Math.cos(angle) * ringR * (n === 1 ? 0 : 1);
        const y = centre.y + Math.sin(angle) * ringR * (n === 1 ? 0 : 1);
        drawMark(g, mark.player, mark.id, x, y, glyph * (n === 1 ? 1.25 : 1), playerColor(mark.player), alpha, scale);
      }
    }

    function blend(hexA, hexB, t) {
      const pa = parseInt(hexA.slice(1), 16);
      const pb = parseInt(hexB.slice(1), 16);
      const ch = (shift) => Math.round(lerp((pa >> shift) & 255, (pb >> shift) & 255, clamp01(t)));
      return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
    }

    /** The two measurement outcomes as tappable mini boards in the footer zone. */
    function drawOptionCards() {
      const pending = snapshot.pending;
      for (let i = 0; i < 2; i += 1) {
        const card = L.cards[i];
        const active = measuring.preview === i;
        const k = reduceMotion ? 1 : easeOutCubic((now - measuring.at) / 320);
        g.save();
        g.globalAlpha = k;
        g.translate(0, (1 - k) * 12);
        roundRect(g, card.x, card.y, card.w, card.h, 16);
        g.fillStyle = active ? '#141C33' : C.card;
        g.fill();
        g.lineWidth = active ? 2 : 1;
        g.strokeStyle = active ? rgba(C.amber, 0.95) : C.cardLine;
        g.stroke();

        g.font = `800 12px ${FONT_FAMILY}`;
        g.textAlign = 'left';
        g.textBaseline = 'top';
        g.fillStyle = active ? C.amber : C.muted;
        g.fillText(i === 0 ? 'OUTCOME A' : 'OUTCOME B', card.x + 12, card.y + 10);

        // Mini board: existing solids dim, this outcome's marks in colour, and
        // any line the outcome completes struck through in its owner's colour.
        const mini = 17;
        const mgap = 3;
        const mw = mini * 3 + mgap * 2;
        const mx = card.x + (card.w - mw) / 2;
        const my = card.y + 28;
        const assignment = pending.options[i].assignment;
        const after = resolveCollapse(snapshot, i);
        const cellAt = (c) => ({ x: mx + (c % 3) * (mini + mgap) + mini / 2, y: my + Math.floor(c / 3) * (mini + mgap) + mini / 2 });
        for (let c = 0; c < 9; c += 1) {
          const x = mx + (c % 3) * (mini + mgap);
          const y = my + Math.floor(c / 3) * (mini + mgap);
          roundRect(g, x, y, mini, mini, 4);
          const outcome = assignment[c];
          g.fillStyle = outcome ? rgba(C.amber, 0.14) : 'rgba(255,255,255,0.05)';
          g.fill();
          const mark = outcome || snapshot.collapsed[c];
          if (mark) {
            drawMark(g, mark.player, mark.subscript, x + mini / 2, y + mini / 2 + 0.5, 11, playerColor(mark.player), outcome ? 1 : 0.4, 1);
          }
        }
        for (const player of [HUMAN, COMPUTER]) {
          for (const line of WIN_LINES) {
            if (!line.every((c) => after.collapsed[c] && after.collapsed[c].player === player)) continue;
            const p0 = cellAt(line[0]);
            const p2 = cellAt(line[2]);
            g.strokeStyle = rgba(playerColor(player), 0.9);
            g.lineWidth = 2.5;
            g.lineCap = 'round';
            g.beginPath();
            g.moveTo(p0.x, p0.y);
            g.lineTo(p2.x, p2.y);
            g.stroke();
          }
        }
        // Caption: what this outcome means.
        let caption;
        let captionColor = C.muted;
        if (after.winner === HUMAN) {
          caption = after.winByTieBreak ? 'You win on the tie-break' : 'You win';
          captionColor = C.x;
        } else if (after.winner === COMPUTER) {
          caption = after.winByTieBreak ? 'Computer wins the tie-break' : 'Computer wins';
          captionColor = C.o;
        } else if (after.winner === 'draw') {
          caption = 'Draw';
        } else if (outcomesLookAlike()) {
          caption = 'Same board, move numbers differ';
        } else {
          caption = 'No line yet';
        }
        g.font = `700 11px ${FONT_FAMILY}`;
        g.textAlign = 'center';
        g.textBaseline = 'alphabetic';
        g.fillStyle = captionColor;
        g.fillText(caption, card.x + card.w / 2, card.y + card.h - 10, card.w - 16);
        g.restore();
      }
    }

    // ------------------------------------------------------------------
    // HUD text and controls
    // ------------------------------------------------------------------
    function setStatus(html, hint) {
      if (el.status.innerHTML !== html) el.status.innerHTML = html;
      if (el.hint.textContent !== hint) el.hint.textContent = hint;
    }

    function refreshHud() {
      // Difficulty pills
      for (const b of el.segButtons) b.classList.toggle('is-active', b.dataset.d === difficulty);
      // Streak chip
      const streak = profile.streaks[difficulty];
      const best = profile.best[difficulty];
      if (streak > 0) {
        el.chip.textContent = `Streak ${streak}`;
        el.chip.classList.remove('is-hidden', 'is-best');
      } else if (best > 0) {
        el.chip.textContent = `Best ${best}`;
        el.chip.classList.remove('is-hidden');
        el.chip.classList.add('is-best');
      } else {
        el.chip.classList.add('is-hidden');
      }
      // Footer controls
      const choosing = humanChoosing();
      const over = snapshot.phase === 'gameover';
      el.commit.classList.toggle('is-hidden', !choosing);
      el.actions.classList.toggle('is-hidden', choosing || !!tutorial || (over && resultOpen));
      el.newGame.textContent = over ? 'Play again' : 'New game';
      el.skipWrap.classList.toggle('is-hidden', !tutorial || choosing);
      el.sound.innerHTML = profile.muted ? SPEAKER_OFF : SPEAKER_ON;
      el.sound.setAttribute('aria-label', profile.muted ? 'Sound off. Tap to unmute' : 'Sound on. Tap to mute');
      if (choosing) el.commit.textContent = `Collapse · outcome ${measuring && measuring.preview === 1 ? 'B' : 'A'}`;
      refreshStatus();
    }

    function refreshStatus() {
      if (tutorial && tutorial.status) {
        setStatus(tutorial.status, tutorial.hint);
        return;
      }
      if (snapshot.phase === 'gameover') {
        if (snapshot.winner === 'draw') {
          setStatus('Draw', 'Nobody lined up three');
        } else if (snapshot.winner === HUMAN) {
          setStatus('<span class="qtt-x">You win!</span>', snapshot.winByTieBreak ? `Both lines closed at once: your newest move ${tieBreakMoves().yours} beats their ${tieBreakMoves().theirs}` : 'Three solid X in a line');
        } else {
          setStatus('<span class="qtt-o">Computer wins</span>', snapshot.winByTieBreak ? `Both lines closed at once: their newest move ${tieBreakMoves().theirs} beats your ${tieBreakMoves().yours}` : 'Three solid O in a line');
        }
        return;
      }
      if (snapshot.phase === 'choosingCollapse') {
        if (humanChoosing()) {
          setStatus('<span class="qtt-amber">A loop closed</span> · you choose', 'Compare the two outcomes, then collapse');
        } else if (measuring && measuring.pickedAt) {
          setStatus(`<span class="qtt-amber">The computer chose outcome ${measuring.preview === 1 ? 'B' : 'A'}</span>`, 'The marks settle where the preview shows them');
        } else {
          setStatus('<span class="qtt-amber">You closed a loop</span>', 'You closed it, so the computer picks the outcome');
        }
        return;
      }
      if (isAiTurn()) {
        const dots = Math.floor(now / 380) % 4;
        setStatus(`<span class="qtt-o">Computer</span> is thinking${'.'.repeat(dots)}`, 'Placing a spooky O');
        return;
      }
      const forced = forcedCell(snapshot);
      if (forced !== null) {
        setStatus('Your move', 'One open cell left: tap it to place a solid X');
      } else if (selected === null) {
        setStatus('Your move', snapshot.moveNumber === 0 ? 'Tap two cells: your X lands in both at once' : 'Tap two cells without a solid mark');
      } else if (loopClosersFor(selected).size) {
        setStatus('Your move', 'Second cell · amber = loop, computer picks');
      } else {
        setStatus('Your move', 'Tap a second cell to finish the spooky mark');
      }
    }

    /** The newest move number of each side's completed line, for tie-break explanations. */
    function tieBreakMoves() {
      const mine = linesFor(HUMAN).map(newestOf);
      const theirs = linesFor(COMPUTER).map(newestOf);
      return { yours: mine.length ? Math.min(...mine) : '?', theirs: theirs.length ? Math.min(...theirs) : '?' };
    }

    function toast(text) {
      el.toast.textContent = text;
      el.toast.classList.add('is-on');
      toastUntil = Date.now() + T.toast;
    }

    // ------------------------------------------------------------------
    // Audio and haptics
    // ------------------------------------------------------------------
    let music = null;
    let musicStarting = false;
    let musicUnlocked = false;
    const canMusic = () => !!(ctx.capabilities && ctx.capabilities.backgroundMusic);

    function startMusic() {
      if (!canMusic() || music || musicStarting || disposed) return;
      musicStarting = true;
      Promise.resolve()
        .then(() => ctx.music.unlock())
        .then(() => {
          if (disposed) return;
          musicUnlocked = true;
          music = ctx.music.play({
            preset: 'drift',
            volume: profile.muted ? 0 : knobs.musicVolume(),
            intensity: 0.3,
            density: 0.35,
            tempo: 68,
            scale: 'lydian',
            fadeInMs: 1400,
          });
        })
        .catch(() => {
          music = null;
        })
        .then(() => {
          musicStarting = false;
        });
    }

    function sting(name) {
      if (!music || !musicUnlocked || profile.muted || disposed) return;
      try {
        const p = ctx.music.sting(name);
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (_) {
        /* stings are decoration */
      }
    }

    function setMood(intensity) {
      if (!music) return;
      try {
        music.setIntensity(intensity, { fadeMs: 600 });
      } catch (_) {
        /* ignore */
      }
    }

    function applyMute() {
      if (!music) return;
      try {
        music.setVolume(profile.muted ? 0 : knobs.musicVolume(), { fadeMs: 240 });
      } catch (_) {
        /* ignore */
      }
    }

    function haptic(kind) {
      if (!ctx.capabilities || !ctx.capabilities.haptics) return;
      try {
        ctx.platform.haptic(kind);
      } catch (_) {
        /* device or settings may refuse */
      }
    }

    // ------------------------------------------------------------------
    // Persistence (viewer-private settings, streaks and the tutorial flag)
    // ------------------------------------------------------------------
    let saveQueued = false;
    function writeProfile() {
      try {
        const p = ctx.memory.local(PROFILE_CHANNEL).set(profile);
        if (p && typeof p.catch === 'function') p.catch(() => {});
      } catch (_) {
        /* memory may be unavailable for signed-out viewers */
      }
    }

    /** Persists the profile: debounced by default, immediately for results. Never before the saved profile was read. */
    function saveProfile(immediate) {
      if (!profileLoaded || disposed) return;
      if (immediate) {
        saveQueued = false;
        writeProfile();
        return;
      }
      if (saveQueued) return;
      saveQueued = true;
      ctx.timeout(() => {
        saveQueued = false;
        if (!disposed) writeProfile();
      }, 320);
    }

    const pause = (ms) => new Promise((resolve) => ctx.timeout(resolve, ms));

    /** Reads the saved profile, retrying transient failures; applies it whenever it lands. */
    async function loadProfile() {
      const delays = [0, 1200, 3500];
      for (let i = 0; i < delays.length; i += 1) {
        if (delays[i]) await pause(delays[i]);
        if (disposed) return;
        let res;
        try {
          res = await ctx.memory.local(PROFILE_CHANNEL).get();
        } catch (_) {
          continue; // retry; a fresh profile is never written over an unread one
        }
        if (disposed) return;
        applyLoadedProfile(res && res.value ? res.value : null);
        return;
      }
      // Every read failed: play on without persistence (nothing is written
      // over the unread profile) and coach whoever this is, Skip available.
      if (!disposed && !started && snapshot.moveNumber === 0 && !tutorial) {
        startTutorial();
        refreshHud();
      }
    }

    function applyLoadedProfile(saved) {
      const loaded = mergeProfile(freshProfile(tuneChoice('default_difficulty', 'medium')), saved);
      let dirty = false;
      // Choices made before the read landed win over the saved ones.
      if (preLoad.difficulty) {
        loaded.difficulty = preLoad.difficulty;
        dirty = true;
      }
      if (preLoad.muted !== null) {
        loaded.muted = preLoad.muted;
        dirty = true;
      }
      // A game left unfinished on an earlier visit ends that difficulty's streak.
      if (loaded.live) {
        if (loaded.streaks[loaded.live] > 0) loaded.streaks[loaded.live] = 0;
        loaded.live = null;
        dirty = true;
      }
      if (!loaded.tutorialDone && profile.tutorialDone) loaded.tutorialDone = true; // finished or skipped before the read landed
      profile = loaded;
      profileLoaded = true;
      const untouched = !started && snapshot.moveNumber === 0 && selected === null && !tutorial;
      if (untouched && !preLoad.difficulty) {
        setDifficulty(profile.difficulty, false);
      } else {
        profile.difficulty = difficulty; // never switch a game already in progress
        syncScore();
      }
      applyMute();
      if (!profile.tutorialDone && untouched) startTutorial();
      if (dirty) saveProfile();
      refreshHud();
    }

    // ------------------------------------------------------------------
    // Score track and leaderboard
    // ------------------------------------------------------------------
    const score = ctx.game.score({ initial: 0, min: 0 });
    const boardCache = { easy: null, medium: null, hard: null };

    function syncScore() {
      try {
        score.set(profile.streaks[difficulty], { reason: 'sync' });
      } catch (_) {
        /* ignore */
      }
    }

    function submitStreak(value, d) {
      const attempt = gameId;
      let p;
      try {
        p = score.submit(RECORD_CHANNEL, { label: `${value} in a row`, dimensions: { difficulty: d } });
      } catch (_) {
        return Promise.resolve(null);
      }
      return p
        .then((res) => (disposed || attempt !== gameId ? null : res))
        .catch(() => null);
    }

    function readBoard(d) {
      const attempt = gameId;
      let p;
      try {
        p = score.leaderboard(RECORD_CHANNEL, { scope: 'global', period: 'all_time', dimensions: { difficulty: d }, limit: 3 });
      } catch (_) {
        return Promise.reject(new Error('leaderboard unavailable'));
      }
      return p.then((board) => {
        if (disposed || attempt !== gameId) throw new Error('stale');
        boardCache[d] = board;
        return board;
      });
    }

    function renderBoard(d, board, state) {
      md.board.classList.remove('is-hidden');
      md.boardName.textContent = `Top streaks · ${DIFFICULTY_LABEL[d]}`;
      md.boardState.textContent = state;
      md.boardRows.innerHTML = '';
      md.boardNote.classList.add('is-hidden');
      if (!board) {
        md.boardNote.textContent = state === 'Updating' ? 'Fetching the board…' : 'Leaderboard unavailable right now';
        md.boardNote.classList.remove('is-hidden');
        return;
      }
      const rows = Array.isArray(board.rows) ? board.rows.slice(0, 3) : [];
      const viewer = board.viewerRank && typeof board.viewerRank.rank === 'number' ? board.viewerRank : null;
      const you = ctx.viewer && ctx.viewer.username ? ctx.viewer.username : '';
      const viewerId = viewer && viewer.userId != null ? viewer.userId : null;
      // Identify the viewer's row by who they are, never by rank: ranks tie.
      const isYou = (r) => !!viewer && (viewerId !== null ? r.userId === viewerId : !!you && r.username === you);
      const addRow = (rank, name, value, mine) => {
        const row = document.createElement('div');
        row.className = `qtt-board-row${mine ? ' is-you' : ''}`;
        row.innerHTML = `<span class="qtt-rank">#${rank}</span><span class="qtt-name"></span><span class="qtt-val"></span>`;
        row.querySelector('.qtt-name').textContent = mine ? `${name || 'You'} (you)` : name || 'player';
        row.querySelector('.qtt-val').textContent = value;
        md.boardRows.appendChild(row);
      };
      if (!rows.length) {
        md.boardNote.textContent = 'No streaks on this board yet. Yours could be first.';
        md.boardNote.classList.remove('is-hidden');
      }
      let shown = false;
      for (const r of rows) {
        const mine = isYou(r);
        shown = shown || mine;
        addRow(r.rank, r.username || r.displayName || '', r.displayLabel || String(r.value), mine);
      }
      if (viewer && !shown) addRow(viewer.rank, viewer.username || you, viewer.displayLabel || String(viewer.value), true);
      if (!viewer && rows.length) {
        md.boardNote.textContent = 'Win a game to appear on the board';
        md.boardNote.classList.remove('is-hidden');
      }
      if (board.checkpointStatus && board.checkpointStatus.failed > 0) {
        md.boardNote.textContent = 'Some results were not saved. Showing accepted scores.';
        md.boardNote.classList.remove('is-hidden');
      }
    }

    // ------------------------------------------------------------------
    // Result sheet and rules sheet
    // ------------------------------------------------------------------
    function openResult() {
      resultOpen = true;
      const d = difficulty;
      const w = snapshot.winner;
      const streak = profile.streaks[d];
      const stats = profile.stats[d];
      md.title.className = `qtt-sheet-title ${w === HUMAN ? 'is-x' : w === COMPUTER ? 'is-o' : ''}`;
      const tb = snapshot.winByTieBreak ? tieBreakMoves() : null;
      const ended = md.sub.dataset.ended ? `Streak ended at ${md.sub.dataset.ended}. ` : '';
      const bestNote = profile.best[d] > 0 ? `Best on ${DIFFICULTY_LABEL[d]}: ${profile.best[d]}.` : 'Win a game to start a streak.';
      if (w === HUMAN) {
        md.title.textContent = streak > 1 ? `${streak} wins in a row` : 'You win!';
        const streakNote = md.sub.dataset.newBest ? `New best streak on ${DIFFICULTY_LABEL[d]}.` : md.sub.dataset.tiedBest ? `Ties your best on ${DIFFICULTY_LABEL[d]}.` : `Beat the computer on ${DIFFICULTY_LABEL[d]}.`;
        md.sub.textContent = tb
          ? `Both lines closed on the same collapse. Your line's newest move (${tb.yours}) is older than theirs (${tb.theirs}), so yours counts. ${streakNote}`
          : streakNote;
      } else if (w === COMPUTER) {
        md.title.textContent = 'Computer wins';
        md.sub.textContent = tb
          ? `Both lines closed on the same collapse. Their line's newest move (${tb.theirs}) is older than yours (${tb.yours}), so theirs counts. ${ended}Tap View board to see both lines.`
          : `${ended}${bestNote}`;
      } else {
        md.title.textContent = 'Draw';
        md.sub.textContent = `Nobody lined up three. ${ended}${bestNote}`;
      }
      md.stats.textContent = `${DIFFICULTY_LABEL[d]} record · ${stats.w} won · ${stats.l} lost · ${stats.d} drawn`;
      const cached = boardCache[d];
      renderBoard(d, cached, 'Updating');
      const attempt = gameId;
      readBoard(d)
        .then((board) => {
          if (disposed || attempt !== gameId || !resultOpen) return;
          renderBoard(d, board, 'Global · all time');
        })
        .catch(() => {
          if (disposed || attempt !== gameId || !resultOpen) return;
          renderBoard(d, boardCache[d], boardCache[d] ? 'Cached' : 'Unavailable');
        });
      md.result.classList.add('is-open');
      refreshHud();
    }

    function closeResult() {
      resultOpen = false;
      md.result.classList.remove('is-open');
      refreshHud();
    }

    function openRules() {
      rulesOpen = true;
      md.backdrop.style.pointerEvents = 'auto';
      md.backdrop.classList.add('is-open');
      md.rules.classList.add('is-open');
      ctx.platform.interact({ type: 'rules_open' });
    }

    function closeRules() {
      rulesOpen = false;
      // Inline, because listening on a child may auto-enable its hit testing.
      md.backdrop.style.pointerEvents = 'none';
      md.backdrop.classList.remove('is-open');
      md.rules.classList.remove('is-open');
    }

    // ------------------------------------------------------------------
    // Game flow
    // ------------------------------------------------------------------
    /**
     * Starts a fresh game. Leaving a game that both sides had joined counts
     * against the streak, so a bad position cannot be dodged to protect a
     * leaderboard entry. Returns true when a streak was reset that way.
     */
    function newGame(reason, streakDifficulty) {
      const sd = streakDifficulty || difficulty;
      let reset = false;
      if (snapshot.phase !== 'gameover' && snapshot.moveNumber >= 2) {
        if (profile.streaks[sd] > 0) {
          profile.streaks[sd] = 0;
          reset = true;
        }
        if (started) ctx.platform.fail({ result: 'abandoned', difficulty: sd, moves: snapshot.moveNumber });
      }
      if (profile.live) {
        profile.live = null;
        saveProfile();
      } else if (reset) {
        saveProfile();
      }
      gameId += 1;
      snapshot = createInitialQuantumSnapshot();
      selected = null;
      started = false;
      measuring = null;
      ai = { at: null, thinking: false, dots: -1, staged: null };
      winAt = null;
      fading = null;
      lastCollapsed = null;
      tutorial = null;
      markBorn.clear();
      solidBorn.clear();
      delete md.sub.dataset.ended;
      closeResult();
      syncScore();
      setMood(0.3);
      if (reason) ctx.platform.interact({ type: 'new_game', reason, streakReset: reset });
      refreshHud();
      return reset;
    }

    function beginAttemptIfNeeded() {
      if (started) return;
      started = true;
      ctx.platform.start({ difficulty, tutorial: !!tutorial });
    }

    /** Applies a committed engine transition and all the feedback that goes with it. */
    function commit(next, actor, move) {
      const prev = snapshot;
      snapshot = next;
      selected = null;
      ai.thinking = false;

      const prevIds = new Set(prev.spooky.map((m) => m.id));
      const added = next.spooky.find((m) => !prevIds.has(m.id));
      if (added) markBorn.set(added.id, now);

      const newlySolid = [];
      for (let i = 0; i < 9; i += 1) if (next.collapsed[i] && !prev.collapsed[i]) newlySolid.push(i);
      if (newlySolid.length) {
        for (const i of newlySolid) solidBorn.set(i, now);
        if (move.kind === 'collapse') {
          const nextIds = new Set(next.spooky.map((m) => m.id));
          fading = { at: now, marks: prev.spooky.filter((m) => !nextIds.has(m.id)) };
          lastCollapsed = { at: now, cells: new Set(newlySolid) };
          haptic('medium');
          sting('powerup');
          ctx.platform.milestone('collapse', { cells: newlySolid.length, by: actor });
        }
      }

      if (move.kind === 'place' || move.kind === 'forced') {
        if (actor === HUMAN) {
          haptic('light');
          sting('tap');
        } else {
          sting({ name: 'tap', volume: 0.12 });
        }
      }

      ctx.platform.interact({ type: move.kind, by: actor, move: next.moveNumber });

      // Once both sides have moved the game counts: remember it is live so an
      // abandoned game (closing the Bit) still ends the streak next visit.
      if (next.moveNumber === 2 && next.phase !== 'gameover' && profile.live !== difficulty) {
        profile.live = difficulty;
        saveProfile();
      }

      if (next.phase === 'choosingCollapse' && next.pending) {
        measuring = { chooser: next.pending.chooser, preview: 0, at: now, pickedAt: null };
        haptic('warning');
        sting('danger');
        setMood(0.65);
        ctx.platform.milestone('loop_closed', { by: actor, chooser: next.pending.chooser, cells: next.pending.componentCells.length });
      } else if (prev.phase === 'choosingCollapse') {
        measuring = null;
        if (next.phase !== 'gameover') setMood(0.35);
      }

      if (tutorial) tutorialAfterCommit(actor, move, prev);

      if (next.phase === 'gameover') {
        finishGame();
      } else {
        let extra = 0;
        if (next.phase === 'choosingCollapse' && next.pending && next.pending.chooser === COMPUTER) extra += T.flashHold;
        if (move.kind === 'collapse' && actor === COMPUTER) extra += T.afterCollapse;
        if (tutorial && (tutorial.step === 'entangle' || tutorial.step === 'wrap')) extra += T.tutorialRead;
        scheduleAi(extra);
      }
      refreshHud();
    }

    function scheduleAi(extraMs) {
      if (snapshot.phase === 'gameover' || decisionMaker(snapshot) !== COMPUTER) {
        ai.at = null;
        return;
      }
      // Wall clock, not accumulated frame time: a throttled WebView must not
      // stretch a half-second pause into many seconds.
      ai.at = Date.now() + knobs.pauseMs() + (extraMs || 0);
      ai.thinking = false;
    }

    function runAi() {
      const attempt = gameId;
      // A staged measurement has been previewed long enough: let it settle.
      if (ai.staged) {
        const staged = ai.staged;
        ai.staged = null;
        const settled = applyAiMove(snapshot, staged);
        if (settled !== snapshot) commit(settled, COMPUTER, staged);
        return;
      }
      let move = tutorial ? tutorialAiMove() : null;
      if (!move) {
        const overrides = difficulty === 'hard' ? { maxDepth: 6, budgetMs: knobs.hardThinkMs() } : undefined;
        move = getQuantumMove(snapshot, difficulty, 7, overrides);
      }
      if (!move || attempt !== gameId || disposed) return;
      if (move.kind === 'collapse' && measuring && snapshot.pending) {
        // Narrate the computer's choice: preview the chosen outcome on the
        // board, name it, then settle it after a readable pause.
        ai.staged = move;
        ai.thinking = false;
        measuring.preview = move.option === 1 ? 1 : 0;
        measuring.pickedAt = Date.now();
        ai.at = Date.now() + T.narrate;
        haptic('light');
        refreshHud();
        return;
      }
      const next = applyAiMove(snapshot, move);
      if (next === snapshot) return; // the engine rejected it; never loop on a stuck state
      commit(next, COMPUTER, move);
    }

    function finishGame() {
      winAt = now;
      ai.at = null;
      ai.staged = null;
      measuring = null;
      // A clean final board: no amber wash or dissolving ghosts under the result.
      fading = null;
      lastCollapsed = null;
      const d = difficulty;
      const w = snapshot.winner;
      const endedStreak = profile.streaks[d];
      const prevBest = profile.best[d];
      profile.live = null;
      delete md.sub.dataset.newBest;
      delete md.sub.dataset.tiedBest;
      if (w === HUMAN) {
        profile.streaks[d] += 1;
        if (profile.streaks[d] > prevBest) md.sub.dataset.newBest = '1';
        else if (profile.streaks[d] === prevBest && prevBest > 1) md.sub.dataset.tiedBest = '1';
        profile.best[d] = Math.max(profile.best[d], profile.streaks[d]);
        profile.stats[d].w += 1;
        syncScore();
        haptic('success');
        sting('win');
        setMood(0.9);
        ctx.platform.complete({ result: 'win', difficulty: d, streak: profile.streaks[d], moves: snapshot.moveNumber, tieBreak: snapshot.winByTieBreak });
        const streakNow = profile.streaks[d];
        submitStreak(streakNow, d);
        const attempt = gameId;
        ctx.timeout(() => {
          if (disposed || attempt !== gameId) return;
          try {
            ctx.pulse.complete({
              mode: d,
              score: streakNow,
              result: 'win',
              text: streakNow > 1 ? `Beat the quantum computer on ${DIFFICULTY_LABEL[d]} · ${streakNow} in a row` : `Beat the quantum computer on ${DIFFICULTY_LABEL[d]}`,
            });
          } catch (_) {
            /* optional */
          }
        }, T.sheetDelay + 450);
      } else if (w === COMPUTER) {
        profile.streaks[d] = 0;
        profile.stats[d].l += 1;
        if (endedStreak > 0) md.sub.dataset.ended = String(endedStreak);
        syncScore();
        haptic('error');
        sting('lose');
        setMood(0.2);
        ctx.platform.fail({ result: 'loss', difficulty: d, endedStreak, moves: snapshot.moveNumber, tieBreak: snapshot.winByTieBreak });
      } else {
        profile.streaks[d] = 0;
        profile.stats[d].d += 1;
        if (endedStreak > 0) md.sub.dataset.ended = String(endedStreak);
        syncScore();
        haptic('light');
        sting('fail');
        setMood(0.3);
        ctx.platform.complete({ result: 'draw', difficulty: d, endedStreak, moves: snapshot.moveNumber });
      }
      if (tutorial) endTutorial(false);
      saveProfile(true); // a result is written at once, not after a debounce the host may cancel
      const attempt = gameId;
      ctx.timeout(() => {
        if (disposed || attempt !== gameId || snapshot.phase !== 'gameover') return;
        openResult();
      }, T.sheetDelay);
      ctx.timeout(() => {
        if (disposed || attempt !== gameId) return;
        setMood(0.3);
      }, 3200);
    }

    function setDifficulty(d, fromUser) {
      if (!DIFFICULTIES.includes(d)) return;
      const changed = d !== difficulty;
      const previous = difficulty;
      difficulty = d;
      profile.difficulty = d;
      if (fromUser) {
        if (!profileLoaded) preLoad.difficulty = d;
        const midGame = snapshot.moveNumber > 0 && snapshot.phase !== 'gameover';
        if (changed && (midGame || snapshot.phase === 'gameover')) {
          const reset = newGame('difficulty', previous);
          toast(reset ? `New game · ${DIFFICULTY_LABEL[d]} · ${DIFFICULTY_LABEL[previous]} streak reset` : `New game · ${DIFFICULTY_LABEL[d]}`);
          if (profileLoaded && !profile.tutorialDone) startTutorial();
        } else if (changed) {
          toast(`${DIFFICULTY_LABEL[d]} computer`);
        }
        ctx.platform.interact({ type: 'difficulty', difficulty: d });
        saveProfile();
      }
      syncScore();
      refreshHud();
    }

    // ------------------------------------------------------------------
    // Coached first game (manifest.onboarding is immersive: the Bit owns it)
    // ------------------------------------------------------------------
    function startTutorial() {
      tutorial = {
        step: 'place',
        ringCells: null,
        status: 'Your mark can be in <span class="qtt-x">two places</span> at once',
        hint: 'Tap any two cells',
        cells: null,
      };
      refreshHud();
    }

    function tutorialSay(status, hint) {
      if (!tutorial) return;
      tutorial.status = status;
      tutorial.hint = hint;
    }

    /** Scripted computer reply during the walkthrough: entangle with the player's first mark. */
    function tutorialAiMove() {
      if (!tutorial || tutorial.step !== 'entangle' || snapshot.phase !== 'placing') return null;
      const first = snapshot.spooky[0];
      if (!first) return null;
      const open = new Set();
      for (let i = 0; i < 9; i += 1) if (!snapshot.collapsed[i]) open.add(i);
      // Share the cell whose nearest free neighbour is closest, so the thread reads clearly.
      let best = null;
      for (const shared of first.cells) {
        const sc = { x: shared % 3, y: Math.floor(shared / 3) };
        for (const c of open) {
          if (c === first.cells[0] || c === first.cells[1]) continue;
          const dist = Math.hypot((c % 3) - sc.x, Math.floor(c / 3) - sc.y);
          if (!best || dist < best.dist) best = { shared, c, dist };
        }
      }
      if (!best) return null;
      tutorial.cells = { shared: best.shared, other: first.cells[0] === best.shared ? first.cells[1] : first.cells[0], third: best.c };
      return { kind: 'place', a: best.shared, b: best.c };
    }

    function tutorialAfterCommit(actor, move, prev) {
      if (!tutorial) return;
      if (tutorial.step === 'place' && actor === HUMAN && move.kind === 'place') {
        tutorial.step = 'entangle';
        tutorialSay('That is a <span class="qtt-x">spooky mark</span>', `X${toSubscript(1)} lives in both cells until it is measured. Watch the computer`);
        return;
      }
      if (tutorial.step === 'entangle' && actor === COMPUTER && move.kind === 'place' && tutorial.cells) {
        tutorial.step = 'closeLoop';
        tutorial.ringCells = new Set([tutorial.cells.other, tutorial.cells.third]);
        tutorialSay('<span class="qtt-o">O</span> shares a cell with you: <span class="qtt-amber">entangled</span>', 'Close the loop: tap the two glowing cells');
        return;
      }
      if (tutorial.step === 'closeLoop' && actor === HUMAN && move.kind === 'place') {
        tutorial.ringCells = null;
        if (snapshot.phase === 'choosingCollapse') {
          tutorial.step = 'measure';
          tutorialSay('<span class="qtt-amber">A loop!</span> Everything in it collapses', 'You closed it, so the computer chooses the outcome');
        } else {
          endTutorial(true);
        }
        return;
      }
      if (tutorial.step === 'measure' && actor === COMPUTER && move.kind === 'collapse') {
        tutorial.step = 'wrap';
        tutorialSay('Solid marks are <span class="qtt-amber">permanent</span>', 'Three solid marks in a line wins. The computer moves next');
        return;
      }
      if (tutorial.step === 'wrap' && actor === COMPUTER) {
        endTutorial(true);
      }
    }

    function endTutorial(completed) {
      tutorial = null;
      if (!profile.tutorialDone) {
        profile.tutorialDone = true;
        saveProfile();
      }
      try {
        if (ctx.onboarding && typeof ctx.onboarding.complete === 'function') ctx.onboarding.complete();
      } catch (_) {
        /* immersive: inert */
      }
      if (completed) toast('Your move. Line up three to win');
      refreshHud();
    }

    // ------------------------------------------------------------------
    // Input
    // ------------------------------------------------------------------
    function firstGesture() {
      startMusic();
    }

    function onBoardTap(x, y) {
      if (disposed) return;
      firstGesture();
      if (rulesOpen) {
        closeRules();
        return;
      }
      if (snapshot.phase === 'gameover') {
        // Tapping the board after a game reveals it (the sheet may cover the
        // position); replay is a deliberate button press.
        if (resultOpen) closeResult();
        return;
      }
      if (humanChoosing() && measuring) {
        for (let i = 0; i < 2; i += 1) {
          if (inRect(x, y, L.cards[i])) {
            if (measuring.preview !== i) {
              measuring.preview = i;
              haptic('light');
              sting('tap');
              ctx.platform.interact({ type: 'preview', option: i });
              refreshHud();
            }
            return;
          }
        }
        return;
      }
      if (isAiTurn()) return;
      // Inside the board a tap in the gap between cells snaps to the nearest
      // cell; only a tap outside the board clears a half-placed selection.
      const cell = hitCell(x, y) ?? (inBoard(x, y) ? nearestCell(x, y) : null);
      if (cell === null) {
        if (selected !== null) {
          selected = null;
          refreshHud();
        }
        return;
      }
      tapCell(cell);
    }

    function nearestCell(x, y) {
      const b = L.board;
      const step = b.cell + b.gap;
      const col = Math.min(2, Math.max(0, Math.floor((x - b.x + b.gap / 2) / step)));
      const row = Math.min(2, Math.max(0, Math.floor((y - b.y + b.gap / 2) / step)));
      return row * 3 + col;
    }

    function tapCell(cell) {
      if (snapshot.phase !== 'placing') return;
      if (snapshot.collapsed[cell]) {
        haptic('light');
        toast('That cell is already solid');
        return;
      }
      if (tutorial && tutorial.step === 'closeLoop' && tutorial.ringCells && !tutorial.ringCells.has(cell)) {
        toast('Tap the two glowing cells');
        haptic('light');
        return;
      }
      if (tutorial && (tutorial.step === 'entangle' || tutorial.step === 'measure')) return; // computer's turn in the script
      beginAttemptIfNeeded();
      const forced = forcedCell(snapshot);
      if (forced !== null) {
        const next = placeForced(snapshot, forced);
        if (next !== snapshot) commit(next, HUMAN, { kind: 'forced', cell: forced });
        return;
      }
      if (selected === null) {
        selected = cell;
        haptic('light');
        if (tutorial && tutorial.step === 'place') tutorial.hint = 'Now tap a second cell';
        refreshHud();
        return;
      }
      if (selected === cell) {
        selected = null;
        if (tutorial && tutorial.step === 'place') tutorial.hint = 'Tap any two cells';
        refreshHud();
        return;
      }
      const a = selected;
      const next = placeSpooky(snapshot, a, cell);
      if (next === snapshot) {
        selected = null;
        refreshHud();
        return;
      }
      commit(next, HUMAN, { kind: 'place', a, b: cell });
    }

    function commitCollapse() {
      if (!humanChoosing() || !measuring) return;
      firstGesture();
      beginAttemptIfNeeded();
      const option = measuring.preview === 1 ? 1 : 0;
      const next = resolveCollapse(snapshot, option);
      if (next !== snapshot) commit(next, HUMAN, { kind: 'collapse', option });
    }

    // Deliberate, slower presses on a turn-based board still count as taps.
    ctx.input.on(canvas, 'tap', (p) => onBoardTap(p.x, p.y), { tapMaxMs: 650, holdMs: 1200 });
    for (const b of el.segButtons) {
      ctx.input.activate(b, () => {
        firstGesture();
        setDifficulty(b.dataset.d, true);
      });
    }
    ctx.input.activate(el.commit, commitCollapse);
    ctx.input.activate(el.newGame, () => {
      firstGesture();
      const reset = newGame('button');
      if (profileLoaded && !profile.tutorialDone) startTutorial();
      toast(reset ? 'New game · streak reset' : 'New game');
    });
    ctx.input.activate(md.view, () => {
      closeResult();
      ctx.platform.interact({ type: 'view_board' });
    });
    ctx.input.activate(el.sound, () => {
      profile.muted = !profile.muted;
      if (!profileLoaded) preLoad.muted = profile.muted;
      firstGesture();
      applyMute();
      saveProfile();
      ctx.platform.interact({ type: 'mute', muted: profile.muted });
      refreshHud();
      toast(profile.muted ? 'Sound off' : 'Sound on');
    });
    ctx.input.activate(el.help, () => {
      firstGesture();
      openRules();
    });
    ctx.input.activate(el.skip, () => {
      endTutorial(false);
      toast('Walkthrough skipped');
      ctx.platform.interact({ type: 'tutorial_skip' });
    });
    ctx.input.activate(md.closeRules, closeRules);
    // Not activate(): that would make the invisible backdrop hit-testable and
    // swallow every board tap. CSS owns its pointer-events; listen only.
    ctx.listen(md.backdrop, 'click', closeRules);
    md.backdrop.style.pointerEvents = 'none';
    ctx.input.activate(md.replayTour, () => {
      closeRules();
      const reset = newGame('tutorial');
      startTutorial();
      if (reset) toast('Walkthrough · streak reset');
      ctx.platform.interact({ type: 'tutorial_replay' });
    });
    ctx.input.activate(md.again, () => {
      firstGesture();
      newGame('replay');
      if (profileLoaded && !profile.tutorialDone) startTutorial();
    });

    try {
      ctx.tune.onChange(['music_volume'], () => applyMute());
    } catch (_) {
      /* tuning is optional */
    }

    // ------------------------------------------------------------------
    // Loop
    // ------------------------------------------------------------------
    function update(dt) {
      now += dt;
      if (toastUntil && Date.now() >= toastUntil) {
        toastUntil = 0;
        el.toast.classList.remove('is-on');
      }
      if (ai.at !== null && snapshot.phase !== 'gameover') {
        if (ai.thinking) {
          ai.at = null;
          runAi();
        } else if (Date.now() >= ai.at) {
          // Show the thinking state for a frame before the synchronous search blocks.
          ai.thinking = true;
          ai.dots = -1;
          refreshStatus();
        }
      }
      if (ai.thinking || (snapshot.phase !== 'gameover' && isAiTurn() && !tutorial)) {
        const dots = Math.floor(now / 380) % 4;
        if (dots !== ai.dots) {
          ai.dots = dots;
          refreshStatus();
        }
      }
    }

    ctx.onResize(
      () => {
        layout();
        render();
      },
      { immediate: true }
    );

    // First visible frame, then the saved profile (bounded wait), then readiness.
    refreshHud();
    render();
    ctx.markVisualReady('board');

    Promise.resolve()
      .then(() => ctx.loadFont('QTT Display', 'space-grotesk', '1.0.0', { weight: '300 700', display: 'swap' }))
      .catch(() => {
        /* the system font fallback is already in use */
      });

    // The profile decides difficulty, streak and whether to coach, so give it
    // a moment before play can begin; a slow read keeps retrying and applies
    // itself safely later (see applyLoadedProfile).
    const loading = loadProfile();
    await Promise.race([loading, pause(1500)]);
    if (disposed) return;
    refreshHud();
    render();
    ctx.platform.ready();

    ctx.game.loop({ update, render });
  },
};
})();
