import React, { useState } from 'react';
import { LayoutChangeEvent, StyleSheet, View } from 'react-native';

import { SPACING } from '../utils/constants';
import { Board as BoardState } from '../utils/engine';
import { Cell } from './Cell';

interface BoardProps {
  board: BoardState;
  vanishingIndex: number | null;
  disabled: boolean;
  onCellPress: (index: number) => void;
}

const MAX_BOARD_SIZE = 340;

export function Board({ board, vanishingIndex, disabled, onCellPress }: BoardProps) {
  const [available, setAvailable] = useState<{ width: number; height: number } | null>(null);

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setAvailable({ width, height });
  };

  const boardSize = available
    ? Math.max(0, Math.min(available.width, available.height, MAX_BOARD_SIZE))
    : 0;
  const cellSize = (boardSize - SPACING.cellGap * 2) / 3;

  return (
    <View style={styles.fill} onLayout={onLayout}>
      {boardSize > 0 && (
        <View style={[styles.board, { width: boardSize, height: boardSize }]}>
          {board.map((mark, index) => (
            <Cell
              key={index}
              index={index}
              size={cellSize}
              mark={mark}
              isVanishing={index === vanishingIndex}
              disabled={disabled || mark !== null}
              onPress={onCellPress}
            />
          ))}
        </View>
      )}
    </View>
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
});
