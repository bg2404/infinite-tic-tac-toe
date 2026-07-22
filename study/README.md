# Solving Infinite mode

An exact solve of the Infinite (3-mark vanishing) variant, and a measurement
of how the variant behaves under depth-limited search.

None of this changes the game. The scripts are additive; nothing under `src/`
depends on them.

Infinite mode cannot be solved by minimax. The board never fills — six marks
maximum on nine cells — so there is no draw by exhaustion and no natural
bottom to the game tree. A game either ends in a line or runs forever, which
makes the state graph cyclic. The solver uses retrograde analysis instead,
the technique behind chess endgame tablebases.

A position is `(X's cells oldest-first, O's cells oldest-first, side to move)`.
The full age ordering is required, not just "which mark is oldest": after one
vanishes, the next-oldest decides the following removal. 116,074 positions are
reachable from the empty board, and the solve takes about 120 ms.

## Scripts

| Script | What it does |
| --- | --- |
| `tablebase.ts` | The solver. Enumerates the state graph and labels every position WIN / LOSS / DRAW. |
| `validate.ts` | Cross-checks the solver's rules against `src/utils/engine.ts` over every move in the first 14 plies. |
| `verify-solution.ts` | Checks the *output* against the three invariants that define a correct solution of a loopy game. |
| `report-openings.ts` | Questions 1 & 2: which openings force a win, and which moves to avoid. |
| `analyze-strategy.ts` | Principal variations, the draw cycles, and how forgiving each phase of the game is. |
| `depth-study.ts` | Question 3: exhaustive blunder rate by search depth, the odd/even parity diagnostic, and survival against a perfect opponent. |
| `horizon.ts` | Deep search (to 16 plies) on drawn positions, where no depth ever reaches a terminal node. |
| `parity.ts` | Whether the odd/even split is usable at runtime, without a tablebase. |
| `emit-figure-data.ts` | Emits the exact numbers quoted in the write-up, as JSON. |

Run any of them with `npx tsx study/<name>.ts`. `depth-study.ts` takes about
six minutes and `horizon.ts` about fifteen; the rest finish in seconds.

## Correctness

Two independent checks, because a study of the wrong rules is worthless.

`validate.ts` confirms the solver and the shipped game engine model the same
game — 369,801 moves compared, zero divergence.

`verify-solution.ts` does not trust the retrograde implementation; it verifies
the labelling against the invariants that make it correct:

- every LOSS position has no immediate win, and every move leads to a WIN for
  the opponent at a strictly smaller distance;
- every WIN position has an immediate win, or a move to a strictly closer LOSS;
- every DRAW position has no immediate win and at least one move to another
  DRAW.

The third one is the interesting invariant. Because it holds for all 13,193
drawn positions at once, both players can keep the game inside the draw set
forever and neither can ever complete a line — a self-contained proof that
those positions are genuinely infinite games rather than merely unresolved.

## Results

**The game is a first-player win.** X forces it in 13 plies, but only with an
edge opening. Centre and corner openings — the strong moves in ordinary
tic-tac-toe — are draws. The ranking is exactly inverted.

**Defence is knife-edge.** After a corner opening O has exactly one saving
reply (the centre) out of eight. After an edge opening O has none. In the
3v3 steady state, 68.6% of positions have precisely one move that is not an
outright blunder.

**A draw is a literal cycle.** After 1.Xb2 best play closes into an 8-ply loop
that repeats forever; the corner opening's loop is 14 plies.

**The variant is hostile to fixed-depth search.** This is a property of the
game, not of any one engine; `depth-study.ts` uses the project's alpha-beta
searcher as an instrument to measure it. Three of the fifteen extra plies made
play strictly worse — 8→9, 10→11, 12→13, each a step onto an odd depth, where
the search ends on the searcher's own move rather than the reply. In drawn
positions specifically:

| Depth | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Blunder rate | 6.25% | 5.62% | 6.55% | 2.49% | 3.52% | 1.03% | 1.27% | 0.36% | 0.36% | 0.00% |

Every even depth beats the odd depth one ply shallower, on both overall and
drawn-position rates, at every level measured. The cause is structural: won
positions contain terminal nodes for the search to stand on, drawn positions
never do at any depth, so evaluation biases like parity are never corrected by
contact with ground truth. Drawn positions are 2×–18× more error-prone than
won ones throughout.

There is a ceiling — depth 16 blunders in none of the 13,193 drawn positions —
but it is an empirical property of this evaluation function, not a theorem like
classic tic-tac-toe's provable depth 9.

**The parity split is usable, not just observable.** A real engine has no
tablebase, but it can compare its move at two adjacent depths. When depth `d`
and `d+1` disagree, `d`'s blunder rate jumps by 20–34x:

| Pair | Depths disagree | Blunder \| disagree | Blunder \| agree | Lift |
| --- | --- | --- | --- | --- |
| 6→7 | 6.9% | 51.24% | 1.81% | 28.3x |
| 7→8 | 6.3% | 33.35% | 1.66% | 20.1x |
| 9→10 | 5.1% | 44.01% | 1.31% | 33.7x |
| 10→11 | 4.8% | 6.33% | 1.33% | 4.8x |

That set is small (5–7% of positions) but holds 55–68% of the blunders, so it
works as a cheap runtime flag for "this position is not resolved" — the kind of
signal that is available in games far too large to solve. It also fires exactly
where the theory says it should: at every pair, disagreement is roughly ten
times more common in drawn positions (9–12%) than in won ones (0.3–2.3%),
which is the missing-terminal-node effect showing up without an oracle. The
signal does weaken at the deepest pair measured (10→11, 4.8x lift, 19% recall).

**Given one more ply, spend it on parity rather than depth — above depth 5.**
Blunder rate over a balanced 26,386-position sample:

| From | +1 ply (to even) | +2 plies (to odd) |
| --- | --- | --- |
| 5 (7.08%) | 5.22% | **3.67%** |
| 7 (3.67%) | **3.30%** | 3.48% |
| 9 (3.48%) | **1.57%** | 1.94% |

From depth 7 and 9 the single even ply is both cheaper and better than two more
plies. From depth 5 it is not — there, raw depth still wins, so the rule only
holds once the search is deep enough for parity to dominate the remaining
error.
