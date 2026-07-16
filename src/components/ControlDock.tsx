import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../theme/ThemeContext';

interface ControlDockProps {
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onReset: () => void;
}

const DISABLED_OPACITY = 0.2;

interface DockButtonProps {
  label: string;
  disabled?: boolean;
  onPress: () => void;
}

function DockButton({ label, disabled = false, onPress }: DockButtonProps) {
  const { theme } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      hitSlop={10}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { opacity: disabled ? DISABLED_OPACITY : pressed ? 0.55 : 1 },
      ]}
    >
      <Text style={[styles.label, { color: theme.text }]}>{label}</Text>
    </Pressable>
  );
}

export function ControlDock({ canUndo, canRedo, onUndo, onRedo, onReset }: ControlDockProps) {
  return (
    <View style={styles.dock}>
      <DockButton label="UNDO" disabled={!canUndo} onPress={onUndo} />
      <DockButton label="RESET" onPress={onReset} />
      <DockButton label="REDO" disabled={!canRedo} onPress={onRedo} />
    </View>
  );
}

const styles = StyleSheet.create({
  dock: {
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    alignItems: 'center',
  },
  button: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  label: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 2,
  },
});
