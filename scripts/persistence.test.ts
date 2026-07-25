/**
 * Tests for the persistence layer. Run with: npx tsx scripts/persistence.test.ts
 *
 * These functions guard the one place the app trusts data it did not create:
 * whatever happens to be sitting in localStorage. That value can be stale from
 * an older build, hand-edited, truncated, or absent entirely, and storage
 * itself can throw (Safari private mode) or refuse writes (quota). None of
 * that may crash the app or poison game state, so every path is exercised here
 * against a fake Storage rather than a real browser.
 */
import { DEFAULT_CUSTOM_DEPTH } from '../src/utils/constants';
import {
  DEFAULT_SCORE_BOOK,
  DEFAULT_SETTINGS,
  loadScoreBook,
  loadSettings,
  saveScores,
  saveSettings,
} from '../src/utils/persistence';
import { migrateLegacyKeys, readFlag, STORAGE_KEYS, writeFlag } from '../src/utils/storage';

let failures = 0;

function expect(name: string, condition: boolean) {
  if (!condition) {
    failures += 1;
    console.error(`  ✗ ${name}`);
  } else {
    console.log(`  ✓ ${name}`);
  }
}

/** Minimal in-memory Storage, with switches for the two ways it can fail. */
class FakeStorage {
  private map = new Map<string, string>();
  throwOnRead = false;
  throwOnWrite = false;

  getItem(key: string): string | null {
    if (this.throwOnRead) throw new Error('SecurityError');
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    if (this.throwOnWrite) throw new Error('QuotaExceededError');
    this.map.set(key, value);
  }
  removeItem(key: string): void {
    if (this.throwOnWrite) throw new Error('QuotaExceededError');
    this.map.delete(key);
  }
  seed(key: string, value: string) {
    this.map.set(key, value);
  }
  has(key: string) {
    return this.map.has(key);
  }
  raw(key: string) {
    return this.map.get(key) ?? null;
  }
}

const globals = globalThis as { localStorage?: unknown };

function withStorage(fake: FakeStorage | null, run: () => void) {
  const previous = globals.localStorage;
  if (fake) globals.localStorage = fake;
  else delete globals.localStorage;
  try {
    run();
  } finally {
    if (previous === undefined) delete globals.localStorage;
    else globals.localStorage = previous;
  }
}

// ---------------------------------------------------------------------------
console.log('No storage available (native, or privacy mode)');
// ---------------------------------------------------------------------------
withStorage(null, () => {
  expect('settings fall back to defaults', loadSettings().mode === DEFAULT_SETTINGS.mode);
  expect('scores fall back to an empty book', loadScoreBook().board.X === 0);
  expect('flags read false', readFlag(STORAGE_KEYS.quantumWalkthroughSeen) === false);

  let threw = false;
  try {
    saveSettings(DEFAULT_SETTINGS);
    saveScores('board', { X: 1, O: 0, draws: 0 });
    writeFlag(STORAGE_KEYS.quantumWalkthroughSeen, true);
  } catch {
    threw = true;
  }
  expect('writes are silently dropped rather than throwing', !threw);
});

// ---------------------------------------------------------------------------
console.log('\nRound trips');
// ---------------------------------------------------------------------------
{
  const fake = new FakeStorage();
  withStorage(fake, () => {
    saveSettings({
      mode: 'quantum',
      opponent: 'ai',
      difficulty: 'hard',
      customDepth: 9,
    });
    const loaded = loadSettings();
    expect('mode survives a reload', loaded.mode === 'quantum');
    expect('opponent survives a reload', loaded.opponent === 'ai');
    expect('difficulty survives a reload', loaded.difficulty === 'hard');
    expect('custom depth survives a reload', loaded.customDepth === 9);

    saveScores('quantum', { X: 2, O: 1, draws: 3 });
    const book = loadScoreBook();
    expect('quantum ledger round trips', book.quantum.X === 2 && book.quantum.draws === 3);
    expect('the other ledger stays empty', book.board.X === 0);

    // Both ledgers share one key, so writing one must not clobber the other.
    saveScores('board', { X: 5, O: 0, draws: 0 });
    const after = loadScoreBook();
    expect('writing one ledger preserves the other', after.quantum.X === 2 && after.board.X === 5);

    writeFlag(STORAGE_KEYS.quantumWalkthroughSeen, true);
    expect('flag round trips', readFlag(STORAGE_KEYS.quantumWalkthroughSeen) === true);
    writeFlag(STORAGE_KEYS.quantumWalkthroughSeen, false);
    expect('clearing a flag removes it', readFlag(STORAGE_KEYS.quantumWalkthroughSeen) === false);
  });
}

// ---------------------------------------------------------------------------
console.log('\nHostile and stale stored values');
// ---------------------------------------------------------------------------
{
  const fake = new FakeStorage();
  withStorage(fake, () => {
    fake.seed(STORAGE_KEYS.settings, '{ not json');
    expect('unparseable settings fall back to defaults', loadSettings().mode === DEFAULT_SETTINGS.mode);

    fake.seed(STORAGE_KEYS.settings, 'null');
    expect('null settings fall back to defaults', loadSettings().difficulty === DEFAULT_SETTINGS.difficulty);

    fake.seed(STORAGE_KEYS.settings, '"a string"');
    expect('a non-object blob falls back to defaults', loadSettings().opponent === DEFAULT_SETTINGS.opponent);

    // A field the current build no longer recognises must not take the rest down.
    fake.seed(
      STORAGE_KEYS.settings,
      JSON.stringify({ mode: 'hyperbolic', opponent: 'ai', difficulty: 'hard', customDepth: 7 })
    );
    const partial = loadSettings();
    expect('an unknown mode falls back to its default', partial.mode === DEFAULT_SETTINGS.mode);
    expect('valid siblings of a bad field survive', partial.opponent === 'ai' && partial.difficulty === 'hard');

    fake.seed(
      STORAGE_KEYS.settings,
      JSON.stringify({ mode: 'quantum', opponent: 'ai', difficulty: 'hard', customDepth: 'banana' })
    );
    expect('a non-numeric depth falls back', loadSettings().customDepth === DEFAULT_CUSTOM_DEPTH);

    fake.seed(
      STORAGE_KEYS.settings,
      JSON.stringify({ mode: 'quantum', opponent: 'ai', difficulty: 'hard', customDepth: 4 })
    );
    expect('an off-menu depth falls back', loadSettings().customDepth === DEFAULT_CUSTOM_DEPTH);

    fake.seed(STORAGE_KEYS.scores, JSON.stringify({ board: { X: -3, O: 1.7, draws: 'many' } }));
    const book = loadScoreBook();
    expect('a negative tally is rejected', book.board.X === 0);
    expect('a fractional tally is floored', book.board.O === 1);
    expect('a non-numeric tally is rejected', book.board.draws === 0);
    expect('a missing ledger is filled in', book.quantum.X === 0);

    fake.seed(STORAGE_KEYS.scores, JSON.stringify({ board: { X: Infinity, O: NaN, draws: 0 } }));
    const wild = loadScoreBook();
    expect('Infinity is rejected', wild.board.X === 0);
    expect('NaN is rejected', wild.board.O === 0);
  });
}

// ---------------------------------------------------------------------------
console.log('\nStorage that throws');
// ---------------------------------------------------------------------------
{
  const fake = new FakeStorage();
  withStorage(fake, () => {
    fake.throwOnRead = true;
    expect('a throwing read yields defaults', loadSettings().mode === DEFAULT_SETTINGS.mode);
    expect('a throwing read yields an empty book', loadScoreBook().board.X === 0);
    expect('a throwing read yields a false flag', readFlag(STORAGE_KEYS.settings) === false);

    fake.throwOnRead = false;
    fake.throwOnWrite = true;
    let threw = false;
    try {
      saveSettings(DEFAULT_SETTINGS);
      writeFlag(STORAGE_KEYS.quantumWalkthroughSeen, true);
    } catch {
      threw = true;
    }
    expect('a quota failure does not propagate', !threw);
  });
}

// ---------------------------------------------------------------------------
console.log('\nLegacy key migration (pre-rename installs)');
// ---------------------------------------------------------------------------
{
  const fake = new FakeStorage();
  withStorage(fake, () => {
    fake.seed('infinite:settings', JSON.stringify({ ...DEFAULT_SETTINGS, mode: 'infinite' }));
    fake.seed('infinite:scores', JSON.stringify({ board: { X: 4, O: 2, draws: 1 } }));
    fake.seed('infinite:quantum-walkthrough-seen', '1');
    fake.seed('infinite:install-dismissed', '1');

    migrateLegacyKeys();

    expect('old settings move across', loadSettings().mode === 'infinite');
    expect('old scores move across', loadScoreBook().board.X === 4);
    expect('old flags move across', readFlag(STORAGE_KEYS.quantumWalkthroughSeen) === true);
    expect('the install flag moves across', readFlag(STORAGE_KEYS.installDismissed) === true);
    expect('legacy settings key is cleaned up', !fake.has('infinite:settings'));
    expect('legacy scores key is cleaned up', !fake.has('infinite:scores'));
  });
}
{
  const fake = new FakeStorage();
  withStorage(fake, () => {
    // A current value always wins over a leftover legacy one.
    fake.seed('infinite:settings', JSON.stringify({ ...DEFAULT_SETTINGS, mode: 'infinite' }));
    fake.seed(STORAGE_KEYS.settings, JSON.stringify({ ...DEFAULT_SETTINGS, mode: 'quantum' }));

    migrateLegacyKeys();

    expect('an existing value is not overwritten', loadSettings().mode === 'quantum');
    expect('the legacy key is still cleared', !fake.has('infinite:settings'));
  });
}
{
  const fake = new FakeStorage();
  withStorage(fake, () => {
    fake.seed('infinite:scores', JSON.stringify({ board: { X: 1, O: 0, draws: 0 } }));
    migrateLegacyKeys();
    const first = fake.raw(STORAGE_KEYS.scores);
    migrateLegacyKeys();
    expect('migration is idempotent', fake.raw(STORAGE_KEYS.scores) === first);
  });
}
withStorage(null, () => {
  let threw = false;
  try {
    migrateLegacyKeys();
  } catch {
    threw = true;
  }
  expect('migration is a no-op without storage', !threw);
});

// ---------------------------------------------------------------------------
console.log('\nDefaults are self-consistent');
// ---------------------------------------------------------------------------
{
  expect('default depth is one of the offered options', DEFAULT_SETTINGS.customDepth === DEFAULT_CUSTOM_DEPTH);
  const book = DEFAULT_SCORE_BOOK();
  expect('a fresh score book is zeroed', book.board.X === 0 && book.quantum.draws === 0);
  book.board.X = 99;
  expect('each call returns a fresh book', DEFAULT_SCORE_BOOK().board.X === 0);
}

console.log(failures === 0 ? '\nAll tests passed.' : `\n${failures} test(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
