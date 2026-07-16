import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Scores } from '../hooks/useGameState';
import { useTheme } from '../theme/ThemeContext';

interface ScoreboardProps {
  scores: Scores;
}

export function Scoreboard({ scores }: ScoreboardProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.footer}>
      <Text style={[styles.entry, { color: theme.textMuted }]}>
        <Text style={{ color: theme.x }}>X</Text> {scores.X}
        <Text style={styles.dot}> · </Text>
        <Text style={{ color: theme.o }}>O</Text> {scores.O}
        <Text style={styles.dot}> · </Text>
        Draws {scores.draws}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  footer: {
    alignItems: 'center',
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
