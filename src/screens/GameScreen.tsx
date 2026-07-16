import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Board } from '../components/Board';
import { ControlDock } from '../components/ControlDock';
import { Header } from '../components/Header';
import { Scoreboard } from '../components/Scoreboard';
import { SettingsModal } from '../components/SettingsModal';
import { StatusText } from '../components/StatusText';
import { Opponent, useGameState } from '../hooks/useGameState';
import { useTheme } from '../theme/ThemeContext';
import { SPACING } from '../utils/constants';
import { Difficulty, GameMode } from '../utils/engine';

export function GameScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<GameMode>('classic');
  const [opponent, setOpponent] = useState<Opponent>('human');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [settingsVisible, setSettingsVisible] = useState(false);

  const game = useGameState({ mode, opponent, difficulty });

  return (
    <View
      style={[
        styles.screen,
        {
          backgroundColor: theme.background,
          paddingTop: insets.top + 12,
          paddingBottom: insets.bottom + 16,
        },
      ]}
    >
      <Header mode={mode} onModeChange={setMode} onOpenSettings={() => setSettingsVisible(true)} />

      <View style={styles.statusArea}>
        <StatusText snapshot={game.snapshot} />
      </View>

      <View style={styles.boardArea}>
        <Board
          board={game.snapshot.board}
          vanishingIndex={game.vanishingIndex}
          disabled={game.snapshot.winner !== null || game.isAiTurn}
          onCellPress={game.place}
        />
      </View>

      <ControlDock
        canUndo={game.canUndo}
        canRedo={game.canRedo}
        onUndo={game.undo}
        onRedo={game.redo}
        onReset={game.reset}
      />

      <View style={styles.footerArea}>
        <Scoreboard scores={game.scores} />
      </View>

      <SettingsModal
        visible={settingsVisible}
        opponent={opponent}
        difficulty={difficulty}
        onClose={() => setSettingsVisible(false)}
        onOpponentChange={setOpponent}
        onDifficultyChange={setDifficulty}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: SPACING.screenPadding,
  },
  statusArea: {
    marginTop: 28,
  },
  boardArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerArea: {
    marginTop: 18,
  },
});
