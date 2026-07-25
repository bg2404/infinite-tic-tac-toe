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
  onOpenInfo: () => void;
}

const MODE_OPTIONS = [
  { label: 'Classic', value: 'classic' },
  { label: 'Infinite', value: 'infinite' },
  { label: 'Quantum', value: 'quantum' },
] as const;

export function Header({ mode, onModeChange, onOpenSettings, onOpenInfo }: HeaderProps) {
  const { theme } = useTheme();

  return (
    <View style={styles.header}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="How to play"
        hitSlop={12}
        onPress={onOpenInfo}
        style={({ pressed }) => [styles.info, pressed && styles.iconPressed]}
      >
        <Ionicons name="information-circle-outline" size={24} color={theme.textMuted} />
      </Pressable>
      <View style={styles.toggle}>
        <SegmentedControl options={MODE_OPTIONS} value={mode} onChange={onModeChange} />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Settings"
        hitSlop={12}
        onPress={onOpenSettings}
        style={({ pressed }) => [styles.gear, pressed && styles.iconPressed]}
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
    width: 280,
  },
  info: {
    position: 'absolute',
    left: 0,
    padding: 4,
  },
  gear: {
    position: 'absolute',
    right: 0,
    padding: 4,
  },
  iconPressed: {
    opacity: 0.6,
  },
});
