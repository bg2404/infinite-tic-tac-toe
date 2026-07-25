import { useCallback, useEffect, useState } from 'react';

import { AI_MOVE_DELAY_MS } from '../utils/constants';
import { Difficulty, Player } from '../utils/engine';
import {
  createInitialQuantumSnapshot,
  forcedCell,
  placeForced,
  placeSpooky,
  QuantumSnapshot,
  resolveCollapse,
} from '../utils/quantum';
import { getQuantumMove, QuantumAiMove } from '../utils/quantumAi';
import { AI_PLAYER, Opponent } from './useGameState';

export interface Scores {
  X: number;
  O: number;
  draws: number;
}

export interface QuantumSettings {
  opponent: Opponent;
  difficulty: Difficulty;
  /** Search depth used when difficulty is 'custom'. */
  customDepth: number;
}

interface Timeline {
  history: QuantumSnapshot[];
  pointer: number;
}

const freshTimeline = (): Timeline => ({ history: [createInitialQuantumSnapshot()], pointer: 0 });

/** Whoever must decide now: the chooser mid-measurement, else the mover. */
const decisionMaker = (snapshot: QuantumSnapshot): Player =>
  snapshot.phase === 'choosingCollapse' && snapshot.pending
    ? snapshot.pending.chooser
    : snapshot.currentPlayer;

const applyAiMove = (snapshot: QuantumSnapshot, move: QuantumAiMove): QuantumSnapshot => {
  switch (move.kind) {
    case 'place':
      return placeSpooky(snapshot, move.a, move.b);
    case 'forced':
      return placeForced(snapshot, move.cell);
    case 'collapse':
      return resolveCollapse(snapshot, move.option);
  }
};

/**
 * Immutable-history state for Quantum mode. Every committed move (a spooky
 * placement, a collapse resolution, or a forced last-cell fill) pushes a full
 * snapshot; Undo/Redo just move the pointer, so entangled states rewind
 * perfectly. Against the computer, the human is always X; the AI (O) both
 * measures the loops the human closes and places its own marks.
 */
export function useQuantumGame({ opponent, difficulty, customDepth }: QuantumSettings) {
  const [timeline, setTimeline] = useState<Timeline>(freshTimeline);
  const [scores, setScores] = useState<Scores>({ X: 0, O: 0, draws: 0 });
  const [selected, setSelected] = useState<number | null>(null);

  const { history, pointer } = timeline;
  const snapshot = history[pointer];
  const atTip = pointer === history.length - 1;
  const isAiTurn =
    opponent === 'ai' && snapshot.phase !== 'gameover' && decisionMaker(snapshot) === AI_PLAYER;

  const pushSnapshot = useCallback((next: QuantumSnapshot) => {
    setTimeline((prev) => ({
      history: [...prev.history.slice(0, prev.pointer + 1), next],
      pointer: prev.pointer + 1,
    }));
    if (next.winner) {
      setScores((prev) =>
        next.winner === 'draw'
          ? { ...prev, draws: prev.draws + 1 }
          : { ...prev, [next.winner as Player]: prev[next.winner as Player] + 1 }
      );
    }
  }, []);

  /**
   * Taps a cell during the placing phase. The first tap selects one cell; the
   * second commits a spooky mark across the pair. Tapping the selected cell
   * again clears the selection. When only one empty cell remains, a single tap
   * places the forced classical mark. Ignored while the AI owns the decision.
   */
  const tapCell = useCallback(
    (cell: number) => {
      if (isAiTurn || snapshot.phase !== 'placing') return;

      const forced = forcedCell(snapshot);
      if (forced !== null) {
        setSelected(null);
        const next = placeForced(snapshot, forced);
        if (next !== snapshot) pushSnapshot(next);
        return;
      }

      if (selected === null) {
        setSelected(cell);
        return;
      }
      if (selected === cell) {
        setSelected(null);
        return;
      }
      const next = placeSpooky(snapshot, selected, cell);
      setSelected(null);
      if (next !== snapshot) pushSnapshot(next);
    },
    [isAiTurn, snapshot, selected, pushSnapshot]
  );

  /** Commits one of the two measurement outcomes (chooser's decision). */
  const chooseCollapse = useCallback(
    (optionIndex: 0 | 1) => {
      if (isAiTurn || snapshot.phase !== 'choosingCollapse') return;
      const next = resolveCollapse(snapshot, optionIndex);
      if (next !== snapshot) pushSnapshot(next);
    },
    [isAiTurn, snapshot, pushSnapshot]
  );

  // Against the AI a single undo/redo spans a full exchange (your move + its reply).
  const stride = opponent === 'ai' ? 2 : 1;

  const undo = useCallback(() => {
    setSelected(null);
    setTimeline((prev) => ({ ...prev, pointer: Math.max(0, prev.pointer - stride) }));
  }, [stride]);

  const redo = useCallback(() => {
    setSelected(null);
    setTimeline((prev) => ({
      ...prev,
      pointer: Math.min(prev.history.length - 1, prev.pointer + stride),
    }));
  }, [stride]);

  const reset = useCallback(() => {
    setSelected(null);
    setTimeline(freshTimeline());
  }, []);

  // A pointer move that lands off a placing phase invalidates any selection.
  useEffect(() => {
    setSelected(null);
  }, [pointer]);

  // Switching opponent invalidates the timeline.
  useEffect(() => {
    setTimeline(freshTimeline());
  }, [opponent]);

  // Let the AI act whenever it owns the decision at the tip of the timeline —
  // this fires once per decision, so it chains a collapse choice into the
  // placement that follows it. Never mid-history: a redo landing on the AI's
  // turn must not fork it.
  useEffect(() => {
    if (!isAiTurn || !atTip) return;
    const timer = setTimeout(() => {
      const move = getQuantumMove(snapshot, difficulty, customDepth);
      if (move) pushSnapshot(applyAiMove(snapshot, move));
    }, AI_MOVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isAiTurn, atTip, snapshot, difficulty, customDepth, pushSnapshot]);

  return {
    snapshot,
    scores,
    selected,
    isAiTurn,
    canUndo: pointer > 0,
    canRedo: pointer < history.length - 1,
    forcedCell: forcedCell(snapshot),
    tapCell,
    chooseCollapse,
    undo,
    redo,
    reset,
  };
}
