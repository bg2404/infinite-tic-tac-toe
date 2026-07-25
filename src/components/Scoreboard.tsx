import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Scores } from '../hooks/useGameState';
import { useTheme } from '../theme/ThemeContext';

interface ScoreboardProps {
  scores: Scores;
  /**
   * Clears the running tally. Optional, so a scoreboard can stay read-only.
   * Bound to a long press rather than a tap: the tally survives reloads now, so
   * it needs some way out, but wiping it by brushing the footer would be worse
   * than having no reset at all.
   */
  onClear?: () => void;
}

export function Scoreboard({ scores, onClear }: ScoreboardProps) {
  const { theme } = useTheme();
  const empty = scores.X === 0 && scores.O === 0 && scores.draws === 0;

  const line = (
    <Text style={[styles.entry, { color: theme.textMuted }]}>
      <Text style={{ color: theme.x }}>X</Text> {scores.X}
      <Text style={styles.dot}> · </Text>
      <Text style={{ color: theme.o }}>O</Text> {scores.O}
      <Text style={styles.dot}> · </Text>
      Draws {scores.draws}
    </Text>
  );

  // Nothing to reset on a fresh tally, so don't advertise the affordance.
  if (!onClear || empty) {
    return <View style={styles.footer}>{line}</View>;
  }

  return (
    <View style={styles.footer}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Score: X ${scores.X}, O ${scores.O}, draws ${scores.draws}`}
        accessibilityHint="Press and hold to reset the score"
        onLongPress={onClear}
        style={({ pressed }) => [styles.target, pressed && styles.pressed]}
      >
        {line}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    alignItems: 'center',
  },
  target: {
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  pressed: {
    opacity: 0.55,
  },
  entry: {
    fontSize: 14,
    fontWeight: '600',
    letterSpacing: 0.5,
  },
  dot: {
    fontWeight: '400',
  },
});
