# Solving Infinite mode

An exact solve of the Infinite (3-mark vanishing) variant, plus a grading of
the shipped AI against it.

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
