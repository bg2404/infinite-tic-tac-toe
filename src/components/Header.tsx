import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '../theme/ThemeContext';
import { GameMode } from '../utils/engine';
import { SegmentedControl } from './SegmentedControl';

interface HeaderProps {
  mode: GameMode;
  onModeChange: (mode: GameMode) => void;
  onOpenSettings: () => void;
}

const MODE_OPTIONS = [
  { label: 'Classic', value: 'classic' },
  { label: 'Infinite', value: 'infinite' },
] as const;

export function Header({ mode, onModeChange, onOpenSettings }: HeaderProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.header}>
      <View style={styles.toggle}>
        <SegmentedControl options={MODE_OPTIONS} value={mode} onChange={onModeChange} />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Settings"
        hitSlop={12}
        onPress={onOpenSettings}
        style={({ pressed }) => [styles.gear, pressed && styles.gearPressed]}
      >
        <Ionicons name="settings-outline" size={22} color={theme.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggle: {
    width: 200,
  },
  gear: {
    position: 'absolute',
    right: 0,
    padding: 4,
  },
  gearPressed: {
    opacity: 0.6,
  },
});
