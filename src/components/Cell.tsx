import React, { useEffect } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '../theme/ThemeContext';
import { RADIUS, VANISHING_OPACITY } from '../utils/constants';
import { Mark } from '../utils/engine';

interface CellProps {
  index: number;
  size: number;
  mark: Mark | null;
  isVanishing: boolean;
  disabled: boolean;
  onPress: (index: number) => void;
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

interface MarkTokenProps {
  mark: Mark;
  size: number;
  isVanishing: boolean;
}

function MarkToken({ mark, size, isVanishing }: MarkTokenProps) {
  const { theme } = useTheme();
  const scale = useSharedValue(0.4);

  useEffect(() => {
    scale.value = withSpring(1, { damping: 14, stiffness: 260 });
  }, [scale]);

  const style = useAnimatedStyle(
    () => ({
      transform: [{ scale: scale.value }],
      opacity: withTiming(isVanishing ? VANISHING_OPACITY : 1, { duration: 220 }),
    }),
    [isVanishing]
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

export function Cell({ index, size, mark, isVanishing, disabled, onPress }: CellProps) {
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
