import { useCallback, useEffect, useMemo, useState } from 'react';

import { AI_MOVE_DELAY_MS } from '../utils/constants';
import { Difficulty, Player } from '../utils/engine';
import {
  createInitialQuantumSnapshot,
  entanglementHighlight,
  EntanglementHighlight,
  forcedCell,
  placeForced,
  placeSpooky,
  QuantumSnapshot,
  resolveCollapse,
} from '../utils/quantum';
import { Opponent, Scores } from '../utils/persistence';
import { getQuantumMoveAsync } from '../utils/quantumAiAsync';
import { QuantumAiMove } from '../utils/quantumAi';
import { redoActorRun, undoActorRun } from '../utils/timelineNav';
import { AI_PLAYER } from './useGameState';
import { usePersistentScores } from './usePersistentScores';

export type { Scores };

export interface QuantumSettings {
  opponent: Opponent;
  difficulty: Difficulty;
  /** Search depth used when difficulty is 'custom'. */
  customDepth: number;
}

interface Timeline {
  history: QuantumSnapshot[];
  /** Who committed the transition that produced history[i]; null at index 0. */
  actors: Array<Player | null>;
  pointer: number;
}

const freshTimeline = (): Timeline => ({
  history: [createInitialQuantumSnapshot()],
  actors: [null],
  pointer: 0,
});

const NO_HIGHLIGHT: EntanglementHighlight = { cells: [], edgeIds: [] };

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
  const { scores, recordResult, clearScores } = usePersistentScores('quantum');
  const [selected, setSelected] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(null);

  const { history, actors, pointer } = timeline;
  const snapshot = history[pointer];
  const atTip = pointer === history.length - 1;
  const isAiTurn =
    opponent === 'ai' && snapshot.phase !== 'gameover' && decisionMaker(snapshot) === AI_PLAYER;

  const pushSnapshot = useCallback(
    (next: QuantumSnapshot, actor: Player) => {
      setTimeline((prev) => ({
        history: [...prev.history.slice(0, prev.pointer + 1), next],
        actors: [...prev.actors.slice(0, prev.pointer + 1), actor],
        pointer: prev.pointer + 1,
      }));
      recordResult(next.winner);
    },
    [recordResult]
  );

  /**
   * Taps a cell during the placing phase. The first tap selects one cell; the
   * second commits a spooky mark across the pair. Tapping the selected cell
   * again clears the selection. When only one empty cell remains, a single tap
   * places the forced classical mark. Ignored while the AI owns the decision.
   */
  const tapCell = useCallback(
    (cell: number) => {
      if (isAiTurn || snapshot.phase !== 'placing') return;

      // Touch has no hover, so a tap doubles as the entanglement probe.
      setFocused(cell);
      const actor = decisionMaker(snapshot);
      const forced = forcedCell(snapshot);
      if (forced !== null) {
        setSelected(null);
        const next = placeForced(snapshot, forced);
        if (next !== snapshot) pushSnapshot(next, actor);
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
      if (next !== snapshot) pushSnapshot(next, actor);
    },
    [isAiTurn, snapshot, selected, pushSnapshot]
  );

  /** Commits one of the two measurement outcomes (chooser's decision). */
  const chooseCollapse = useCallback(
    (optionIndex: 0 | 1) => {
      if (isAiTurn || snapshot.phase !== 'choosingCollapse') return;
      const actor = decisionMaker(snapshot);
      const next = resolveCollapse(snapshot, optionIndex);
      if (next !== snapshot) pushSnapshot(next, actor);
    },
    [isAiTurn, snapshot, pushSnapshot]
  );

  /** Points the entanglement highlight at a cell; null clears it. */
  const focusCell = useCallback((cell: number | null) => setFocused(cell), []);

  /**
   * Everything a measurement at the focused cell would drag in. Suppressed
   * mid-measurement, where the collapse flash already owns the board.
   *
   * Hovering wins when it is available, but it falls back to the half-placed
   * selection so the highlight is reachable on touch at all: `onHoverIn` needs
   * a mouse, and this ships mainly as a phone PWA. Tapping the first cell of a
   * pair now previews what a measurement there would drag along — which is
   * exactly the moment the answer matters.
   */
  const highlightTarget = focused ?? selected;
  const highlight = useMemo(
    () =>
      highlightTarget === null || snapshot.phase !== 'placing'
        ? NO_HIGHLIGHT
        : entanglementHighlight(snapshot, highlightTarget),
    [highlightTarget, snapshot]
  );

  const undo = useCallback(() => {
    setSelected(null);
    setTimeline((prev) => ({
      ...prev,
      pointer:
        opponent === 'ai'
          ? undoActorRun(prev.actors, prev.pointer, AI_PLAYER)
          : Math.max(0, prev.pointer - 1),
    }));
  }, [opponent]);

  const redo = useCallback(() => {
    setSelected(null);
    setTimeline((prev) => ({
      ...prev,
      pointer:
        opponent === 'ai'
          ? redoActorRun(prev.actors, prev.pointer, AI_PLAYER)
          : Math.min(prev.history.length - 1, prev.pointer + 1),
    }));
  }, [opponent]);

  const reset = useCallback(() => {
    setSelected(null);
    setFocused(null);
    setTimeline(freshTimeline());
  }, []);

  // A pointer move that lands off a placing phase invalidates any selection,
  // and the board underneath the highlight is no longer the one it described.
  useEffect(() => {
    setSelected(null);
    setFocused(null);
  }, [pointer]);

  // Switching opponent invalidates the timeline.
  useEffect(() => {
    setTimeline(freshTimeline());
  }, [opponent]);

  // Let the AI act whenever it owns the decision at the tip of the timeline —
  // this fires once per decision, so it chains a collapse choice into the
  // placement that follows it. Never mid-history: a redo landing on the AI's
  // turn must not fork it. Search runs off-thread when a Worker is available.
  useEffect(() => {
    if (!isAiTurn || !atTip) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      void getQuantumMoveAsync(snapshot, difficulty, customDepth).then((move) => {
        if (cancelled || !move) return;
        pushSnapshot(applyAiMove(snapshot, move), AI_PLAYER);
      });
    }, AI_MOVE_DELAY_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isAiTurn, atTip, snapshot, difficulty, customDepth, pushSnapshot]);

  return {
    snapshot,
    scores,
    clearScores,
    selected,
    highlight,
    isAiTurn,
    canUndo: pointer > 0,
    canRedo: pointer < history.length - 1,
    forcedCell: forcedCell(snapshot),
    tapCell,
    focusCell,
    chooseCollapse,
    undo,
    redo,
    reset,
  };
}
