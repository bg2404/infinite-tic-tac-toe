import React from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';

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
  const { width } = useWindowDimensions();
  const boardSize = Math.min(width - SPACING.screenPadding * 2, MAX_BOARD_SIZE);
  const cellSize = (boardSize - SPACING.cellGap * 2) / 3;

  return (
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
  );
}

const styles = StyleSheet.create({
  board: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignContent: 'space-between',
  },
});
