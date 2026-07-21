/** The 8 possible three-in-a-row lines on a 3x3 board. */
export const WIN_LINES: ReadonlyArray<readonly [number, number, number]> = [
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

/** Infinite mode: marks a player may keep on the board at once. */
export const MAX_ACTIVE_MARKS = 3;

/** Opacity applied to the mark that will vanish on its owner's next move. */
export const VANISHING_OPACITY = 0.3;

/** Opacity for marks outside the winning line (or all marks on a draw). */
export const TERMINAL_DIM_OPACITY = 0.35;

/** Depth limit for the Hard minimax search in Infinite mode. */
export const MINIMAX_DEPTH = 5;

/** Classic boards are finite, so Hard can afford a full-depth search. */
export const MINIMAX_DEPTH_CLASSIC = 9;

/**
 * Depths offered by the Custom difficulty. Only meaningful in Infinite mode:
 * Classic is exhaustive at 9 regardless, so depth changes nothing there.
 * Measured worst-case move cost in Infinite: 3 -> ~1ms, 5 -> ~2ms,
 * 7 -> ~12ms, 9 -> ~39ms.
 */
export const DEPTH_OPTIONS = [3, 5, 7, 9] as const;
export const DEFAULT_CUSTOM_DEPTH = 7;

/** Delay before the AI plays, so the exchange reads naturally. */
export const AI_MOVE_DELAY_MS = 420;

export const RADIUS = {
  cell: 16,
  pill: 999,
  sheet: 24,
} as const;

export const SPACING = {
  cellGap: 12,
  screenPadding: 24,
} as const;
