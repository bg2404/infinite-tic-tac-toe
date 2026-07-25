export type ThemeMode = 'light' | 'dark' | 'auto';
export type ResolvedTheme = 'light' | 'dark';

export interface Theme {
  /** Canvas / screen background */
  background: string;
  /** Inactive grid cells and panels */
  panel: string;
  /** 'X' mark accent */
  x: string;
  /** 'O' mark accent */
  o: string;
  /** Primary text */
  text: string;
  /** Secondary / muted text */
  textMuted: string;
  /** Segmented-control track */
  segmentTrack: string;
  /** Segmented-control active thumb */
  segmentActive: string;
  /** Modal backdrop */
  backdrop: string;
  /** Measurement / collapse flash (Quantum mode) */
  collapse: string;
  isDark: boolean;
}

export const themes: Record<ResolvedTheme, Theme> = {
  dark: {
    background: '#121826',
    panel: '#1F2937',
    x: '#06B6D4',
    o: '#EC4899',
    text: '#F9FAFB',
    textMuted: '#9CA3AF',
    segmentTrack: '#1F2937',
    segmentActive: '#374151',
    backdrop: 'rgba(0, 0, 0, 0.55)',
    collapse: '#F59E0B',
    isDark: true,
  },
  light: {
    background: '#F3F4F6',
    panel: '#FFFFFF',
    x: '#0891B2',
    o: '#DB2777',
    text: '#111827',
    textMuted: '#6B7280',
    segmentTrack: '#E5E7EB',
    segmentActive: '#FFFFFF',
    backdrop: 'rgba(17, 24, 39, 0.35)',
    collapse: '#D97706',
    isDark: false,
  },
};
