# Infinite Tic-Tac-Toe

An ad-free, minimalist Tic-Tac-Toe for iOS and Android, built with React Native, Expo, and TypeScript. Features a Classic mode and an Infinite (vanishing) mode, full Undo/Redo history, Pass & Play, and an AI opponent with three difficulty levels.

## Game modes

- **Classic** — standard rules; the game ends on three-in-a-row or a full board.
- **Infinite** — each player keeps at most **3 marks** on the board. Placing a 4th mark instantly removes that player's oldest mark. The mark that will vanish next is shown at 30% opacity. Lines completed only *through* the vanishing mark do not count — the removal happens before the win check.

## Features

- **Undo / Redo** — every move is a snapshot on an immutable timeline; undo restores vanished marks perfectly. Against the AI, one undo reverts a full exchange (your move + the AI's reply).
- **AI opponent** — Easy (random), Medium (50% optimal), Hard (immediate win → immediate block → depth-limited minimax with alpha-beta pruning that simulates the vanishing mechanic during search).
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
```

## Run

```sh
npm install
npm start          # Expo dev server (press i / a for iOS / Android)
npm run web        # run in the browser
npm test           # engine tests
npx tsc --noEmit   # type check
```
