import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Opponent } from '../hooks/useGameState';
import { useTheme } from '../theme/ThemeContext';
import { ThemeMode } from '../theme/themes';
import { RADIUS } from '../utils/constants';
import { Difficulty } from '../utils/engine';
import { SegmentedControl } from './SegmentedControl';

interface SettingsModalProps {
  visible: boolean;
  opponent: Opponent;
  difficulty: Difficulty;
  onClose: () => void;
  onOpponentChange: (opponent: Opponent) => void;
  onDifficultyChange: (difficulty: Difficulty) => void;
}

const OPPONENT_OPTIONS = [
  { label: 'Pass & Play', value: 'human' },
  { label: 'VS AI', value: 'ai' },
] as const;

const DIFFICULTY_OPTIONS = [
  { label: 'Easy', value: 'easy' },
  { label: 'Medium', value: 'medium' },
  { label: 'Hard', value: 'hard' },
] as const;

const THEME_OPTIONS = [
  { label: 'Light', value: 'light' },
  { label: 'Dark', value: 'dark' },
  { label: 'Auto', value: 'auto' },
] as const;

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  const { theme } = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: theme.textMuted }]}>{label}</Text>
      {children}
    </View>
  );
}

export function SettingsModal({
  visible,
  opponent,
  difficulty,
  onClose,
  onOpponentChange,
  onDifficultyChange,
}: SettingsModalProps) {
  const { theme, mode: themeMode, setMode: setThemeMode } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={[styles.backdrop, { backgroundColor: theme.backdrop }]}
        onPress={onClose}
        accessibilityLabel="Close settings"
      />
      <View
        style={[
          styles.sheet,
          { backgroundColor: theme.background, paddingBottom: insets.bottom + 24 },
        ]}
      >
        <View style={[styles.grabber, { backgroundColor: theme.segmentTrack }]} />
        <Text style={[styles.title, { color: theme.text }]}>Settings</Text>

        <SettingRow label="OPPONENT">
          <SegmentedControl options={OPPONENT_OPTIONS} value={opponent} onChange={onOpponentChange} />
        </SettingRow>

        <View style={{ opacity: opponent === 'ai' ? 1 : 0.35 }} pointerEvents={opponent === 'ai' ? 'auto' : 'none'}>
          <SettingRow label="AI DIFFICULTY">
            <SegmentedControl
              options={DIFFICULTY_OPTIONS}
              value={difficulty}
              onChange={onDifficultyChange}
            />
          </SettingRow>
        </View>

        <SettingRow label="THEME">
          <SegmentedControl<ThemeMode>
            options={THEME_OPTIONS}
            value={themeMode}
            onChange={setThemeMode}
          />
        </SettingRow>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  sheet: {
    borderTopLeftRadius: RADIUS.sheet,
    borderTopRightRadius: RADIUS.sheet,
    paddingHorizontal: 24,
    paddingTop: 10,
  },
  grabber: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    marginBottom: 14,
  },
  title: {
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 18,
  },
  row: {
    marginBottom: 20,
  },
  rowLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
});
