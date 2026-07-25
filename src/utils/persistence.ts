import { DEFAULT_CUSTOM_DEPTH, DEPTH_OPTIONS } from './constants';
import { Difficulty, GameMode } from './engine';
import { readJson, STORAGE_KEYS, writeJson } from './storage';

export type Opponent = 'human' | 'ai';

export interface Scores {
  X: number;
  O: number;
  draws: number;
}

/**
 * Scores are kept per engine rather than per mode: Classic and Infinite share
 * one game hook (and therefore one running tally), Quantum has its own.
 */
export type ScoreLedger = 'board' | 'quantum';

export type ScoreBook = Record<ScoreLedger, Scores>;

export interface PersistedSettings {
  mode: GameMode;
  opponent: Opponent;
  difficulty: Difficulty;
  customDepth: number;
}

export const DEFAULT_SETTINGS: PersistedSettings = {
  mode: 'classic',
  opponent: 'human',
  difficulty: 'medium',
  customDepth: DEFAULT_CUSTOM_DEPTH,
};

const emptyScores = (): Scores => ({ X: 0, O: 0, draws: 0 });

export const DEFAULT_SCORE_BOOK = (): ScoreBook => ({
  board: emptyScores(),
  quantum: emptyScores(),
});

const MODES: GameMode[] = ['classic', 'infinite', 'quantum'];
const OPPONENTS: Opponent[] = ['human', 'ai'];
const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard', 'custom'];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const count = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 ? Math.floor(value) : 0;

function parseScores(value: unknown): Scores {
  if (!isRecord(value)) return emptyScores();
  return { X: count(value.X), O: count(value.O), draws: count(value.draws) };
}

/**
 * Settings survive a reload, but a rejected field falls back to its default
 * rather than the whole blob being discarded — a stale `mode` shouldn't also
 * reset the user's theme-adjacent choices.
 */
function parseSettings(value: unknown): PersistedSettings {
  if (!isRecord(value)) return DEFAULT_SETTINGS;
  const mode = MODES.find((m) => m === value.mode) ?? DEFAULT_SETTINGS.mode;
  const opponent = OPPONENTS.find((o) => o === value.opponent) ?? DEFAULT_SETTINGS.opponent;
  const difficulty =
    DIFFICULTIES.find((d) => d === value.difficulty) ?? DEFAULT_SETTINGS.difficulty;
  const customDepth = DEPTH_OPTIONS.find((d) => d === value.customDepth) ?? DEFAULT_SETTINGS.customDepth;
  return { mode, opponent, difficulty, customDepth };
}

export function loadSettings(): PersistedSettings {
  return readJson(STORAGE_KEYS.settings, parseSettings) ?? DEFAULT_SETTINGS;
}

export function saveSettings(settings: PersistedSettings): void {
  writeJson(STORAGE_KEYS.settings, settings);
}

export function loadScoreBook(): ScoreBook {
  return (
    readJson(STORAGE_KEYS.scores, (value) => {
      if (!isRecord(value)) return null;
      return { board: parseScores(value.board), quantum: parseScores(value.quantum) };
    }) ?? DEFAULT_SCORE_BOOK()
  );
}

/** Writes one ledger without clobbering the other, which lives in the same key. */
export function saveScores(ledger: ScoreLedger, scores: Scores): void {
  writeJson(STORAGE_KEYS.scores, { ...loadScoreBook(), [ledger]: scores });
}
