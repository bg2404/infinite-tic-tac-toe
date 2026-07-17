import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { useTheme } from '../theme/ThemeContext';
import { RADIUS } from '../utils/constants';

/**
 * Offers to install the app when it's running in a browser tab. Renders
 * nothing once launched from the home screen, or on native.
 */
export function InstallBanner() {
  const { theme } = useTheme();
  const { state, dismiss } = useInstallPrompt();

  if (state.kind === 'hidden') return null;

  return (
    <View style={[styles.banner, { backgroundColor: theme.panel }]}>
      <View style={styles.content}>
        {state.kind === 'prompt' ? (
          <Text style={[styles.text, { color: theme.textMuted }]} numberOfLines={1}>
            Install for a home screen icon
          </Text>
        ) : (
          // iOS can't be prompted, so spell out the two taps instead.
          <Text style={[styles.text, { color: theme.textMuted }]} numberOfLines={2}>
            To install, tap{' '}
            <Ionicons name="share-outline" size={13} color={theme.text} />
            {'  Share, then '}
            <Text style={{ color: theme.text, fontWeight: '700' }}>Add to Home Screen</Text>
          </Text>
        )}
      </View>

      {state.kind === 'prompt' && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Install app"
          hitSlop={8}
          onPress={state.install}
          style={({ pressed }) => [styles.action, { opacity: pressed ? 0.55 : 1 }]}
        >
          <Text style={[styles.actionText, { color: theme.x }]}>INSTALL</Text>
        </Pressable>
      )}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Dismiss install prompt"
        hitSlop={10}
        onPress={dismiss}
        style={({ pressed }) => [styles.close, { opacity: pressed ? 0.5 : 1 }]}
      >
        <Ionicons name="close" size={16} color={theme.textMuted} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingLeft: 14,
    paddingRight: 10,
    borderRadius: RADIUS.cell,
  },
  content: {
    flex: 1,
  },
  text: {
    fontSize: 12.5,
    fontWeight: '600',
    lineHeight: 18,
  },
  action: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  actionText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  close: {
    padding: 4,
  },
});
