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
export const WIN_LINES = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

export const BOARD_CELLS = 9;

export const otherPlayer = (player) => (player === 'X' ? 'O' : 'X');

export const createInitialQuantumSnapshot = () => ({
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
export const isCollapsed = (snapshot, cell) => snapshot.collapsed[cell] !== null;

export function availableCells(snapshot) {
  const cells = [];
  for (let i = 0; i < BOARD_CELLS; i += 1) {
    if (snapshot.collapsed[i] === null) cells.push(i);
  }
  return cells;
}

/** Spooky marks that touch a given cell, in placement order. */
export function marksInCell(snapshot, cell) {
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
export function entanglementHighlight(snapshot, cell) {
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
export function placeSpooky(snapshot, a, b) {
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
export function resolveCollapse(snapshot, optionIndex) {
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
export function placeForced(snapshot, cell) {
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
export function forcedCell(snapshot) {
  const open = availableCells(snapshot);
  return open.length === 1 ? open[0] : null;
}
