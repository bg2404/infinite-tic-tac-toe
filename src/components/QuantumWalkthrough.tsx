import React, { useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '../theme/ThemeContext';
import { RADIUS } from '../utils/constants';
import {
  createInitialQuantumSnapshot,
  placeSpooky,
  QuantumSnapshot,
  resolveCollapse,
} from '../utils/quantum';
import { QuantumBoard } from './QuantumBoard';

interface QuantumWalkthroughProps {
  visible: boolean;
  onDismiss: () => void;
}

interface Step {
  title: string;
  body: string;
  snapshot: QuantumSnapshot;
  /** Marks to pulse — the loop being measured, on the step that measures it. */
  flashEdgeIds: number[];
}

const DEMO_BOARD = 208;

/**
 * The tour plays a real three-move game through the engine rather than faking
 * boards, so what a newcomer sees is exactly what the rules produce.
 */
function buildSteps(): Step[] {
  const placed = placeSpooky(createInitialQuantumSnapshot(), 0, 4); // X1 {0,4}
  const linked = placeSpooky(placed, 4, 8); // O2 {4,8}
  const looped = placeSpooky(linked, 0, 8); // X3 {0,8} closes 0-4-8
  const measured = resolveCollapse(looped, 0);

  return [
    {
      title: 'Play in two places at once',
      body: 'A move places one symbol across two cells, tagged with its move number. The thread shows where it might land.',
      snapshot: placed,
      flashEdgeIds: [],
    },
    {
      title: 'Close a loop',
      body: 'Marks that share a cell are entangled. The moment a move completes a loop, everything in it has to be measured.',
      snapshot: looped,
      flashEdgeIds: looped.pending?.cyclicEdgeIds ?? [],
    },
    {
      title: 'Collapse it',
      body: 'Whoever did not close the loop picks one of the two outcomes. Every mark drops into a single cell — line up three to win.',
      snapshot: measured,
      flashEdgeIds: [],
    },
  ];
}

const noop = () => {};

/** One-time introduction to Quantum mode, shown before a newcomer's first game. */
export function QuantumWalkthrough({ visible, onDismiss }: QuantumWalkthroughProps) {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const [steps] = useState(buildSteps);
  const [index, setIndex] = useState(0);

  const step = steps[index];
  const last = index === steps.length - 1;

  const advance = () => {
    if (last) onDismiss();
    else setIndex((i) => i + 1);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={[styles.backdrop, { backgroundColor: theme.backdrop }]}>
        <Animated.View
          entering={FadeIn.duration(220)}
          style={[
            styles.sheet,
            { backgroundColor: theme.background, marginBottom: insets.bottom + 24 },
          ]}
        >
          <Text style={[styles.kicker, { color: theme.collapse }]}>QUANTUM · HOW IT WORKS</Text>

          <View style={{ width: DEMO_BOARD, height: DEMO_BOARD }}>
            {/* Remounting per step replays the placement and collapse animations. */}
            <QuantumBoard
              key={index}
              snapshot={step.snapshot}
              selected={null}
              previewAssignment={null}
              flashEdgeIds={step.flashEdgeIds}
              highlightCells={[]}
              highlightEdgeIds={[]}
              disabled
              onCellPress={noop}
              onCellFocus={noop}
            />
          </View>

          <Animated.View key={index} entering={FadeIn.duration(260)} style={styles.copy}>
            <Text style={[styles.title, { color: theme.text }]}>{step.title}</Text>
            <Text style={[styles.body, { color: theme.textMuted }]}>{step.body}</Text>
          </Animated.View>

          <View style={styles.dots}>
            {steps.map((_, i) => (
              <View
                key={i}
                style={[
                  styles.dot,
                  { backgroundColor: i === index ? theme.collapse : theme.segmentTrack },
                ]}
              />
            ))}
          </View>

          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              onPress={onDismiss}
              style={({ pressed }) => [styles.skip, { opacity: pressed ? 0.6 : 1 }]}
            >
              <Text style={[styles.skipLabel, { color: theme.textMuted }]}>Skip</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={advance}
              style={({ pressed }) => [
                styles.next,
                { backgroundColor: theme.collapse, opacity: pressed ? 0.75 : 1 },
              ]}
            >
              <Text style={styles.nextLabel}>{last ? 'Start playing' : 'Next'}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  sheet: {
    width: '100%',
    maxWidth: 420,
    alignItems: 'center',
    borderRadius: RADIUS.sheet,
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 22,
    gap: 18,
  },
  kicker: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
  },
  copy: {
    gap: 8,
  },
  title: {
    fontSize: 19,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  body: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 21,
    textAlign: 'center',
  },
  dots: {
    flexDirection: 'row',
    gap: 7,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: RADIUS.pill,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    justifyContent: 'space-between',
  },
  skip: {
    paddingVertical: 10,
    paddingHorizontal: 8,
  },
  skipLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  next: {
    paddingVertical: 12,
    paddingHorizontal: 26,
    borderRadius: RADIUS.pill,
  },
  nextLabel: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
});
