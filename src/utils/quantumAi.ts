import { WIN_LINES } from './constants';
import { Player, otherPlayer } from './engine';
import {
  availableCells,
  placeForced,
  placeSpooky,
  QuantumSnapshot,
  resolveCollapse,
} from './quantum';
import { Difficulty } from './engine';

/**
 * AI for Quantum mode. The engine is perfect-information and deterministic
 * (collapse outcomes are chosen by a player, not random), so a depth-limited
 * minimax works — but turns do NOT strictly alternate: after a player closes a
 * cycle, the OTHER player both measures and moves next, taking two decisions in
 * a row. So every node is labelled with its decision-maker rather than assuming
 * alternation, and we maximise the AI's evaluation on its nodes, minimise on the
 * opponent's. The search therefore captures, for free, the key quantum idea that
 * closing a loop hands the collapse choice to your opponent.
 */

export type QuantumAiMove =
  | { kind: 'place'; a: number; b: number }
  | { kind: 'forced'; cell: number }
  | { kind: 'collapse'; option: 0 | 1 };

/** Whoever must decide right now: the chooser mid-measurement, else the mover. */
function decisionMaker(snapshot: QuantumSnapshot): Player {
  return snapshot.phase === 'choosingCollapse' && snapshot.pending
    ? snapshot.pending.chooser
    : snapshot.currentPlayer;
}

interface Child {
  snap: QuantumSnapshot;
  move: QuantumAiMove;
}

/** Every legal decision from a state, as (resulting snapshot, move) pairs. */
function genChildren(snapshot: QuantumSnapshot): Child[] {
  if (snapshot.phase === 'choosingCollapse' && snapshot.pending) {
    return ([0, 1] as const).map((option) => ({
      snap: resolveCollapse(snapshot, option),
      move: { kind: 'collapse', option },
    }));
  }

  const open = availableCells(snapshot);
  if (open.length === 1) {
    return [{ snap: placeForced(snapshot, open[0]), move: { kind: 'forced', cell: open[0] } }];
  }

  const children: Child[] = [];
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
const LINE_COLLAPSED = [0, 3, 18] as const;
/** Weight per line-cell a player could still land a superposed mark into. */
const SUPER_WEIGHT = 1.5;
const CENTER_INDEX = 4;
const CENTER_WEIGHT = 2;
const WIN_SCORE = 10_000;

function evaluate(snapshot: QuantumSnapshot, player: Player): number {
  const opp = otherPlayer(player);
  const { collapsed, spooky } = snapshot;

  // Which open cells each player has a spooky mark touching (superposed reach).
  const reach = { [player]: new Set<number>(), [opp]: new Set<number>() } as Record<
    Player,
    Set<number>
  >;
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

/** Terminal value from the AI's perspective; sooner wins score higher. */
function terminalValue(snapshot: QuantumSnapshot, ai: Player, depth: number): number | null {
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

interface SearchCtx {
  ai: Player;
  deadline: number;
  aborted: boolean;
}

/** Order children best-first for the mover; beam only away from the leaves. */
function orderAndBeam(children: Child[], mover: Player, remainingDepth: number): Child[] {
  if (children.length <= 3) return children;
  const scored = children
    .map((c) => ({ c, q: evaluate(c.snap, mover) }))
    .sort((x, y) => y.q - x.q);
  const beam = remainingDepth >= 2 && scored.length > BEAM ? BEAM : scored.length;
  return scored.slice(0, beam).map((s) => s.c);
}

function search(
  snapshot: QuantumSnapshot,
  depth: number,
  alpha: number,
  beta: number,
  ctx: SearchCtx
): number {
  const terminal = terminalValue(snapshot, ctx.ai, depth);
  if (terminal !== null) return terminal;
  if (depth === 0) return evaluate(snapshot, ctx.ai);
  if (ctx.aborted || Date.now() > ctx.deadline) {
    ctx.aborted = true;
    return evaluate(snapshot, ctx.ai);
  }

  const dm = decisionMaker(snapshot);
  const maximizing = dm === ctx.ai;
  const children = orderAndBeam(genChildren(snapshot), dm, depth);
  let best = maximizing ? -Infinity : Infinity;

  for (const { snap } of children) {
    const value = search(snap, depth - 1, alpha, beta, ctx);
    if (maximizing) {
      best = Math.max(best, value);
      alpha = Math.max(alpha, value);
    } else {
      best = Math.min(best, value);
      beta = Math.min(beta, value);
    }
    if (beta <= alpha) break;
  }
  return best;
}

function bestByEval(children: Child[], player: Player): QuantumAiMove {
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
function bestBySearch(
  children: Child[],
  ai: Player,
  maxDepth: number,
  budgetMs: number
): QuantumAiMove {
  const deadline = Date.now() + budgetMs;
  let ordered = children
    .map((c) => ({ c, q: evaluate(c.snap, ai) }))
    .sort((x, y) => y.q - x.q)
    .map((s) => s.c);
  let bestMove = ordered[0].move;

  for (let depth = 1; depth <= maxDepth; depth += 1) {
    const ctx: SearchCtx = { ai, deadline, aborted: false };
    const scores = new Map<Child, number>();
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

interface Plan {
  maxDepth: number;
  budgetMs: number;
}

/** How hard each tier thinks. Budgets bound the main-thread pause per move. */
function planFor(difficulty: Difficulty, customDepth: number): Plan {
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
 */
export function getQuantumMove(
  snapshot: QuantumSnapshot,
  difficulty: Difficulty,
  customDepth: number
): QuantumAiMove | null {
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
  const { maxDepth, budgetMs } = planFor(difficulty, customDepth);
  return bestBySearch(children, ai, maxDepth, budgetMs);
}
