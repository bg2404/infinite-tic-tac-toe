import React, { useEffect, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleSheet, View } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '../theme/ThemeContext';
import { RADIUS, SPACING } from '../utils/constants';
import { Player, WinLine, Winner } from '../utils/engine';
import { ClassicalMark, QuantumSnapshot, SpookyMark } from '../utils/quantum';
import { WinOverlay } from './WinOverlay';

interface QuantumBoardProps {
  snapshot: QuantumSnapshot;
  selected: number | null;
  /** Collapse outcome currently previewed on the board, if measuring. */
  previewAssignment: Record<number, ClassicalMark> | null;
  /** Spooky-mark ids in the closing cycle, flashed during measurement. */
  flashEdgeIds: number[];
  /** Cells entangled with the focused cell — washed to show a measurement's reach. */
  highlightCells: number[];
  /** Spooky-mark ids inside the focused entanglement component. */
  highlightEdgeIds: number[];
  disabled: boolean;
  onCellPress: (index: number) => void;
  /** Pointer hover on web; null on leave. Touch input relies on press instead. */
  onCellFocus: (index: number | null) => void;
}

const MAX_BOARD_SIZE = 340;
const GAP = SPACING.cellGap;

/**
 * Where the breathing animations are parked when reduced motion is on: halfway
 * through the cycle, so superposed marks and threads sit at their average
 * brightness rather than at either extreme.
 */
const MID_CYCLE = 0.5;

/** Top-left offset of a cell within the board (space-between layout). */
const cellOrigin = (index: number, cellSize: number) => {
  const row = Math.floor(index / 3);
  const col = index % 3;
  return { x: col * (cellSize + GAP), y: row * (cellSize + GAP) };
};

const cellCenter = (index: number, cellSize: number) => {
  const { x, y } = cellOrigin(index, cellSize);
  return { x: x + cellSize / 2, y: y + cellSize / 2 };
};

const playerColor = (theme: ReturnType<typeof useTheme>['theme'], player: Player) =>
  player === 'X' ? theme.x : theme.o;

export function QuantumBoard({
  snapshot,
  selected,
  previewAssignment,
  flashEdgeIds,
  highlightCells,
  highlightEdgeIds,
  disabled,
  onCellPress,
  onCellFocus,
}: QuantumBoardProps) {
  const { theme } = useTheme();
  const [available, setAvailable] = useState<{ width: number; height: number } | null>(null);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setAvailable({ width, height });
  };

  const boardSize = available
    ? Math.max(0, Math.min(available.width, available.height, MAX_BOARD_SIZE))
    : 0;
  const cellSize = (boardSize - GAP * 2) / 3;
  const flashSet = new Set(flashEdgeIds);
  const highlightEdgeSet = new Set(highlightEdgeIds);
  const highlightCellSet = new Set(highlightCells);

  return (
    <View style={styles.fill} onLayout={onLayout}>
      {boardSize > 0 && (
        <View style={[styles.board, { width: boardSize, height: boardSize }]}>
          {/* Entanglement threads sit under the marks and ignore touches. */}
          <View style={StyleSheet.absoluteFill} pointerEvents="none">
            {snapshot.spooky.map((mark) => {
              const flashing = flashSet.has(mark.id);
              const highlighted = !flashing && highlightEdgeSet.has(mark.id);
              return (
                <Thread
                  key={mark.id}
                  mark={mark}
                  cellSize={cellSize}
                  color={
                    flashing || highlighted ? theme.collapse : playerColor(theme, mark.player)
                  }
                  flashing={flashing}
                  highlighted={highlighted}
                />
              );
            })}
          </View>

          {Array.from({ length: 9 }, (_, index) => {
            const classical = snapshot.collapsed[index];
            const preview = previewAssignment?.[index] ?? null;
            const ghosts = classical
              ? []
              : snapshot.spooky.filter((m) => m.cells[0] === index || m.cells[1] === index);
            return (
              <QuantumCell
                key={index}
                index={index}
                size={cellSize}
                classical={classical ?? null}
                preview={preview}
                ghosts={ghosts}
                selected={selected === index}
                highlighted={highlightCellSet.has(index)}
                disabled={disabled || classical !== null}
                onPress={onCellPress}
                onFocus={onCellFocus}
              />
            );
          })}

          {snapshot.winner && (
            <WinOverlay
              winner={snapshot.winner as Winner}
              winLine={snapshot.winLine as WinLine | null}
              boardSize={boardSize}
              cellSize={cellSize}
            />
          )}
        </View>
      )}
    </View>
  );
}

interface ThreadProps {
  mark: SpookyMark;
  cellSize: number;
  color: string;
  flashing: boolean;
  highlighted: boolean;
}

function Thread({ mark, cellSize, color, flashing, highlighted }: ThreadProps) {
  const a = cellCenter(mark.cells[0], cellSize);
  const b = cellCenter(mark.cells[1], cellSize);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  const thickness = flashing ? 4 : highlighted ? 3.2 : 2.5;

  // Superposition breathes; a highlight lifts it out of the background;
  // measurement pulses harder and brighter still. Held at mid-cycle when the
  // viewer has asked for reduced motion — the opacity levels still separate the
  // three states, they just stop moving.
  const reduceMotion = useReducedMotion();
  const t = useSharedValue(reduceMotion ? MID_CYCLE : 0);
  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(t);
      t.value = MID_CYCLE;
      return;
    }
    t.value = withRepeat(
      withTiming(1, { duration: 1700, easing: Easing.inOut(Easing.sin) }),
      -1,
      true
    );
    return () => cancelAnimation(t);
  }, [t, reduceMotion]);

  const anim = useAnimatedStyle(
    () => ({
      opacity: flashing
        ? 0.7 + t.value * 0.3
        : highlighted
          ? 0.5 + t.value * 0.22
          : 0.28 + t.value * 0.2,
    }),
    [flashing, highlighted]
  );

  return (
    <Animated.View
      style={[
        {
          position: 'absolute',
          left: (a.x + b.x) / 2 - length / 2,
          top: (a.y + b.y) / 2 - thickness / 2,
          width: length,
          height: thickness,
          borderRadius: thickness,
          backgroundColor: color,
          transform: [{ rotate: `${angle}rad` }],
        },
        anim,
      ]}
    />
  );
}

interface QuantumCellProps {
  index: number;
  size: number;
  classical: ClassicalMark | null;
  preview: ClassicalMark | null;
  ghosts: SpookyMark[];
  selected: boolean;
  highlighted: boolean;
  disabled: boolean;
  onPress: (index: number) => void;
  onFocus: (index: number | null) => void;
}

function QuantumCell({
  index,
  size,
  classical,
  preview,
  ghosts,
  selected,
  highlighted,
  disabled,
  onPress,
  onFocus,
}: QuantumCellProps) {
  const { theme } = useTheme();
  const ringRadius = size * 0.27;

  const label = classical
    ? `${classical.player}, collapsed`
    : ghosts.length
      ? `${ghosts.length} superposed mark${ghosts.length === 1 ? '' : 's'}`
      : 'empty';

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Cell ${index + 1}, ${label}${highlighted ? ', entangled' : ''}`}
      accessibilityState={{ selected }}
      disabled={disabled}
      onPress={() => onPress(index)}
      onHoverIn={() => onFocus(index)}
      onHoverOut={() => onFocus(null)}
      style={({ pressed }) => [
        styles.cell,
        {
          width: size,
          height: size,
          backgroundColor: theme.panel,
          borderWidth: selected ? 2 : 0,
          borderColor: theme.text,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      {highlighted && (
        <View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFillObject,
            styles.wash,
            { backgroundColor: theme.collapse },
          ]}
        />
      )}
      {classical ? (
        <SolidMark mark={classical} size={size} snap />
      ) : preview ? (
        <SolidMark mark={preview} size={size} previewing />
      ) : (
        ghosts.map((mark, i) => {
          const step = (i / ghosts.length) * Math.PI * 2 - Math.PI / 2;
          const glyph = size * (ghosts.length > 4 ? 0.15 : 0.19);
          return (
            <GhostMark
              key={mark.id}
              mark={mark}
              glyph={glyph}
              offsetX={Math.cos(step) * ringRadius}
              offsetY={Math.sin(step) * ringRadius}
              phase={i}
              color={playerColor(theme, mark.player)}
            />
          );
        })
      )}
    </Pressable>
  );
}

interface GhostMarkProps {
  mark: SpookyMark;
  glyph: number;
  offsetX: number;
  offsetY: number;
  phase: number;
  color: string;
}

/** A superposed mark that continuously "breathes" — unitary evolution at rest. */
function GhostMark({ mark, glyph, offsetX, offsetY, phase, color }: GhostMarkProps) {
  // Reduced motion parks every ghost at mid-cycle: still visibly faint and
  // undersized against a collapsed mark, but static. This is the one animation
  // in the app that would otherwise run forever, so it also stops being a
  // constant battery draw.
  const reduceMotion = useReducedMotion();
  const t = useSharedValue(reduceMotion ? MID_CYCLE : 0);
  useEffect(() => {
    if (reduceMotion) {
      cancelAnimation(t);
      t.value = MID_CYCLE;
      return;
    }
    // Stagger each ghost so a cell's marks breathe out of phase, not in unison.
    t.value = withDelay(
      phase * 240,
      withRepeat(withTiming(1, { duration: 1600, easing: Easing.inOut(Easing.sin) }), -1, true)
    );
    return () => cancelAnimation(t);
  }, [t, phase, reduceMotion]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.3 + t.value * 0.24,
    transform: [
      { translateX: offsetX },
      { translateY: offsetY },
      { scale: 0.9 + t.value * 0.16 },
    ],
  }));

  return (
    <Animated.Text style={[styles.ghost, { color, fontSize: glyph }, style]}>
      {mark.player}
      <Animated.Text style={styles.subscript}>{mark.id}</Animated.Text>
    </Animated.Text>
  );
}

function SolidMark({
  mark,
  size,
  snap = false,
  previewing = false,
}: {
  mark: ClassicalMark;
  size: number;
  snap?: boolean;
  previewing?: boolean;
}) {
  const { theme } = useTheme();
  const color = playerColor(theme, mark.player);

  // Measurement snap: punch in from oversized, flashing amber, settling to color.
  // Start values are set explicitly (not just at init) because this instance is
  // reused when a cell transitions from its collapse preview to the committed
  // mark — a plain re-init wouldn't replay the animation.
  // Under reduced motion the scale punch is dropped but the amber flash stays:
  // it is a colour change rather than movement, and it is the only cue that a
  // measurement just happened, so it lingers a little longer to compensate.
  const reduceMotion = useReducedMotion();
  const scale = useSharedValue(1);
  const flash = useSharedValue(0);
  useEffect(() => {
    if (!snap) return;
    if (!reduceMotion) {
      scale.value = 1.35;
      scale.value = withSpring(1, { damping: 9, stiffness: 340, mass: 0.6 });
    }
    flash.value = 1;
    flash.value = withTiming(0, {
      duration: reduceMotion ? 700 : 460,
      easing: Easing.out(Easing.quad),
    });
  }, [snap, scale, flash, reduceMotion]);

  const style = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    color: interpolateColor(flash.value, [0, 1], [color, theme.collapse]),
    opacity: previewing ? 0.72 : 1,
  }));

  return (
    <Animated.Text style={[styles.solid, { fontSize: size * 0.46 }, style]}>
      {mark.player}
      <Animated.Text style={[styles.solidSubscript, { color: theme.textMuted }]}>
        {mark.subscript}
      </Animated.Text>
    </Animated.Text>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  board: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignContent: 'space-between',
  },
  cell: {
    borderRadius: RADIUS.cell,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wash: {
    borderRadius: RADIUS.cell,
    opacity: 0.1,
  },
  ghost: {
    position: 'absolute',
    fontWeight: '700',
    opacity: 0.4,
  },
  subscript: {
    fontSize: 9,
    fontWeight: '600',
  },
  solid: {
    fontWeight: '800',
  },
  solidSubscript: {
    fontSize: 11,
    fontWeight: '600',
  },
});
