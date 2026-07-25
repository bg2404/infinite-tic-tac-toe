import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Board } from '../components/Board';
import { ControlDock } from '../components/ControlDock';
import { Header } from '../components/Header';
import { InstallBanner } from '../components/InstallBanner';
import { RulesModal } from '../components/RulesModal';
import { Scoreboard } from '../components/Scoreboard';
import { SettingsModal } from '../components/SettingsModal';
import { StatusText } from '../components/StatusText';
import { Opponent, useGameState } from '../hooks/useGameState';
import { useTheme } from '../theme/ThemeContext';
import { DEFAULT_CUSTOM_DEPTH, SPACING } from '../utils/constants';
import { Difficulty, GameMode } from '../utils/engine';
import { QuantumGame } from './QuantumGame';

export function GameScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const [mode, setMode] = useState<GameMode>('classic');
  const [opponent, setOpponent] = useState<Opponent>('human');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [customDepth, setCustomDepth] = useState<number>(DEFAULT_CUSTOM_DEPTH);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [infoVisible, setInfoVisible] = useState(false);

  const game = useGameState({ mode, opponent, difficulty, customDepth });

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
      <Header
        mode={mode}
        onModeChange={setMode}
        onOpenSettings={() => setSettingsVisible(true)}
        onOpenInfo={() => setInfoVisible(true)}
      />

      {mode === 'quantum' ? (
        <QuantumGame opponent={opponent} difficulty={difficulty} customDepth={customDepth} />
      ) : (
        <>
          <View style={styles.statusArea}>
            <StatusText snapshot={game.snapshot} />
          </View>

          <Board
            board={game.snapshot.board}
            vanishingIndex={game.vanishingIndex}
            winner={game.snapshot.winner}
            winLine={game.snapshot.winLine}
            disabled={game.snapshot.winner !== null || game.isAiTurn}
            onCellPress={game.place}
          />

          <ControlDock
            canUndo={game.canUndo}
            canRedo={game.canRedo}
            onUndo={game.undo}
            onRedo={game.redo}
            onReset={game.reset}
          />

          <View style={styles.footerArea}>
            <InstallBanner />
            <Scoreboard scores={game.scores} />
          </View>
        </>
      )}

      <SettingsModal
        visible={settingsVisible}
        opponent={opponent}
        difficulty={difficulty}
        customDepth={customDepth}
        mode={mode}
        onClose={() => setSettingsVisible(false)}
        onOpponentChange={setOpponent}
        onDifficultyChange={setDifficulty}
        onCustomDepthChange={setCustomDepth}
      />

      <RulesModal visible={infoVisible} mode={mode} onClose={() => setInfoVisible(false)} />
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
    marginBottom: 12,
  },
  footerArea: {
    marginTop: 18,
    gap: 12,
  },
});
