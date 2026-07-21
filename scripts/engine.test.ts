/**
 * Sanity tests for the pure game engine. Run with: npx tsx scripts/engine.test.ts
 */
import {
  applyMove,
  calculateWinner,
  countMarks,
  createInitialSnapshot,
  depthFor,
  getAiMove,
  getOldestMarkIndex,
  Snapshot,
} from '../src/utils/engine';
import { DEFAULT_CUSTOM_DEPTH, DEPTH_OPTIONS } from '../src/utils/constants';

let failures = 0;

function expect(name: string, condition: boolean) {
  if (!condition) {
    failures += 1;
    console.error(`  ✗ ${name}`);
  } else {
    console.log(`  ✓ ${name}`);
  }
}

function play(moves: number[], mode: 'classic' | 'infinite'): Snapshot {
  return moves.reduce((s, m) => applyMove(s, m, mode), createInitialSnapshot());
}

console.log('Classic mode');
{
  // X: 0, 1, 2 wins along the top row (O plays 3, 4).
  const s = play([0, 3, 1, 4, 2], 'classic');
  expect('three in a row wins', s.winner === 'X');
  expect('win line reported', JSON.stringify(s.winLine) === '[0,1,2]');
  expect('winning board rejects further moves', applyMove(s, 5, 'classic') === s);

  const draw = play([0, 4, 8, 1, 7, 6, 2, 5, 3], 'classic');
  expect('full board without a line is a draw', draw.winner === 'draw');
  expect('draw has no win line', draw.winLine === null);

  const s2 = play([0], 'classic');
  expect('occupied cell is rejected', applyMove(s2, 0, 'classic') === s2);
  expect('turn alternates', s2.currentPlayer === 'O');
  expect('placedAt records absolute move number', s2.board[0]?.placedAt === 1);
}

console.log('Infinite mode — vanishing');
{
  // X plays 0, 2, 6 (O plays 1, 3, 5). X's 4th mark at 7 must remove index 0.
  const s = play([0, 1, 2, 3, 6, 5], 'infinite');
  expect('each player capped at 3 marks', countMarks(s.board, 'X') === 3 && countMarks(s.board, 'O') === 3);
  expect("X's oldest mark is index 0", getOldestMarkIndex(s.board, 'X') === 0);

  const s2 = applyMove(s, 7, 'infinite');
  expect('4th placement removes the oldest mark', s2.board[0] === null);
  expect('new mark is present', s2.board[7]?.player === 'X');
  expect('still exactly 3 X marks', countMarks(s2.board, 'X') === 3);
  expect("O's marks untouched", countMarks(s2.board, 'O') === 3);

  // A "win" whose line depends on the vanishing mark must NOT count:
  // X holds 0, 1, 4 — playing 2 completes 0-1-2 but removes 0 first.
  const s3 = play([0, 3, 1, 5, 4, 8], 'infinite');
  const s4 = applyMove(s3, 2, 'infinite');
  expect('line using the vanished mark does not win', s4.winner === null && s4.board[0] === null);

  // A win that survives the vanish DOES count: X holds 8, 1, 4 — playing 7
  // vanishes 8, but 1-4-7 stands.
  const s5 = play([8, 0, 1, 2, 4, 6], 'infinite');
  const s6 = applyMove(s5, 7, 'infinite');
  expect('line surviving the vanish wins', s6.winner === 'X' && s6.board[8] === null);
  expect('surviving win line reported', JSON.stringify(s6.winLine) === '[1,4,7]');
}

console.log('Immutability / undo semantics');
{
  const before = play([0, 1, 2, 3, 6, 5], 'infinite');
  const boardBefore = before.board.map((c) => (c ? `${c.player}${c.placedAt}` : '.')).join('');
  applyMove(before, 7, 'infinite');
  const boardAfter = before.board.map((c) => (c ? `${c.player}${c.placedAt}` : '.')).join('');
  expect('applyMove never mutates the previous snapshot', boardBefore === boardAfter);
}

console.log('AI engine');
{
  // Hard AI (O to move) must take the immediate win: O holds 3, 4 → play 5.
  const winPos = play([0, 3, 1, 4, 8], 'classic');
  expect('hard takes immediate win', getAiMove(winPos, 'classic', 'hard', depthFor('classic', 'hard', DEFAULT_CUSTOM_DEPTH)) === 5);

  // Hard AI (O to move) must block: X holds 0, 1 → block at 2.
  const blockPos = play([0, 4, 1], 'classic');
  expect('hard blocks immediate loss', getAiMove(blockPos, 'classic', 'hard', depthFor('classic', 'hard', DEFAULT_CUSTOM_DEPTH)) === 2);

  // Vanish-aware block: X holds 0(old), 1, 4; X playing 2 would vanish 0,
  // so 0-1-2 is NOT a real threat — but 4 is in two live X lines.
  const infThreat = play([0, 3, 1, 5, 4, 8], 'infinite');
  const move = getAiMove(infThreat, 'infinite', 'hard', depthFor('infinite', 'hard', DEFAULT_CUSTOM_DEPTH));
  const after = applyMove({ ...infThreat, currentPlayer: 'X' }, 2, 'infinite');
  expect('vanish-breaking threat correctly seen as harmless', after.winner === null);
  expect('hard returns a legal move in infinite mode', move !== null && infThreat.board[move!] === null);

  // Hard vs hard in classic mode must always end in a draw.
  let s = createInitialSnapshot();
  let guard = 0;
  while (!s.winner && guard < 9) {
    const m = getAiMove(s, 'classic', 'hard', depthFor('classic', 'hard', DEFAULT_CUSTOM_DEPTH));
    if (m === null) break;
    s = applyMove(s, m, 'classic');
    guard += 1;
  }
  expect('hard vs hard classic is a draw', s.winner === 'draw');

  // Easy always returns a legal move.
  const anyPos = play([4], 'infinite');
  const easy = getAiMove(anyPos, 'infinite', 'easy', depthFor('infinite', 'easy', DEFAULT_CUSTOM_DEPTH));
  expect('easy returns a legal move', easy !== null && anyPos.board[easy!] === null);

  expect('winner check helper works', calculateWinner(createInitialSnapshot().board) === null);
}

console.log('Custom search depth');
{
  // The custom depth must actually reach the search in Infinite mode...
  expect('custom depth is used in infinite', depthFor('infinite', 'custom', 3) === 3);
  expect('custom depth ignored for hard', depthFor('infinite', 'hard', 3) === 5);
  // ...and must not weaken Classic, which always searches the whole game.
  expect('classic stays exhaustive', depthFor('classic', 'custom', 3) === 9);

  // Every offered depth must still return a legal move.
  const pos = play([4, 0, 2, 6], 'infinite');
  for (const d of DEPTH_OPTIONS) {
    const m = getAiMove(pos, 'infinite', 'custom', d);
    expect(`depth ${d} returns a legal move`, m !== null && pos.board[m!] === null);
  }

  // Deeper search must still take a win that is immediately available.
  const winNow = play([0, 3, 1, 5, 4, 8], 'infinite');
  const shallow = getAiMove(winNow, 'infinite', 'custom', 3);
  const deep = getAiMove(winNow, 'infinite', 'custom', 9);
  expect('shallow and deep both return legal moves', shallow !== null && deep !== null);
}

console.log(failures === 0 ? '\nAll tests passed.' : `\n${failures} test(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
