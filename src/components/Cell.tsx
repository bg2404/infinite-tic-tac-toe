import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  ZoomIn,
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

export function Cell({ index, size, mark, isVanishing, disabled, onPress }: CellProps) {
  const { theme } = useTheme();
  const scale = useSharedValue(1);

  const pressStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const markStyle = useAnimatedStyle(
    () => ({
      opacity: withTiming(isVanishing ? VANISHING_OPACITY : 1, { duration: 220 }),
    }),
    [isVanishing]
  );

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
        <Animated.Text
          key={`${mark.player}-${mark.placedAt}`}
          entering={ZoomIn.springify().damping(14).stiffness(240)}
          style={[
            styles.mark,
            { fontSize: size * 0.46, color: mark.player === 'X' ? theme.x : theme.o },
            markStyle,
          ]}
        >
          {mark.player}
        </Animated.Text>
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
