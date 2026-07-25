import { BOARD_CELLS, WIN_LINES } from './constants';
import { Player, Winner, WinLine, otherPlayer } from './engine';

/**
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

export type QuantumPhase = 'placing' | 'choosingCollapse' | 'gameover';

/** A superposed move: one symbol occupying two cells at once. */
export interface SpookyMark {
  /** Move number this mark was placed at; doubles as its subscript. */
  id: number;
  player: Player;
  /** The two distinct cells it is superposed across, always sorted ascending. */
  cells: readonly [number, number];
}

/** A cell that has collapsed to a definite classical mark. */
export interface ClassicalMark {
  player: Player;
  /** Subscript (move id) of the spooky mark that resolved into this cell. */
  subscript: number;
}

/** One of the two consistent outcomes of a collapse: cell index -> mark. */
export interface CollapseOption {
  /** Sparse map keyed by cell index for every cell in the collapsing component. */
  assignment: Record<number, ClassicalMark>;
}

export interface PendingCollapse {
  /** The player who resolves the measurement (did not close the cycle). */
  chooser: Player;
  /** Cells being measured — everything in the newly-cyclic component. */
  componentCells: number[];
  /** Spooky-mark ids that form the closed cycle (for the measurement flash). */
  cyclicEdgeIds: number[];
  /** Exactly two consistent measurement outcomes. */
  options: readonly [CollapseOption, CollapseOption];
}

export interface QuantumSnapshot {
  /** Classical board; null where a cell has not yet collapsed. */
  collapsed: ReadonlyArray<ClassicalMark | null>;
  /** Active superposed marks (edges of the entanglement forest). */
  spooky: ReadonlyArray<SpookyMark>;
  currentPlayer: Player;
  moveNumber: number;
  phase: QuantumPhase;
  /** Present only while phase === 'choosingCollapse'. */
  pending: PendingCollapse | null;
  winner: Winner;
  winLine: WinLine | null;
}

export const createInitialQuantumSnapshot = (): QuantumSnapshot => ({
  collapsed: Array<ClassicalMark | null>(BOARD_CELLS).fill(null),
  spooky: [],
  currentPlayer: 'X',
  moveNumber: 0,
  phase: 'placing',
  pending: null,
  winner: null,
  winLine: null,
});

/** A cell is available for a new spooky mark until it has collapsed. */
export const isCollapsed = (snapshot: QuantumSnapshot, cell: number): boolean =>
  snapshot.collapsed[cell] !== null;

export function availableCells(snapshot: QuantumSnapshot): number[] {
  const cells: number[] = [];
  for (let i = 0; i < BOARD_CELLS; i += 1) {
    if (snapshot.collapsed[i] === null) cells.push(i);
  }
  return cells;
}

/** Spooky marks that touch a given cell, in placement order. */
export function marksInCell(snapshot: QuantumSnapshot, cell: number): SpookyMark[] {
  return snapshot.spooky.filter((mark) => mark.cells[0] === cell || mark.cells[1] === cell);
}

// ---------------------------------------------------------------------------
// Entanglement graph
// ---------------------------------------------------------------------------

interface Adjacency {
  /** cell -> list of { to, edgeId } across all spooky marks. */
  [cell: number]: Array<{ to: number; edgeId: number }>;
}

function buildAdjacency(spooky: ReadonlyArray<SpookyMark>): Adjacency {
  const adj: Adjacency = {};
  for (const mark of spooky) {
    const [a, b] = mark.cells;
    (adj[a] ??= []).push({ to: b, edgeId: mark.id });
    (adj[b] ??= []).push({ to: a, edgeId: mark.id });
  }
  return adj;
}

/** Cells reachable from `start` through spooky edges (the connected component). */
function componentOf(start: number, adj: Adjacency): number[] {
  const seen = new Set<number>([start]);
  const stack = [start];
  while (stack.length) {
    const node = stack.pop()!;
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
function alreadyConnected(a: number, b: number, adj: Adjacency): boolean {
  return componentOf(a, adj).includes(b);
}

/**
 * The unique tree path between `a` and `b` in a forest, as ordered nodes plus
 * the edge ids linking consecutive nodes. `edges[i]` connects `nodes[i]` and
 * `nodes[i + 1]`. Assumes `a` and `b` are connected.
 */
function pathInForest(a: number, b: number, adj: Adjacency): { nodes: number[]; edges: number[] } {
  const parentNode = new Map<number, number>();
  const parentEdge = new Map<number, number>();
  const seen = new Set<number>([a]);
  const stack = [a];

  while (stack.length) {
    const node = stack.pop()!;
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

  const nodes: number[] = [b];
  const edges: number[] = [];
  let cur = b;
  while (cur !== a) {
    edges.push(parentEdge.get(cur)!);
    cur = parentNode.get(cur)!;
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
function buildCollapseOptions(
  componentCells: number[],
  cycle: number[],
  cycleEdges: number[],
  spookyById: Map<number, SpookyMark>,
  adj: Adjacency
): { options: readonly [CollapseOption, CollapseOption]; cyclicEdgeIds: number[] } {
  const k = cycle.length;
  const cycleEdgeSet = new Set(cycleEdges);

  const orient = (dir: 0 | 1): CollapseOption => {
    // cell -> edgeId that lands its mark there
    const landing = new Map<number, number>();
    // Seat the cycle: edge i (between cycle[i], cycle[i+1]) lands on one end.
    for (let i = 0; i < k; i += 1) {
      const target = dir === 0 ? cycle[(i + 1) % k] : cycle[i];
      landing.set(target, cycleEdges[i]);
    }
    // Force the tree branches outward from the seated cycle nodes.
    const occupied = new Set<number>(cycle);
    const queue = [...cycle];
    while (queue.length) {
      const node = queue.shift()!;
      for (const { to, edgeId } of adj[node] ?? []) {
        if (cycleEdgeSet.has(edgeId)) continue;
        if (occupied.has(to)) continue;
        landing.set(to, edgeId);
        occupied.add(to);
        queue.push(to);
      }
    }

    const assignment: Record<number, ClassicalMark> = {};
    for (const cell of componentCells) {
      const edgeId = landing.get(cell);
      if (edgeId === undefined) continue; // defensive: every component cell should be seated
      const mark = spookyById.get(edgeId)!;
      assignment[cell] = { player: mark.player, subscript: mark.id };
    }
    return { assignment };
  };

  return { options: [orient(0), orient(1)], cyclicEdgeIds: cycleEdges };
}

// ---------------------------------------------------------------------------
// Win detection
// ---------------------------------------------------------------------------

interface CompletedLine {
  player: Player;
  line: WinLine;
  /** Highest subscript among the line's three cells. */
  maxSubscript: number;
  /** The three subscripts, sorted descending (for exact tie-breaking). */
  subscriptsDesc: number[];
}

function completedLines(collapsed: ReadonlyArray<ClassicalMark | null>): CompletedLine[] {
  const lines: CompletedLine[] = [];
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
function preferEarlier(a: CompletedLine, b: CompletedLine): CompletedLine {
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
 * (lowest max-subscript) line wins.
 */
function evaluateOutcome(collapsed: ReadonlyArray<ClassicalMark | null>): {
  winner: Winner;
  winLine: WinLine | null;
} {
  const lines = completedLines(collapsed);
  if (lines.length === 0) {
    const full = collapsed.every((cell) => cell !== null);
    return { winner: full ? 'draw' : null, winLine: null };
  }
  // Best (earliest) line for each player, then the earlier of those wins.
  const best = new Map<Player, CompletedLine>();
  for (const line of lines) {
    const cur = best.get(line.player);
    best.set(line.player, cur ? preferEarlier(cur, line) : line);
  }
  const contenders = [...best.values()];
  const winning = contenders.reduce((acc, l) => preferEarlier(acc, l));
  return { winner: winning.player, winLine: winning.line };
}

// ---------------------------------------------------------------------------
// Moves
// ---------------------------------------------------------------------------

/**
 * Places a spooky mark across cells `a` and `b`. If it closes a cycle, the
 * returned snapshot enters `choosingCollapse` for the non-closing player;
 * otherwise the turn passes normally. Returns the same reference if illegal.
 */
export function placeSpooky(snapshot: QuantumSnapshot, a: number, b: number): QuantumSnapshot {
  if (snapshot.phase !== 'placing') return snapshot;
  if (a === b) return snapshot;
  if (a < 0 || b < 0 || a >= BOARD_CELLS || b >= BOARD_CELLS) return snapshot;
  if (isCollapsed(snapshot, a) || isCollapsed(snapshot, b)) return snapshot;

  const [lo, hi] = a < b ? [a, b] : [b, a];
  const id = snapshot.moveNumber + 1;
  const newMark: SpookyMark = { id, player: snapshot.currentPlayer, cells: [lo, hi] };
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
  const spookyById = new Map(spooky.map((m) => [m.id, m] as const));
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
 * Commits one of the two measurement outcomes chosen by the non-closer. The
 * measured spooky marks become classical and the game outcome is evaluated.
 */
export function resolveCollapse(
  snapshot: QuantumSnapshot,
  optionIndex: 0 | 1
): QuantumSnapshot {
  if (snapshot.phase !== 'choosingCollapse' || !snapshot.pending) return snapshot;

  const { assignment } = snapshot.pending.options[optionIndex];
  const collapsed = snapshot.collapsed.map((cell, i) => assignment[i] ?? cell);
  const measured = new Set(snapshot.pending.componentCells);
  const spooky = snapshot.spooky.filter(
    (mark) => !measured.has(mark.cells[0]) || !measured.has(mark.cells[1])
  );

  const { winner, winLine } = evaluateOutcome(collapsed);

  return {
    ...snapshot,
    collapsed,
    spooky,
    phase: winner ? 'gameover' : 'placing',
    pending: null,
    winner,
    winLine,
  };
}

/**
 * Fills the single remaining empty cell with a definite classical mark. Used
 * for the endgame "last square" where a two-cell superposition is impossible.
 */
export function placeForced(snapshot: QuantumSnapshot, cell: number): QuantumSnapshot {
  if (snapshot.phase !== 'placing') return snapshot;
  const open = availableCells(snapshot);
  if (open.length !== 1 || open[0] !== cell) return snapshot;

  const id = snapshot.moveNumber + 1;
  const collapsed = snapshot.collapsed.map((c, i) =>
    i === cell ? { player: snapshot.currentPlayer, subscript: id } : c
  );
  const { winner, winLine } = evaluateOutcome(collapsed);

  return {
    ...snapshot,
    collapsed,
    moveNumber: id,
    currentPlayer: otherPlayer(snapshot.currentPlayer),
    phase: winner ? 'gameover' : 'placing',
    winner,
    winLine,
  };
}

/** True when only one empty cell remains, forcing a classical placement. */
export function forcedCell(snapshot: QuantumSnapshot): number | null {
  const open = availableCells(snapshot);
  return open.length === 1 ? open[0] : null;
}
