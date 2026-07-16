import React, { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '../theme/ThemeContext';
import { SPACING } from '../utils/constants';
import { Winner, WinLine } from '../utils/engine';

interface WinOverlayProps {
  winner: Winner;
  winLine: WinLine | null;
  boardSize: number;
  cellSize: number;
}

const THICKNESS = 8;
const DRAW_BAR_GAP = 9;

/**
 * Terminal-state signal drawn over the board: a strike-through line across
 * the winning three cells, or a centered equals sign on a draw. Grows from
 * the center outward shortly after the final mark lands.
 */
export function WinOverlay({ winner, winLine, boardSize, cellSize }: WinOverlayProps) {
  const { theme } = useTheme();
  const progress = useSharedValue(0);

  const step = cellSize + SPACING.cellGap;
  const centerOf = (index: number) => ({
    x: (index % 3) * step + cellSize / 2,
    y: Math.floor(index / 3) * step + cellSize / 2,
  });
  const start = centerOf(winLine ? winLine[0] : 0);
  const end = centerOf(winLine ? winLine[2] : 0);
  const angle = Math.atan2(end.y - start.y, end.x - start.x);

  useEffect(() => {
    progress.value = withDelay(240, withTiming(1, { duration: 380 }));
  }, [progress]);

  const growStyle = useAnimatedStyle(
    () => ({
      opacity: progress.value,
      transform: [{ rotate: `${angle}rad` }, { scaleX: progress.value }],
    }),
    [angle]
  );

  if (winner === 'draw') {
    const barWidth = cellSize * 1.2;
    const left = (boardSize - barWidth) / 2;
    const centerY = boardSize / 2;
    const bar = {
      left,
      width: barWidth,
      height: THICKNESS,
      backgroundColor: theme.textMuted,
    };
    return (
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Animated.View
          style={[styles.bar, bar, { top: centerY - DRAW_BAR_GAP / 2 - THICKNESS }, growStyle]}
        />
        <Animated.View style={[styles.bar, bar, { top: centerY + DRAW_BAR_GAP / 2 }, growStyle]} />
      </View>
    );
  }

  if (!winner || !winLine) return null;

  const pad = cellSize * 0.22;
  const length = Math.hypot(end.x - start.x, end.y - start.y) + pad * 2;
  const midX = (start.x + end.x) / 2;
  const midY = (start.y + end.y) / 2;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View
        style={[
          styles.bar,
          {
            left: midX - length / 2,
            top: midY - THICKNESS / 2,
            width: length,
            height: THICKNESS,
            backgroundColor: winner === 'X' ? theme.x : theme.o,
          },
          growStyle,
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    borderRadius: THICKNESS / 2,
  },
});
