/**
 * Exact solver for Infinite Tic-Tac-Toe (3-mark vanishing variant).
 *
 * Rules mirrored from src/utils/engine.ts:
 *   - 3x3 board, X moves first.
 *   - Each player keeps at most 3 marks. Placing a 4th removes that player's
 *     OLDEST mark, and the removal happens BEFORE the win check.
 *   - Therefore a player wins iff, after their move, their three marks form a
 *     line. The board never fills (max 6 marks on 9 cells), so there is no
 *     draw-by-exhaustion: a game either ends in a win or runs forever.
 *
 * The state graph is finite and cyclic, so plain minimax does not terminate.
 * We solve it with retrograde analysis (the standard endgame-tablebase
 * algorithm for loopy games), which classifies every reachable position as:
 *   WIN  - side to move forces a win
 *   LOSS - side to move loses against optimal defence
 *   DRAW - neither side can force a win => the game is infinite
 *
 * State = (X's cells oldest-first, O's cells oldest-first, side to move).
 * The full age ordering is required, not just "which is oldest", because after
 * a vanish the next-oldest determines the following removal.
 */

export const LINES: ReadonlyArray<readonly [number, number, number]> = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
];

const LINE_MASKS = new Set(LINES.map((l) => l.reduce((m, i) => m | (1 << i), 0)));

/** WIN/LOSS/DRAW are from the perspective of the side to move. */
export const enum Label {
  DRAW = 0,
  WIN = 1,
  LOSS = 2,
}

const P10 = [1, 10, 100];
const ABSENT = 9;
const KEY_SPACE = 2_000_000;

/** Packs (xs, os, turn) into a dense integer key. turn: 0 = X to move, 1 = O. */
export function encode(xs: readonly number[], os: readonly number[], turn: number): number {
  let xc = 0;
  let oc = 0;
  for (let i = 0; i < 3; i++) {
    xc += (i < xs.length ? xs[i] : ABSENT) * P10[i];
    oc += (i < os.length ? os[i] : ABSENT) * P10[i];
  }
  return (xc * 1000 + oc) * 2 + turn;
}

export function decode(key: number): { xs: number[]; os: number[]; turn: number } {
  const turn = key & 1;
  const rest = (key - turn) / 2;
  const oc = rest % 1000;
  const xc = (rest - oc) / 1000;
  const pull = (code: number) => {
    const out: number[] = [];
    for (let i = 0; i < 3; i++) {
      const d = Math.floor(code / P10[i]) % 10;
      if (d !== ABSENT) out.push(d);
    }
    return out;
  };
  return { xs: pull(xc), os: pull(oc), turn };
}

/** True if a 3-mark set forms a line. */
function isLine(cells: readonly number[]): boolean {
  if (cells.length !== 3) return false;
  return LINE_MASKS.has((1 << cells[0]) | (1 << cells[1]) | (1 << cells[2]));
}

/**
 * Result of playing `cell` from a state.
 * `win` means the mover completes a line (terminal). Otherwise `key` is the
 * successor state.
 */
export interface MoveResult {
  win: boolean;
  key: number;
}

export function playMove(
  xs: readonly number[],
  os: readonly number[],
  turn: number,
  cell: number
): MoveResult {
  const own = turn === 0 ? xs : os;
  const next = [...own, cell];
  if (next.length > 3) next.shift(); // oldest vanishes, before the win check
  if (isLine(next)) return { win: true, key: -1 };
  return {
    key: turn === 0 ? encode(next, os, 1) : encode(xs, next, 0),
    win: false,
  };
}

export interface Tablebase {
  /** Dense state ids, index -> packed key. */
  keys: Int32Array;
  /** Packed key -> dense id, or -1. */
  idOf: Int32Array;
  label: Uint8Array;
  /** Plies to the forced result under optimal play; 0 for draws. */
  dist: Int16Array;
  /** CSR forward edges over non-terminal successors. */
  childOff: Int32Array;
  childIdx: Int32Array;
  /** Cell played for each edge, parallel to childIdx. */
  childCell: Uint8Array;
  /** Cells that immediately win for the side to move, as a bitmask. */
  winMoves: Uint16Array;
  count: number;
  id(key: number): number;
}

/** Forward BFS over all positions reachable from the empty board. */
function enumerateStates() {
  const idOf = new Int32Array(KEY_SPACE).fill(-1);
  const keys: number[] = [];
  const start = encode([], [], 0);
  idOf[start] = 0;
  keys.push(start);

  const childOff: number[] = [0];
  const childIdx: number[] = [];
  const childCell: number[] = [];
  const winMoves: number[] = [];

  for (let id = 0; id < keys.length; id++) {
    const { xs, os, turn } = decode(keys[id]);
    let occupied = 0;
    for (const c of xs) occupied |= 1 << c;
    for (const c of os) occupied |= 1 << c;

    let wins = 0;
    for (let cell = 0; cell < 9; cell++) {
      if (occupied & (1 << cell)) continue;
      const r = playMove(xs, os, turn, cell);
      if (r.win) {
        wins |= 1 << cell;
        continue;
      }
      let cid = idOf[r.key];
      if (cid === -1) {
        cid = keys.length;
        idOf[r.key] = cid;
        keys.push(r.key);
      }
      childIdx.push(cid);
      childCell.push(cell);
    }
    winMoves.push(wins);
    childOff.push(childIdx.length);
  }

  return { idOf, keys, childOff, childIdx, childCell, winMoves };
}

export function solve(): Tablebase {
  const g = enumerateStates();
  const n = g.keys.length;

  const childOff = Int32Array.from(g.childOff);
  const childIdx = Int32Array.from(g.childIdx);
  const childCell = Uint8Array.from(g.childCell);
  const winMoves = Uint16Array.from(g.winMoves);

  // Reverse edges (CSR) so we can propagate labels backwards.
  const inDeg = new Int32Array(n + 1);
  for (let i = 0; i < childIdx.length; i++) inDeg[childIdx[i] + 1]++;
  for (let i = 0; i < n; i++) inDeg[i + 1] += inDeg[i];
  const parentOff = inDeg;
  const parentIdx = new Int32Array(childIdx.length);
  const cursor = Int32Array.from(parentOff.subarray(0, n));
  for (let p = 0; p < n; p++) {
    for (let e = childOff[p]; e < childOff[p + 1]; e++) {
      parentIdx[cursor[childIdx[e]]++] = p;
    }
  }

  const label = new Uint8Array(n); // DRAW by default
  const dist = new Int16Array(n);
  // Unresolved children remaining before a node is proven LOSS.
  const remaining = new Int32Array(n);
  for (let i = 0; i < n; i++) remaining[i] = childOff[i + 1] - childOff[i];

  const queue = new Int32Array(n);
  let head = 0;
  let tail = 0;

  // Seed: any position with an immediate winning move is a WIN in 1 ply.
  for (let i = 0; i < n; i++) {
    if (winMoves[i] !== 0) {
      label[i] = Label.WIN;
      dist[i] = 1;
      queue[tail++] = i;
    }
  }

  while (head < tail) {
    const s = queue[head++];
    const sLabel = label[s];
    for (let e = parentOff[s]; e < parentOff[s + 1]; e++) {
      const p = parentIdx[e];
      if (label[p] !== Label.DRAW) continue;
      if (sLabel === Label.LOSS) {
        // A move into a lost-for-them position wins for us.
        label[p] = Label.WIN;
        dist[p] = dist[s] + 1;
        queue[tail++] = p;
      } else if (--remaining[p] === 0) {
        // Every move leads to a position won by the opponent.
        label[p] = Label.LOSS;
        dist[p] = dist[s] + 1;
        queue[tail++] = p;
      }
    }
  }

  const keys = Int32Array.from(g.keys);
  const idOf = g.idOf;
  return {
    keys,
    idOf,
    label,
    dist,
    childOff,
    childIdx,
    childCell,
    winMoves,
    count: n,
    id: (key: number) => idOf[key],
  };
}

// --- symmetry -------------------------------------------------------------

/** The 8 dihedral symmetries of the 3x3 board, as cell permutations. */
export const SYMMETRIES: number[][] = (() => {
  const rot = (p: number[]) => p.map((_, i) => p[[6, 3, 0, 7, 4, 1, 8, 5, 2][i]]);
  const flip = (p: number[]) => p.map((_, i) => p[[2, 1, 0, 5, 4, 3, 8, 7, 6][i]]);
  const out: number[][] = [];
  let cur = [0, 1, 2, 3, 4, 5, 6, 7, 8];
  for (let r = 0; r < 4; r++) {
    out.push(cur);
    out.push(flip(cur));
    cur = rot(cur);
  }
  return out;
})();

/** Canonical form of a move sequence under board symmetry. */
export function canonicalMoves(moves: readonly number[]): string {
  let best: string | null = null;
  for (const s of SYMMETRIES) {
    const t = moves.map((m) => s[m]).join(',');
    if (best === null || t < best) best = t;
  }
  return best!;
}
