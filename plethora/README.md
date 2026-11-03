# Quantum Tic Tac Toe · Plethora Bit

A single-file [Plethora](https://create.plethora.studio) Bit of the Quantum
variant, player versus computer only. The rules engine and the AI are plain-JS
ports of `src/utils/quantum.ts` and `src/utils/quantumAi.ts`; everything the
player sees is new and built for a phone inside Plethora's full-screen WebView.

Built against Plethora context `plethora-agent-context-2026-10-22.1`, SDK 1.7.0,
runtime `plethora-bit@2`. Re-read https://agent.plethora.studio/v1/agent/start.md
before changing the host integration: the contract moves.

## Layout

```
plethora/
  plethora.json       manifest (fullscreen, immersive onboarding, streak leaderboard, tuning knobs)
  src/engine.mjs      rules engine port (entanglement forest, collapse options, sudden-death scoring)
  src/ai.mjs          computer opponent port (iterative deepening alpha-beta, time budget)
  src/bit.mjs         host integration: surfaces, layout, rendering, input, coaching, result sheet, music
  build.mjs           concatenates src/*.mjs into dist/main.js (one IIFE, first line is the Plethora marker)
  dist/main.js        the uploaded source; rebuild after any edit, never hand-edit
  test/               engine tests, differential test against the TypeScript original
  harness/            local mock of the Plethora host for browser testing (not uploaded)
  upload.mjs          draft upload with context-version check and idempotency handling
```

## Commands

```sh
node plethora/build.mjs                                 # rebuild dist/main.js
node plethora/test/engine.test.mjs                      # engine + AI tests (hand cases, fuzz invariants)
npx --yes tsx plethora/test/differential.test.ts        # lockstep comparison with src/utils/quantum.ts
python3 -m http.server 8765 --directory plethora        # then open http://localhost:8765/harness/
```

The harness emulates `ctx` (safe areas, logo button, taps, score/leaderboard,
local memory, music, fx, tuning, pause/resume, destroy/re-init). It is a dev
tool: passing there is not proof on a phone, and the Bit must never depend on
harness-only behaviour.

## Upload a draft

Pairing and upload follow https://agent.plethora.studio/v1/agent/upload.md.
Tokens last four hours and must stay out of the repo; keep them in a scratch
directory and pass the path:

```sh
node plethora/upload.mjs --token-file <token.json> --feedback <agentFeedback.json> --dry-run
node plethora/upload.mjs --token-file <token.json> --feedback <agentFeedback.json>
```

The script refuses to upload when the live context version differs from the
one the Bit was built against, reuses its Idempotency-Key only for an identical
payload, and writes redacted receipts next to the token file. Publishing stays
a manual step in Plethora (Create → Drafts).

## Design notes

- You are X and always move first; the computer measures and moves as O.
- Difficulty (Easy / Medium / Hard) switches at the top; changing it mid-game
  starts a new game. Hard's think budget and the computer's reply pause are
  creator tuning knobs.
- First use is a coached real game (manifest onboarding `immersive`): place a
  spooky mark, watch the computer entangle with it, close the loop, see the
  collapse, then play on. Skippable; replayable from the rules sheet.
- When the computer closes a loop you pick the outcome from two mini-board
  cards (each captioned with what it completes); the main board previews the
  selected outcome before you collapse it. When you close a loop, the computer's
  chosen outcome is previewed and named for a beat before it settles.
- While a cell is selected, amber dashed rings mark the cells that would close
  a loop and hand the choice to the computer. Threads between non-adjacent
  cells curve so they do not read as passing through the cell between.
- The leaderboard is a per-difficulty win streak (`memory.records.streak`,
  dimension `difficulty`). Streaks, best streaks, per-difficulty records, the
  chosen difficulty, mute and the coaching flag persist in `memory.local.profile`.
  Leaving a game after both sides have moved resets the current streak, so a
  losing position cannot be abandoned to protect a leaderboard entry; a `live`
  marker in the profile catches games abandoned by closing the Bit.
- The saved profile is read (with retries) before readiness, bounded to 1.5 s;
  nothing is written back until it has been read, and choices made while it
  loads are kept. Results are written immediately, other changes debounced,
  and a pending write is flushed on destroy.
- After a game the result sheet offers View board (to study the position, with
  both lines shown on a tie-break) and Play again; tapping the board only
  reveals it.
- Music: the `drift` preset in Lydian, rising in intensity while a measurement
  is open; stings on placement, loop closure, collapse and results. Mute is in
  the footer and remembered.
