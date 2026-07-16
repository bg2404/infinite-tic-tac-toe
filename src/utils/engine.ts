import {
  BOARD_CELLS,
  MAX_ACTIVE_MARKS,
  MINIMAX_DEPTH,
  MINIMAX_DEPTH_CLASSIC,
  WIN_LINES,
} from './constants';

export type Player = 'X' | 'O';
export type Winner = Player | 'draw' | null;
export type GameMode = 'classic' | 'infinite';
export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Mark {
  player: Player;
  /** Absolute move number (1-based) at which this mark was placed. */
  placedAt: number;
}

export type Board = ReadonlyArray<Mark | null>;

export type WinLine = readonly [number, number, number];

export interface Snapshot {
  board: Board;
  currentPlayer: Player;
  moveNumber: number;
  winner: Winner;
  /** Cell indices of the completed line when winner is a player. */
  winLine: WinLine | null;
}

export const otherPlayer = (player: Player): Player => (player === 'X' ? 'O' : 'X');

export const createInitialSnapshot = (): Snapshot => ({
  board: Array<Mark | null>(BOARD_CELLS).fill(null),
  currentPlayer: 'X',
  moveNumber: 0,
  winner: null,
  winLine: null,
});

export function findWinLine(board: Board): { player: Player; line: WinLine } | null {
  for (const line of WIN_LINES) {
    const [a, b, c] = line;
    const mark = board[a];
    if (mark && board[b]?.player === mark.player && board[c]?.player === mark.player) {
      return { player: mark.player, line };
    }
  }
  return null;
}

export function calculateWinner(board: Board): Player | null {
  return findWinLine(board)?.player ?? null;
}

export function getAvailableMoves(board: Board): number[] {
  const moves: number[] = [];
  board.forEach((cell, index) => {
    if (!cell) moves.push(index);
  });
  return moves;
}

export function countMarks(board: Board, player: Player): number {
  return board.reduce((count, cell) => (cell?.player === player ? count + 1 : count), 0);
}

export function getOldestMarkIndex(board: Board, player: Player): number | null {
  let oldest: number | null = null;
  board.forEach((cell, index) => {
    if (cell?.player === player && (oldest === null || cell.placedAt < board[oldest]!.placedAt)) {
      oldest = index;
    }
  });
  return oldest;
}

/**
 * Applies a move immutably and returns the next snapshot.
 * In Infinite mode, placing a 4th mark removes that player's oldest mark
 * before the win check, so vanished marks can never contribute to a line.
 * Returns the same snapshot reference if the move is illegal.
 */
export function applyMove(snapshot: Snapshot, index: number, mode: GameMode): Snapshot {
  if (snapshot.winner || index < 0 || index >= BOARD_CELLS || snapshot.board[index]) {
    return snapshot;
  }

  const moveNumber = snapshot.moveNumber + 1;
  const board: Array<Mark | null> = snapshot.board.map((cell, i) =>
    i === index ? { player: snapshot.currentPlayer, placedAt: moveNumber } : cell
  );

  if (mode === 'infinite' && countMarks(board, snapshot.currentPlayer) > MAX_ACTIVE_MARKS) {
    const oldest = getOldestMarkIndex(board, snapshot.currentPlayer);
    if (oldest !== null) board[oldest] = null;
  }

  const win = findWinLine(board);
  const isDraw = !win && mode === 'classic' && board.every(Boolean);

  return {
    board,
    currentPlayer: otherPlayer(snapshot.currentPlayer),
    moveNumber,
    winner: win?.player ?? (isDraw ? 'draw' : null),
    winLine: win?.line ?? null,
  };
}

// ---------------------------------------------------------------------------
// AI engine
// ---------------------------------------------------------------------------

/** Line potential for 0..3 own marks in an uncontested line. */
const LINE_SCORES = [0, 2, 12, 150] as const;
const WIN_SCORE = 1000;
const CENTER_INDEX = 4;
const CORNER_INDICES = [0, 2, 6, 8] as const;
/** Center first, then corners, then edges — improves alpha-beta pruning. */
const MOVE_ORDER = [4, 0, 2, 6, 8, 1, 3, 5, 7] as const;

function evaluateBoard(board: Board, ai: Player): number {
  const opponent = otherPlayer(ai);
  let score = 0;

  for (const line of WIN_LINES) {
    let own = 0;
    let theirs = 0;
    for (const index of line) {
      const cell = board[index];
      if (cell?.player === ai) own += 1;
      else if (cell?.player === opponent) theirs += 1;
    }
    if (theirs === 0) score += LINE_SCORES[own];
    if (own === 0) score -= LINE_SCORES[theirs];
  }

  if (board[CENTER_INDEX]?.player === ai) score += 4;
  else if (board[CENTER_INDEX]?.player === opponent) score -= 4;

  for (const index of CORNER_INDICES) {
    if (board[index]?.player === ai) score += 1;
    else if (board[index]?.player === opponent) score -= 1;
  }

  return score;
}

/**
 * Depth-limited minimax with alpha-beta pruning. Every child state is
 * produced through applyMove, so in Infinite mode the vanishing of oldest
 * marks is simulated exactly as it happens in real play.
 */
function minimax(
  snapshot: Snapshot,
  mode: GameMode,
  depth: number,
  alpha: number,
  beta: number,
  ai: Player
): number {
  if (snapshot.winner === 'draw') return 0;
  if (snapshot.winner) {
    // Prefer faster wins and slower losses (depth is remaining budget).
    return snapshot.winner === ai ? WIN_SCORE + depth : -WIN_SCORE - depth;
  }
  if (depth === 0) return evaluateBoard(snapshot.board, ai);

  const maximizing = snapshot.currentPlayer === ai;
  let best = maximizing ? -Infinity : Infinity;

  for (const move of MOVE_ORDER) {
    if (snapshot.board[move]) continue;
    const value = minimax(applyMove(snapshot, move, mode), mode, depth - 1, alpha, beta, ai);
    if (maximizing) {
      best = Math.max(best, value);
      alpha = Math.max(alpha, value);
    } else {
      best = Math.min(best, value);
      beta = Math.min(beta, value);
    }
    if (beta <= alpha) break;
  }

  return best;
}

/** Immediate win for the side to move, if one exists. */
function findWinningMove(snapshot: Snapshot, mode: GameMode): number | null {
  for (const move of getAvailableMoves(snapshot.board)) {
    if (applyMove(snapshot, move, mode).winner === snapshot.currentPlayer) return move;
  }
  return null;
}

function findBestMove(snapshot: Snapshot, mode: GameMode): number {
  const ai = snapshot.currentPlayer;
  const opponent = otherPlayer(ai);

  // 1. Take an immediate win.
  const winning = findWinningMove(snapshot, mode);
  if (winning !== null) return winning;

  // 2. Block the opponent's immediate win (vanish-aware via applyMove).
  const opponentToMove: Snapshot = { ...snapshot, currentPlayer: opponent };
  const block = findWinningMove(opponentToMove, mode);
  if (block !== null) return block;

  // 3. Otherwise search; center-first ordering favors tactical control.
  const depth = mode === 'classic' ? MINIMAX_DEPTH_CLASSIC : MINIMAX_DEPTH;
  let bestScore = -Infinity;
  let bestMove = getAvailableMoves(snapshot.board)[0];

  for (const move of MOVE_ORDER) {
    if (snapshot.board[move]) continue;
    const score = minimax(applyMove(snapshot, move, mode), mode, depth - 1, -Infinity, Infinity, ai);
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return bestMove;
}

function randomMove(board: Board): number {
  const moves = getAvailableMoves(board);
  return moves[Math.floor(Math.random() * moves.length)];
}

export function getAiMove(snapshot: Snapshot, mode: GameMode, difficulty: Difficulty): number | null {
  if (snapshot.winner || getAvailableMoves(snapshot.board).length === 0) return null;

  switch (difficulty) {
    case 'easy':
      return randomMove(snapshot.board);
    case 'medium':
      return Math.random() < 0.5 ? findBestMove(snapshot, mode) : randomMove(snapshot.board);
    case 'hard':
      return findBestMove(snapshot, mode);
  }
}
