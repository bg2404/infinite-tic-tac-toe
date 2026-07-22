# Infinite Tic-Tac-Toe

An ad-free, minimalist Tic-Tac-Toe built with React Native (via Expo) and TypeScript, shipped as an installable web app. Features a Classic mode and an Infinite (vanishing) mode, full Undo/Redo history, Pass & Play, and an AI opponent with four difficulty levels.

## Game modes

- **Classic** — standard rules; the game ends on three-in-a-row or a full board.
- **Infinite** — each player keeps at most **3 marks** on the board. Placing a 4th mark instantly removes that player's oldest mark. The mark that will vanish next is shown at 30% opacity. Lines completed only *through* the vanishing mark do not count — the removal happens before the win check.

## Features

- **Undo / Redo** — every move is a snapshot on an immutable timeline; undo restores vanished marks perfectly. Against the AI, one undo reverts a full exchange (your move + the AI's reply).
- **AI opponent** — Easy (random), Medium (50% optimal), Hard (immediate win →
  immediate block → depth-limited minimax with alpha-beta pruning that simulates
  the vanishing mechanic during search), and **Custom**, which exposes the search
  depth (3/5/7/9) in Settings. Depth only affects Infinite mode — Classic already
  searches the whole game at Hard, so it plays identically at any depth.
  Measured worst-case move cost in Infinite: 3 → ~1ms, 5 → ~2ms, 7 → ~12ms,
  9 → ~39ms.
- **Theme engine** — Light / Dark / Auto with instant switching, no reload.
- **Scandinavian-minimalist UI** — borderless floating cells, spring micro-animations via Reanimated, session scoreboard.

## Project structure

```
src/
  components/   Board, Cell, Header, StatusText, ControlDock, Scoreboard, SettingsModal, SegmentedControl
  hooks/        useGameState — immutable history timeline + AI scheduling
  screens/      GameScreen
  theme/        themes + ThemeProvider (light/dark/auto)
  utils/        constants, engine (pure TS: rules, vanish logic, minimax AI)
scripts/
  engine.test.ts  engine sanity tests
study/
  an exact solve of Infinite mode — see below
```

## The solution

[`study/`](study/) contains a complete solve of Infinite mode and a grading of
depth-limited search against it. It adds no gameplay code; nothing under `src/`
depends on it.

Infinite mode cannot be solved by minimax. Six marks maximum on nine cells
means the board never fills, so there is no draw by exhaustion and no bottom to
the game tree — a game either ends in a line or runs forever, which makes the
state graph cyclic. The solver uses retrograde analysis instead, the technique
behind endgame tablebases, over the 116,074 positions reachable from an empty
board.

What it found:

- **X wins in 13 plies — but only from an edge opening.** Centre and corner
  openings, the strong moves in ordinary tic-tac-toe, are draws. The ranking is
  exactly inverted.
- **Defence is knife-edge.** After a corner opening O has exactly one saving
  reply out of eight; after an edge opening, none. In the 3v3 steady state,
  68.6% of positions have precisely one non-losing move.
- **A draw is a literal cycle.** After `1.Xb2`, best play closes into a loop
  8 plies long that repeats forever.
- **The variant is hostile to fixed-depth search.** Three of fifteen extra
  plies made play strictly *worse*, each a step onto an odd depth. Won
  positions contain terminal nodes for a search to stand on; drawn positions
  never do, at any depth.

[`study/README.md`](study/README.md) has the numbers and the correctness
argument. The write-up is at
[bhaskergoel.com/blog/solving-infinite-tic-tac-toe](https://bhaskergoel.com/blog/solving-infinite-tic-tac-toe),
with an interactive playground at
[bhaskergoel.com/tic-tac-toe-lab](https://bhaskergoel.com/tic-tac-toe-lab).

## Run

```sh
npm install
npm run web        # Expo dev server in the browser
npm start          # Expo dev server (Expo Go, if you want it on a device)
npm test           # engine tests
npm run icons      # regenerate app + PWA icons from theme tokens
npx tsc --noEmit   # type check
```

Study scripts run standalone; most finish in seconds, though the two that
drive the engine over every reachable position take minutes:

```sh
npx tsx study/report-openings.ts   # which openings force a win
npx tsx study/verify-solution.ts   # check the solve against its invariants
npx tsx study/depth-study.ts       # blunder rate by search depth (~6 min)
```

## Deployment

Live at **[bhaskergoel.com/tic-tac-toe](https://bhaskergoel.com/tic-tac-toe)**, served by
its own Vercel project (`infinite-tic-tac-toe`) and proxied in from the main
site via a rewrite in that site's `vercel.json`.

Pushing to `main` deploys automatically. To deploy by hand:
`npx vercel --prod`.

Two details make the subpath work, and both must stay in sync if the path
ever changes:

- `experiments.baseUrl` in app.json — Expo emits the JS bundle at an absolute
  path, so this is what points it at `/tic-tac-toe/…`.
- `build:web` exports to `dist/tic-tac-toe/` — Vercel serves the output
  directory at the domain root, so nesting it makes the served path match
  `baseUrl`. Without this the bundle 404s.

## Install as a web app (PWA)

The web build is an installable PWA — a home-screen icon that runs full-screen
and works offline, no app store needed. In a browser tab the app shows an
install affordance: an **INSTALL** button on Chrome/Android, or
Share → *Add to Home Screen* instructions on iOS Safari.

```sh
npm run build:web   # outputs dist/ — static files, host anywhere
```

The build is configured for **`bhaskergoel.com/tic-tac-toe`** via
`experiments.baseUrl` in app.json — Expo emits the JS bundle at an absolute
path, so that setting is what makes a subpath deploy work. To host it
somewhere else, change `baseUrl` to match the new path (or delete it if
serving from a domain root) and rebuild.

Deploy by copying the contents of `dist/` to a `tic-tac-toe/` directory at
the site root:

```
bhaskergoel.com/
└── tic-tac-toe/        <- contents of dist/
    ├── index.html
    ├── manifest.json
    ├── sw.js
    └── _expo/…
```

`public/` holds the PWA plumbing: `manifest.json`, `index.html` (Expo uses it
as the web HTML template), a service worker (`sw.js`), and the
home-screen icons. All icons are generated by `npm run icons`; the install UI
lives in [`src/hooks/useInstallPrompt.ts`](src/hooks/useInstallPrompt.ts) and
[`src/components/InstallBanner.tsx`](src/components/InstallBanner.tsx).

> The service worker needs a secure context, so offline mode works over HTTPS
> or `localhost` — not a plain-HTTP LAN address.
