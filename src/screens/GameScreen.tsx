import React, { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Board } from '../components/Board';
import { ControlDock } from '../components/ControlDock';
import { Header } from '../components/Header';
import { InstallBanner } from '../components/InstallBanner';
import { QuantumWalkthrough } from '../components/QuantumWalkthrough';
import { RulesModal } from '../components/RulesModal';
import { Scoreboard } from '../components/Scoreboard';
import { SettingsModal } from '../components/SettingsModal';
import { StatusText } from '../components/StatusText';
import { Opponent, useGameState } from '../hooks/useGameState';
import { useTheme } from '../theme/ThemeContext';
import { SPACING } from '../utils/constants';
import { Difficulty, GameMode } from '../utils/engine';
import { loadSettings, saveSettings } from '../utils/persistence';
import { readFlag, STORAGE_KEYS, writeFlag } from '../utils/storage';
import { QuantumGame } from './QuantumGame';

export function GameScreen() {
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();

  const [settings, setSettings] = useState(loadSettings);
  const { mode, opponent, difficulty, customDepth } = settings;
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [infoVisible, setInfoVisible] = useState(false);
  const [walkthroughVisible, setWalkthroughVisible] = useState(false);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // Quantum is the one mode nobody already knows the rules to, so it gets an
  // introduction on first arrival — once ever, then the header info button.
  useEffect(() => {
    if (mode !== 'quantum') return;
    if (readFlag(STORAGE_KEYS.quantumWalkthroughSeen)) return;
    setWalkthroughVisible(true);
  }, [mode]);

  const dismissWalkthrough = () => {
    writeFlag(STORAGE_KEYS.quantumWalkthroughSeen, true);
    setWalkthroughVisible(false);
  };

  const setMode = (next: GameMode) => setSettings((prev) => ({ ...prev, mode: next }));
  const setOpponent = (next: Opponent) => setSettings((prev) => ({ ...prev, opponent: next }));
  const setDifficulty = (next: Difficulty) =>
    setSettings((prev) => ({ ...prev, difficulty: next }));
  const setCustomDepth = (next: number) =>
    setSettings((prev) => ({ ...prev, customDepth: next }));

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
            <Scoreboard scores={game.scores} onClear={game.clearScores} />
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

      <QuantumWalkthrough visible={walkthroughVisible} onDismiss={dismissWalkthrough} />
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
