import React from 'react';
import { StyleSheet, Text } from 'react-native';

import { useTheme } from '../theme/ThemeContext';
import { Snapshot } from '../utils/engine';

interface StatusTextProps {
  snapshot: Snapshot;
}

export function StatusText({ snapshot }: StatusTextProps) {
  const { theme } = useTheme();
  const { winner, currentPlayer } = snapshot;

  const playerColor = (player: 'X' | 'O') => (player === 'X' ? theme.x : theme.o);

  if (winner === 'draw') {
    return <Text style={[styles.status, { color: theme.textMuted }]}>It's a Draw</Text>;
  }

  if (winner) {
    return (
      <Text style={[styles.status, { color: theme.text }]}>
        Player <Text style={{ color: playerColor(winner) }}>{winner}</Text> Wins
      </Text>
    );
  }

  return (
    <Text style={[styles.status, { color: theme.text }]}>
      Player <Text style={{ color: playerColor(currentPlayer) }}>{currentPlayer}</Text>'s Turn
    </Text>
  );
}

const styles = StyleSheet.create({
  status: {
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.3,
  },
});
