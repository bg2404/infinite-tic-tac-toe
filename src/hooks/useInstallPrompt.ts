import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';

import { STORAGE_KEYS } from '../utils/storage';

/**
 * Chrome fires this so a site can offer its own install affordance. It isn't
 * in TypeScript's DOM lib because it isn't a standard.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallState =
  /** Already installed, unsupported, or dismissed — show nothing. */
  | { kind: 'hidden' }
  /** Chrome et al: the browser will show a real install dialog. */
  | { kind: 'prompt'; install: () => void }
  /** iOS Safari has no install API, so the user has to be told the steps. */
  | { kind: 'instructions' };

const DISMISS_KEY = STORAGE_KEYS.installDismissed;

const isWeb = Platform.OS === 'web';

/** True once launched from the home screen, in which case there's nothing to offer. */
function isInstalled(): boolean {
  if (typeof window === 'undefined') return false;
  const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
  return window.matchMedia?.('(display-mode: standalone)').matches === true || iosStandalone === true;
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  // iPadOS 13+ reports itself as a Mac, so touch points disambiguate it.
  const iPadOS = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || iPadOS;
}

function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    // Safari private mode throws on localStorage access.
    return false;
  }
}

/**
 * Decides which install affordance (if any) to show. Returns `hidden` on
 * native, where the app is already installed by definition.
 */
export function useInstallPrompt() {
  const [state, setState] = useState<InstallState>({ kind: 'hidden' });

  useEffect(() => {
    if (!isWeb || typeof window === 'undefined') return;
    if (isInstalled() || wasDismissed()) return;

    const onBeforeInstallPrompt = (event: Event) => {
      // Suppress Chrome's own mini-infobar so the in-app banner is the only offer.
      event.preventDefault();
      const deferred = event as BeforeInstallPromptEvent;
      setState({
        kind: 'prompt',
        install: () => {
          void deferred.prompt();
          void deferred.userChoice.then(() => setState({ kind: 'hidden' }));
        },
      });
    };

    const onInstalled = () => setState({ kind: 'hidden' });

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);

    // iOS never fires beforeinstallprompt, so fall back to telling the user how.
    if (isIos()) setState({ kind: 'instructions' });

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      // Not being able to remember the dismissal is not worth failing over.
    }
    setState({ kind: 'hidden' });
  }, []);

  return { state, dismiss };
}
