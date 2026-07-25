import { useCallback, useState } from 'react';

import { Winner } from '../utils/engine';
import { loadScoreBook, saveScores, ScoreLedger, Scores } from '../utils/persistence';

/**
 * A running tally that survives a reload. Scores are the only game state worth
 * persisting — the timeline deliberately isn't, so a refresh always starts a
 * clean board.
 */
export function usePersistentScores(ledger: ScoreLedger) {
  const [scores, setScores] = useState<Scores>(() => loadScoreBook()[ledger]);

  const recordResult = useCallback(
    (winner: Winner) => {
      if (!winner) return;
      setScores((prev) => {
        const next =
          winner === 'draw'
            ? { ...prev, draws: prev.draws + 1 }
            : { ...prev, [winner]: prev[winner] + 1 };
        saveScores(ledger, next);
        return next;
      });
    },
    [ledger]
  );

  const clearScores = useCallback(() => {
    const next: Scores = { X: 0, O: 0, draws: 0 };
    saveScores(ledger, next);
    setScores(next);
  }, [ledger]);

  return { scores, recordResult, clearScores };
}
