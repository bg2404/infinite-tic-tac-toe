import React, { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ControlDock } from '../components/ControlDock';
import { QuantumBoard } from '../components/QuantumBoard';
import { Scoreboard } from '../components/Scoreboard';
import { Opponent } from '../hooks/useGameState';
import { useQuantumGame } from '../hooks/useQuantumGame';
import { useTheme } from '../theme/ThemeContext';
import { RADIUS } from '../utils/constants';
import { Difficulty, Player } from '../utils/engine';

interface QuantumGameProps {
  opponent: Opponent;
  difficulty: Difficulty;
  customDepth: number;
}

/**
 * Quantum mode screen. Owns the quantum game state plus the transient
 * measurement-preview index used while a collapse is being resolved. Against
 * the computer the human is X; the AI measures and moves as O.
 */
export function QuantumGame({ opponent, difficulty, customDepth }: QuantumGameProps) {
  const { theme } = useTheme();
  const game = useQuantumGame({ opponent, difficulty, customDepth });
  const { snapshot, isAiTurn } = game;

  const [previewIndex, setPreviewIndex] = useState<0 | 1>(0);

  // Reset the previewed orientation whenever a new measurement begins.
  useEffect(() => {
    setPreviewIndex(0);
  }, [snapshot.pending]);

  const choosing = snapshot.phase === 'choosingCollapse' && snapshot.pending !== null;
  const previewAssignment =
    choosing && snapshot.pending ? snapshot.pending.options[previewIndex].assignment : null;
  const flashEdgeIds = choosing && snapshot.pending ? snapshot.pending.cyclicEdgeIds : [];

  const color = (player: Player) => (player === 'X' ? theme.x : theme.o);

  return (
    <>
      <View style={styles.statusArea}>
        <QuantumStatus />
      </View>

      <QuantumBoard
        snapshot={snapshot}
        selected={game.selected}
        previewAssignment={previewAssignment}
        flashEdgeIds={flashEdgeIds}
        highlightCells={game.highlight.cells}
        highlightEdgeIds={game.highlight.edgeIds}
        disabled={choosing || snapshot.phase === 'gameover' || isAiTurn}
        onCellPress={game.tapCell}
        onCellFocus={game.focusCell}
      />

      {choosing && snapshot.pending ? (
        <View style={styles.collapseBar}>
          <Text style={[styles.collapseTitle, { color: theme.collapse }]}>
            Measurement — <Text style={{ color: color(snapshot.pending.chooser) }}>
              {snapshot.pending.chooser}
            </Text> chooses
          </Text>
          {isAiTurn ? (
            <Text style={[styles.hint, { color: theme.textMuted }]}>Computer is measuring…</Text>
          ) : (
            <View style={styles.collapseButtons}>
              <Pressable
                accessibilityRole="button"
                onPress={() => setPreviewIndex((i) => (i === 0 ? 1 : 0))}
                style={({ pressed }) => [
                  styles.flipButton,
                  { borderColor: theme.textMuted, opacity: pressed ? 0.6 : 1 },
                ]}
              >
                <Text style={[styles.flipLabel, { color: theme.text }]}>
                  Outcome {previewIndex + 1} / 2 · Flip
                </Text>
              </Pressable>
              <Pressable
                accessibilityRole="button"
                onPress={() => game.chooseCollapse(previewIndex)}
                style={({ pressed }) => [
                  styles.confirmButton,
                  { backgroundColor: theme.collapse, opacity: pressed ? 0.75 : 1 },
                ]}
              >
                <Text style={styles.confirmLabel}>Collapse</Text>
              </Pressable>
            </View>
          )}
        </View>
      ) : (
        <ControlDock
          canUndo={game.canUndo}
          canRedo={game.canRedo}
          onUndo={game.undo}
          onRedo={game.redo}
          onReset={game.reset}
        />
      )}

      <View style={styles.footerArea}>
        <Scoreboard scores={game.scores} onClear={game.clearScores} />
      </View>
    </>
  );

  function QuantumStatus() {
    if (snapshot.winner === 'draw') {
      return <Text style={[styles.status, { color: theme.textMuted }]}>It's a Draw</Text>;
    }
    if (snapshot.winner) {
      return (
        <>
          <Text style={[styles.status, { color: theme.text }]}>
            Player <Text style={{ color: color(snapshot.winner as Player) }}>
              {snapshot.winner}
            </Text> Wins
          </Text>
          {snapshot.winByTieBreak ? (
            <Text style={[styles.hint, { color: theme.textMuted }]}>
              Both lines completed — earliest subscript wins
            </Text>
          ) : null}
        </>
      );
    }
    if (choosing) {
      return (
        <Text style={[styles.status, { color: theme.text }]}>A cycle closed — measure it</Text>
      );
    }

    if (isAiTurn) {
      return (
        <>
          <Text style={[styles.status, { color: theme.text }]}>
            <Text style={{ color: color(snapshot.currentPlayer) }}>Computer</Text> is thinking…
          </Text>
          <Text style={[styles.hint, { color: theme.textMuted }]}>Placing a spooky mark</Text>
        </>
      );
    }

    const forced = game.forcedCell !== null;
    const youLabel = opponent === 'ai';
    return (
      <>
        <Text style={[styles.status, { color: theme.text }]}>
          {youLabel ? (
            <Text style={{ color: color(snapshot.currentPlayer) }}>Your</Text>
          ) : (
            <>
              Player{' '}
              <Text style={{ color: color(snapshot.currentPlayer) }}>
                {snapshot.currentPlayer}
              </Text>
              's
            </>
          )}{' '}
          Turn
        </Text>
        <Text style={[styles.hint, { color: theme.textMuted }]}>
          {forced
            ? 'Tap the last cell to place it'
            : game.selected === null
              ? 'Tap two cells to place a spooky mark'
              : 'Tap a second cell to entangle'}
        </Text>
      </>
    );
  }
}

const styles = StyleSheet.create({
  statusArea: {
    marginTop: 28,
    marginBottom: 12,
    alignItems: 'center',
    gap: 4,
  },
  status: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
  hint: {
    fontSize: 13,
    fontWeight: '500',
    textAlign: 'center',
  },
  collapseBar: {
    alignItems: 'center',
    gap: 10,
  },
  collapseTitle: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  collapseButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  flipButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: RADIUS.pill,
    borderWidth: 1,
  },
  flipLabel: {
    fontSize: 13,
    fontWeight: '700',
  },
  confirmButton: {
    paddingVertical: 10,
    paddingHorizontal: 22,
    borderRadius: RADIUS.pill,
  },
  confirmLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  footerArea: {
    marginTop: 18,
    gap: 12,
  },
});
