import { BarkSettings, SpaceColor } from './types';

export const STORAGE_KEY = 'bark_state_v2';

export const SPACE_COLORS: Record<
  SpaceColor,
  {
    label: string;
    hex: string;
    bgTint: string;
    cardBg: string;
    border: string;
    pillBg: string;
    pillText: string;
  }
> = {
  purple: {
    label: 'Purple',
    hex: '#8b5cf6',
    bgTint: '#1f1929',
    cardBg: '#271f36',
    border: '#3f3159',
    pillBg: '#6d28d9',
    pillText: '#f5f3ff',
  },
  blue: {
    label: 'Blue',
    hex: '#3b82f6',
    bgTint: '#161e2e',
    cardBg: '#1c273c',
    border: '#2c3e5e',
    pillBg: '#2563eb',
    pillText: '#eff6ff',
  },
  green: {
    label: 'Green',
    hex: '#22c55e',
    bgTint: '#14241b',
    cardBg: '#193022',
    border: '#284c36',
    pillBg: '#1f6f3d',
    pillText: '#ecfdf5',
  },
  red: {
    label: 'Red',
    hex: '#ef4444',
    bgTint: '#29171a',
    cardBg: '#361d21',
    border: '#572d34',
    pillBg: '#b91c1c',
    pillText: '#fef2f2',
  },
  yellow: {
    label: 'Yellow',
    hex: '#eab308',
    bgTint: '#262114',
    cardBg: '#332b19',
    border: '#524527',
    pillBg: '#a16207',
    pillText: '#fefce8',
  },
  pink: {
    label: 'Pink',
    hex: '#ec4899',
    bgTint: '#291724',
    cardBg: '#381e30',
    border: '#592e4c',
    pillBg: '#be185d',
    pillText: '#fdf2f8',
  },
  cyan: {
    label: 'Cyan',
    hex: '#06b6d4',
    bgTint: '#132329',
    cardBg: '#192e36',
    border: '#274957',
    pillBg: '#0e7490',
    pillText: '#ecfeff',
  },
  orange: {
    label: 'Orange',
    hex: '#f97316',
    bgTint: '#291c14',
    cardBg: '#362419',
    border: '#573927',
    pillBg: '#c2410c',
    pillText: '#fff7ed',
  },
  grey: {
    label: 'Grey',
    hex: '#94a3b8',
    bgTint: '#1b1b22',
    cardBg: '#23232c',
    border: '#363645',
    pillBg: '#475569',
    pillText: '#f8fafc',
  },
};

export function getDefaultSettings(): BarkSettings {
  const isMac =
    typeof navigator !== 'undefined' &&
    /Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
  return {
    archiveRetentionHours: 12,
    autoArchiveUnpinnedHours: 12,
    customShortcut: {
      key: 't',
      altKey: !isMac,
      ctrlKey: isMac,
      metaKey: false,
      shiftKey: false,
    },
    copyUrlShortcut: {
      key: 'c',
      altKey: !isMac,
      ctrlKey: isMac,
      metaKey: false,
      shiftKey: false,
    },
  };
}

/**
 * Query parameters stripped by `cleanShareUrl()`. Entries ending in `_` are prefixes
 * (e.g. `utm_` matches `utm_source`, `utm_campaign`, ...). Matching is case-insensitive.
 */
export const TRACKING_PARAMS: readonly string[] = [
  'utm_',
  'fbclid',
  'gclid',
  'gclsrc',
  'dclid',
  'gbraid',
  'wbraid',
  'msclkid',
  'yclid',
  'twclid',
  'ttclid',
  'li_fat_id',
  'igshid',
  'igsh',
  'mc_cid',
  'mc_eid',
  '_hsenc',
  '_hsmi',
  'hsctatracking',
  'mkt_tok',
  'oly_anon_id',
  'oly_enc_id',
  'vero_id',
  'vero_conv',
  '_ga',
  '_gl',
  'ref_src',
  'ref_url',
  'si',
  'spm',
  'scm',
  'trk',
  'trkcampaign',
  'wt_mc',
  's_cid',
  'icid',
];
