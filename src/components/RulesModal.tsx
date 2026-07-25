import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme/ThemeContext';
import { RADIUS } from '../utils/constants';
import { GameMode } from '../utils/engine';

interface RulesModalProps {
  visible: boolean;
  mode: GameMode;
  onClose: () => void;
}

interface Rules {
  title: string;
  tagline: string;
  points: string[];
}

const RULES: Record<GameMode, Rules> = {
  classic: {
    title: 'Classic',
    tagline: 'The original 3×3 game.',
    points: [
      'Players alternate placing X and O in empty cells.',
      'First to get three in a row — across, down, or diagonally — wins.',
      'If all nine cells fill with no line, the game is a draw.',
    ],
  },
  infinite: {
    title: 'Infinite',
    tagline: 'Classic, but nothing stays forever.',
    points: [
      'Each player keeps only three marks on the board at once.',
      'Placing a fourth mark removes your oldest one — it fades first as a warning.',
      'The board never fills, so there are no draws: play until someone lines up three.',
    ],
  },
  quantum: {
    title: 'Quantum',
    tagline: 'Superposition, entanglement, and collapse.',
    points: [
      'Each move places a spooky mark — your symbol in two cells at once, tagged with its move number.',
      'Marks that share a cell are entangled, shown by the threads linking them.',
      'When your move closes a loop of entanglement, those marks collapse to one cell each.',
      'The player who did NOT close the loop chooses which of the two outcomes happens.',
      'First to line up three collapsed marks wins.',
      'If one collapse completes a line for both players, each line is ranked by its highest move number — the line with the lower one formed earlier and wins.',
    ],
  },
};

export function RulesModal({ visible, mode, onClose }: RulesModalProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const rules = RULES[mode];

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable
        style={[styles.backdrop, { backgroundColor: theme.backdrop }]}
        onPress={onClose}
        accessibilityLabel="Close rules"
      />
      <View
        style={[
          styles.sheet,
          { backgroundColor: theme.background, paddingBottom: insets.bottom + 24 },
        ]}
      >
        <View style={[styles.grabber, { backgroundColor: theme.segmentTrack }]} />

        <View style={styles.header}>
          <Text style={[styles.title, { color: theme.text }]}>How to play · {rules.title}</Text>
          <Text style={[styles.tagline, { color: theme.textMuted }]}>{rules.tagline}</Text>
        </View>

        <View style={styles.list}>
          {rules.points.map((point, i) => (
            <View key={i} style={styles.item}>
              <Ionicons
                name="ellipse"
                size={7}
                color={mode === 'quantum' ? theme.collapse : theme.x}
                style={styles.bullet}
              />
              <Text style={[styles.itemText, { color: theme.text }]}>{point}</Text>
            </View>
          ))}
        </View>
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
    marginBottom: 18,
  },
  header: {
    marginBottom: 20,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    textAlign: 'center',
  },
  tagline: {
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 6,
  },
  list: {
    gap: 16,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  bullet: {
    marginTop: 7,
    marginRight: 12,
  },
  itemText: {
    flex: 1,
    fontSize: 15,
    fontWeight: '500',
    lineHeight: 22,
  },
});
