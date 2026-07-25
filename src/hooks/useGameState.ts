import { useCallback, useEffect, useMemo, useState } from 'react';

import { AI_MOVE_DELAY_MS, MAX_ACTIVE_MARKS } from '../utils/constants';
import {
  applyMove,
  countMarks,
  createInitialSnapshot,
  depthFor,
  Difficulty,
  GameMode,
  getAiMove,
  getOldestMarkIndex,
  Player,
  Snapshot,
} from '../utils/engine';
import { Opponent, Scores } from '../utils/persistence';
import { usePersistentScores } from './usePersistentScores';

export type { Opponent, Scores };

export interface GameSettings {
  mode: GameMode;
  opponent: Opponent;
  difficulty: Difficulty;
  /** Search depth used when difficulty is 'custom'. */
  customDepth: number;
}

interface Timeline {
  history: Snapshot[];
  pointer: number;
}

/** The human is always X when playing against the computer. */
export const AI_PLAYER: Player = 'O';

const freshTimeline = (): Timeline => ({ history: [createInitialSnapshot()], pointer: 0 });

/**
 * Immutable-history game state. Every move pushes a full snapshot onto the
 * timeline; Undo/Redo only move the pointer, which is what lets vanished
 * marks reappear perfectly — the old board was never mutated.
 */
export function useGameState({ mode, opponent, difficulty, customDepth }: GameSettings) {
  const [timeline, setTimeline] = useState<Timeline>(freshTimeline);
  const { scores, recordResult, clearScores } = usePersistentScores('board');

  const { history, pointer } = timeline;
  const snapshot = history[pointer];
  const atTip = pointer === history.length - 1;
  const isAiTurn = opponent === 'ai' && !snapshot.winner && snapshot.currentPlayer === AI_PLAYER;

  const commitMove = useCallback(
    (index: number) => {
      const next = applyMove(snapshot, index, mode);
      if (next === snapshot) return;

      setTimeline({ history: [...history.slice(0, pointer + 1), next], pointer: pointer + 1 });
      recordResult(next.winner);
    },
    [snapshot, history, pointer, mode, recordResult]
  );

  /** Human tap handler; ignores taps while the AI owns the turn. */
  const place = useCallback(
    (index: number) => {
      if (isAiTurn) return;
      commitMove(index);
    },
    [isAiTurn, commitMove]
  );

  // Against the AI a single undo/redo spans a full exchange (your move + its reply).
  const stride = opponent === 'ai' ? 2 : 1;

  const undo = useCallback(() => {
    setTimeline((prev) => ({ ...prev, pointer: Math.max(0, prev.pointer - stride) }));
  }, [stride]);

  const redo = useCallback(() => {
    setTimeline((prev) => ({
      ...prev,
      pointer: Math.min(prev.history.length - 1, prev.pointer + stride),
    }));
  }, [stride]);

  const reset = useCallback(() => setTimeline(freshTimeline()), []);

  // Changing the game mode or opponent invalidates the timeline.
  useEffect(() => {
    setTimeline(freshTimeline());
  }, [mode, opponent]);

  // Let the AI respond whenever it holds the turn at the tip of the timeline.
  // (Never mid-history: a redo landing on the AI's turn must not fork it.)
  useEffect(() => {
    if (!isAiTurn || !atTip) return;
    const timer = setTimeout(() => {
      const move = getAiMove(snapshot, mode, difficulty, depthFor(mode, difficulty, customDepth));
      if (move !== null) commitMove(move);
    }, AI_MOVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isAiTurn, atTip, snapshot, mode, difficulty, customDepth, commitMove]);

  // Infinite mode: the current player's oldest mark vanishes on their next
  // placement once they have all three marks down — surface it for the UI.
  const vanishingIndex = useMemo(() => {
    if (mode !== 'infinite' || snapshot.winner) return null;
    if (countMarks(snapshot.board, snapshot.currentPlayer) < MAX_ACTIVE_MARKS) return null;
    return getOldestMarkIndex(snapshot.board, snapshot.currentPlayer);
  }, [mode, snapshot]);

  return {
    snapshot,
    scores,
    clearScores,
    vanishingIndex,
    isAiTurn,
    canUndo: pointer > 0,
    canRedo: pointer < history.length - 1,
    place,
    undo,
    redo,
    reset,
  };
}
