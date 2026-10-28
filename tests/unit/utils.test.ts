import { describe, expect, it } from 'vitest';
import { getDefaultSettings } from '../../src/shared/constants';
import { BarkState, PinnedItem } from '../../src/shared/types';
import {
  buildCommandPaletteResults,
  cleanShareUrl,
  ensureFullUrl,
  formatRelativeTime,
  formatShortcutLabel,
  getDescendantIds,
  getFolderPinnedTabs,
  getPinnedTabIds,
  isEditableTarget,
  isSafeNavigationUrl,
  isSamePinnedUrl,
  looksLikeUrl,
  matchesShortcut,
  normalizeUrlForComparison,
  sanitizeUserUrl,
  shortcutsEqual,
} from '../../src/shared/utils';

function createMockState(overrides: Partial<BarkState> = {}): BarkState {
  return {
    initialized: true,
    activeSpaceId: 'sp-1',
    favorites: [],
    spaces: [
      {
        id: 'sp-1',
        name: 'Personal',
        emoji: '🏠',
        color: 'purple',
        chromeGroupId: null,
        pinnedItems: [],
      },
    ],
    archivedTabs: [],
    searchShortcuts: [
      {
        id: 'yt',
        name: 'YouTube',
        prefix: 'yt',
        urlTemplate: 'https://www.youtube.com/results?search_query=%s',
      },
    ],
    settings: getDefaultSettings(),
    tabSpaceMap: {},
    tabLastActiveMap: {},
    tabCustomTitles: {},
    ...overrides,
  };
}

describe('URL validation & normalization', () => {
  it('accepts only http: and https: in isSafeNavigationUrl', () => {
    expect(isSafeNavigationUrl('https://github.com/raphp')).toBe(true);
    expect(isSafeNavigationUrl('http://localhost:3000/test')).toBe(true);
    expect(isSafeNavigationUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeNavigationUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
    expect(isSafeNavigationUrl('file:///C:/Windows/System32')).toBe(false);
    expect(isSafeNavigationUrl('chrome://extensions')).toBe(false);
    expect(isSafeNavigationUrl('')).toBe(false);
    expect(isSafeNavigationUrl(null)).toBe(false);
  });

  it('sanitizes user-entered URLs and upgrades bare domains safely', () => {
    expect(sanitizeUserUrl('github.com')).toBe('https://github.com');
    expect(sanitizeUserUrl('localhost:5173/app')).toBe('http://localhost:5173/app');
    expect(sanitizeUserUrl('  https://example.com/path  ')).toBe('https://example.com/path');
    expect(sanitizeUserUrl('javascript:alert(1)')).toBeNull();
  });

  it('detects URLs vs search queries in looksLikeUrl & ensureFullUrl', () => {
    expect(looksLikeUrl('example.com')).toBe(true);
    expect(looksLikeUrl('localhost:8080')).toBe(true);
    expect(looksLikeUrl('https://sub.domain.org/a?b=1')).toBe(true);
    expect(looksLikeUrl('how to use preact')).toBe(false);
    expect(looksLikeUrl('justoneword')).toBe(false);
    expect(ensureFullUrl('localhost:3000')).toBe('http://localhost:3000');
    expect(ensureFullUrl('arc.net')).toBe('https://arc.net');
  });

  it('normalizes URLs while preserving query strings and SPA hash routes', () => {
    expect(normalizeUrlForComparison('https://www.Example.com/docs/')).toBe(
      'https://example.com/docs'
    );
    expect(normalizeUrlForComparison('https://example.com/#/dashboard?tab=1')).toBe(
      'https://example.com/#/dashboard?tab=1'
    );
    expect(
      isSamePinnedUrl(
        'https://github.com/org/repo#readme',
        'https://github.com/org/repo#issues'
      )
    ).toBe(false);
    expect(
      isSamePinnedUrl('https://www.github.com/org/repo/', 'https://github.com/org/repo')
    ).toBe(true);
  });
});

describe('Keyboard shortcut utilities', () => {
  it('formats shortcut labels consistently', () => {
    expect(
      formatShortcutLabel({
        key: 't',
        altKey: true,
        ctrlKey: false,
        shiftKey: true,
        metaKey: false,
      })
    ).toBe('Alt+Shift+T');
    expect(formatShortcutLabel(null, ' + ')).toBe('Alt + T');
  });

  it('matches KeyboardEvent modifiers and key case-insensitively', () => {
    const config = {
      key: 'k',
      ctrlKey: true,
      altKey: false,
      shiftKey: true,
      metaKey: false,
    };
    const matchingEvent = {
      key: 'K',
      ctrlKey: true,
      altKey: false,
      shiftKey: true,
      metaKey: false,
    } as KeyboardEvent;
    const nonMatchingEvent = {
      key: 'k',
      ctrlKey: true,
      altKey: false,
      shiftKey: false,
      metaKey: false,
    } as KeyboardEvent;

    expect(matchesShortcut(matchingEvent, config)).toBe(true);
    expect(matchesShortcut(nonMatchingEvent, config)).toBe(false);
  });
});

describe('Pinned tree & folder hierarchy utilities', () => {
  const items: PinnedItem[] = [
    { id: 'folder-root', type: 'folder', title: 'Root', collapsed: false, parentId: null },
    {
      id: 'folder-nested',
      type: 'folder',
      title: 'Nested',
      collapsed: false,
      parentId: 'folder-root',
    },
    {
      id: 'tab-1',
      type: 'tab',
      title: 'Doc 1',
      url: 'https://example.com/1',
      parentId: 'folder-root',
      tabId: 101,
    },
    {
      id: 'tab-2',
      type: 'tab',
      title: 'Doc 2',
      url: 'https://example.com/2',
      parentId: 'folder-nested',
      tabId: 102,
    },
    {
      id: 'tab-outside',
      type: 'tab',
      title: 'Outside',
      url: 'https://example.com/3',
      parentId: null,
      tabId: 103,
    },
  ];

  it('collects all recursive descendant IDs for a folder', () => {
    const desc = getDescendantIds(items, 'folder-root');
    expect([...desc].sort()).toEqual(['folder-nested', 'tab-1', 'tab-2']);
  });

  it('returns only pinned tab nodes inside a folder subtree', () => {
    const tabs = getFolderPinnedTabs(items, 'folder-root');
    expect(tabs.map((t) => t.id)).toEqual(['tab-1', 'tab-2']);
  });

  it('collects open tab IDs across both favorites and space pinned items', () => {
    const state = createMockState({
      favorites: [{ id: 'fav-1', title: 'Fav', url: 'https://a.com', tabId: 55 }],
      spaces: [
        {
          id: 'sp-1',
          name: 'Work',
          emoji: '💼',
          color: 'blue',
          chromeGroupId: null,
          pinnedItems: items,
        },
      ],
    });
    expect([...getPinnedTabIds(state)].sort((a, b) => a - b)).toEqual([55, 101, 102, 103]);
  });
});

describe('Command Palette result builder', () => {
  const baseState = createMockState({
    favorites: [
      { id: 'fav-gh', title: 'GitHub', url: 'https://github.com', tabId: null },
    ],
  });

  it('matches search shortcut prefixes with and without a query', () => {
    const hintResults = buildCommandPaletteResults('yt', baseState, []);
    expect(hintResults[0]?.type).toBe('search-shortcut');
    expect(hintResults[0]?.searchPrefix).toBe('yt');

    const execResults = buildCommandPaletteResults('yt preact signals', baseState, []);
    expect(execResults[0]?.type).toBe('search-shortcut');
    expect(execResults[0]?.url).toContain('preact%20signals');
  });

  it('does not throw when a user-configured search shortcut has an invalid URL template', () => {
    const stateWithMalformedShortcut: BarkState = {
      ...structuredClone(baseState),
      searchShortcuts: [
        { id: 'bad', name: 'Broken', prefix: 'brk', urlTemplate: 'not-a-valid-url-%s' },
      ],
    };
    expect(() =>
      buildCommandPaletteResults('brk', stateWithMalformedShortcut, [])
    ).not.toThrow();
  });

  it('includes direct URL navigation only for safe URLs', () => {
    const results = buildCommandPaletteResults('developer.chrome.com', baseState, []);
    expect(results.some((r) => r.type === 'url' && r.url === 'https://developer.chrome.com')).toBe(
      true
    );
  });

  it('formats relative timestamps accurately', () => {
    const now = Date.now();
    expect(formatRelativeTime(now - 10_000)).toBe('Just now');
    expect(formatRelativeTime(now - 5 * 60_000)).toBe('5m ago');
    expect(formatRelativeTime(now - 3 * 3600_000)).toBe('3h ago');
    expect(formatRelativeTime(now - 2 * 86400_000)).toBe('2d ago');
  });
});

describe('Copy Current URL helpers', () => {
  it('strips tracking params but keeps functional params and the hash', () => {
    expect(
      cleanShareUrl(
        'https://www.example.com/article?id=42&utm_source=twitter&UTM_Campaign=x&fbclid=abc#section-2'
      )
    ).toBe('https://www.example.com/article?id=42#section-2');
    expect(
      cleanShareUrl('https://youtu.be/dQw4w9WgXcQ?si=trackme&t=42')
    ).toBe('https://youtu.be/dQw4w9WgXcQ?t=42');
    expect(cleanShareUrl('https://shop.test/p?gclid=1&msclkid=2&_hsenc=3&mc_eid=4')).toBe(
      'https://shop.test/p'
    );
  });

  it('returns URLs without tracking params unchanged', () => {
    expect(cleanShareUrl('https://github.com/org/repo/pull/7?tab=files#diff')).toBe(
      'https://github.com/org/repo/pull/7?tab=files#diff'
    );
    expect(cleanShareUrl('https://example.com/search?q=a%20b+c')).toBe(
      'https://example.com/search?q=a%20b+c'
    );
  });

  it('does not strip params that merely contain a tracking name', () => {
    expect(cleanShareUrl('https://example.com/?single=1&utm=keep')).toBe(
      'https://example.com/?single=1&utm=keep'
    );
  });

  it('rejects non-http(s) URLs', () => {
    expect(cleanShareUrl('chrome://extensions')).toBeNull();
    expect(cleanShareUrl('javascript:alert(1)')).toBeNull();
    expect(cleanShareUrl('')).toBeNull();
  });

  it('detects editable focus targets, including web terminals', () => {
    expect(isEditableTarget({ tagName: 'INPUT', type: 'text' })).toBe(true);
    expect(isEditableTarget({ tagName: 'INPUT', type: 'search' })).toBe(true);
    expect(isEditableTarget({ tagName: 'INPUT', type: 'checkbox' })).toBe(false);
    expect(isEditableTarget({ tagName: 'TEXTAREA' })).toBe(true); // xterm.js helper textarea
    expect(isEditableTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(
      isEditableTarget({ tagName: 'DIV', getAttribute: (n) => (n === 'role' ? 'textbox' : null) })
    ).toBe(true);
    expect(isEditableTarget({ tagName: 'BODY', getAttribute: () => null })).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
  });

  it('compares shortcut configs case-insensitively and treats null as never equal', () => {
    const a = { key: 'C', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false };
    const b = { key: 'c', altKey: true, ctrlKey: false, metaKey: false, shiftKey: false };
    expect(shortcutsEqual(a, b)).toBe(true);
    expect(shortcutsEqual(a, { ...b, shiftKey: true })).toBe(false);
    expect(shortcutsEqual(null, null)).toBe(false);
  });

  it('defaults copy URL shortcut to a different combo than the Command Palette', () => {
    const settings = getDefaultSettings();
    expect(settings.copyUrlShortcut?.key).toBe('c');
    expect(shortcutsEqual(settings.copyUrlShortcut, settings.customShortcut)).toBe(false);
  });
});
