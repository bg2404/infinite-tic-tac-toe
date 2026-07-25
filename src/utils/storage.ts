/**
 * Thin localStorage wrapper. Every access is guarded because Safari private
 * mode throws on reads and writes, and a lost preference is never worth
 * failing over.
 *
 * Capability is detected directly rather than via react-native's `Platform`:
 * native has no localStorage, so the same check covers it, and keeping this
 * module dependency-free lets the persistence tests run under plain node.
 */

export const STORAGE_KEYS = {
  settings: 'ttt:settings',
  scores: 'ttt:scores',
  quantumWalkthroughSeen: 'ttt:quantum-walkthrough-seen',
  installDismissed: 'ttt:install-dismissed',
} as const;

/**
 * Keys used before the app was renamed from "Infinite Tic-Tac-Toe". Migrated
 * once on startup so an existing install keeps its settings and scores; safe to
 * delete once no one is running a build older than the rename.
 */
const LEGACY_KEYS: ReadonlyArray<readonly [legacy: string, current: string]> = [
  ['infinite:settings', STORAGE_KEYS.settings],
  ['infinite:scores', STORAGE_KEYS.scores],
  ['infinite:quantum-walkthrough-seen', STORAGE_KEYS.quantumWalkthroughSeen],
  ['infinite:install-dismissed', STORAGE_KEYS.installDismissed],
];

function storage(): Storage | null {
  try {
    const candidate = (globalThis as { localStorage?: Storage }).localStorage;
    return candidate && typeof candidate.getItem === 'function' ? candidate : null;
  } catch {
    // Access itself throws in some privacy modes.
    return null;
  }
}

/**
 * Moves any pre-rename entries onto their current keys. Idempotent, and never
 * overwrites a value that already exists under the new key.
 */
export function migrateLegacyKeys(): void {
  const store = storage();
  if (!store) return;
  for (const [legacy, current] of LEGACY_KEYS) {
    try {
      const value = store.getItem(legacy);
      if (value === null) continue;
      if (store.getItem(current) === null) store.setItem(current, value);
      store.removeItem(legacy);
    } catch {
      // Quota or private mode; the app works fine without persistence.
    }
  }
}

/**
 * Reads a JSON value and hands it to `parse`, which is responsible for
 * validating the shape. Anything unparseable or rejected yields null, so a
 * stale or hand-edited entry can never poison app state.
 */
export function readJson<T>(key: string, parse: (value: unknown) => T | null): T | null {
  const store = storage();
  if (!store) return null;
  try {
    const raw = store.getItem(key);
    if (raw === null) return null;
    return parse(JSON.parse(raw) as unknown);
  } catch {
    return null;
  }
}

export function writeJson(key: string, value: unknown): void {
  const store = storage();
  if (!store) return;
  try {
    store.setItem(key, JSON.stringify(value));
  } catch {
    // Quota or private mode; the app works fine without persistence.
  }
}

export function readFlag(key: string): boolean {
  const store = storage();
  if (!store) return false;
  try {
    return store.getItem(key) === '1';
  } catch {
    return false;
  }
}

export function writeFlag(key: string, value: boolean): void {
  const store = storage();
  if (!store) return;
  try {
    if (value) store.setItem(key, '1');
    else store.removeItem(key);
  } catch {
    // See writeJson.
  }
}

// Runs once per process, before any read below it can hand back a default.
migrateLegacyKeys();
