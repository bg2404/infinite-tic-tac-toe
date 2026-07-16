import React, { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '../theme/ThemeContext';
import { RADIUS, TERMINAL_DIM_OPACITY, VANISHING_OPACITY } from '../utils/constants';
import { Mark } from '../utils/engine';

interface CellProps {
  index: number;
  size: number;
  mark: Mark | null;
  isVanishing: boolean;
  dimmed: boolean;
  disabled: boolean;
  onPress: (index: number) => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface MarkTokenProps {
  mark: Mark;
  size: number;
  isVanishing: boolean;
  dimmed: boolean;
}

function MarkToken({ mark, size, isVanishing, dimmed }: MarkTokenProps) {
  const { theme } = useTheme();
  const scale = useSharedValue(0.4);

  useEffect(() => {
    scale.value = withSpring(1, { damping: 14, stiffness: 260 });
  }, [scale]);

  const targetOpacity = isVanishing ? VANISHING_OPACITY : dimmed ? TERMINAL_DIM_OPACITY : 1;

  const style = useAnimatedStyle(
    () => ({
      transform: [{ scale: scale.value }],
      opacity: withTiming(targetOpacity, { duration: 220 }),
    }),
    [targetOpacity]
  );

  return (
    <Animated.Text
      style={[
        styles.mark,
        { fontSize: size * 0.46, color: mark.player === 'X' ? theme.x : theme.o },
        style,
      ]}
    >
      {mark.player}
    </Animated.Text>
  );
}

export function Cell({ index, size, mark, isVanishing, dimmed, disabled, onPress }: CellProps) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <AnimatedPressable
      accessibilityRole="button"
      accessibilityLabel={`Cell ${index + 1}${mark ? `, ${mark.player}` : ', empty'}`}
      disabled={disabled}
      onPressIn={() => {
        scale.value = withTiming(0.95, { duration: 80 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 12, stiffness: 220 });
      }}
      onPress={() => onPress(index)}
      style={[
        styles.cell,
        { width: size, height: size, backgroundColor: theme.panel },
        pressStyle,
      ]}
    >
      {mark && (
        <MarkToken
          key={`${mark.player}-${mark.placedAt}`}
          mark={mark}
          size={size}
          isVanishing={isVanishing}
          dimmed={dimmed}
        />
      )}
    </AnimatedPressable>
  );
}

const styles = StyleSheet.create({
  cell: {
    borderRadius: RADIUS.cell,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mark: {
    fontWeight: '800',
  },
});
