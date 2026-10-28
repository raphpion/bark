import {
  BarkState,
  CommandPaletteResult,
  LiveTabInfo,
  PinnedItem,
  PinnedTabNode,
  ShortcutConfig,
} from './types';
import { TRACKING_PARAMS } from './constants';

export function uid(prefix = 'id'): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function normalizeUrlForComparison(rawUrl?: string | null): string {
  if (!rawUrl) return '';
  try {
    const u = new URL(rawUrl);
    const host = u.hostname.replace(/^www\./i, '').toLowerCase();
    const path = u.pathname.replace(/\/+$/, '') || '/';
    return `${u.protocol}//${host}${path}${u.search}${u.hash}`;
  } catch {
    return rawUrl.trim().replace(/\/+$/, '').toLowerCase();
  }
}

export function isSamePinnedUrl(pinnedUrl: string, currentUrl?: string | null): boolean {
  if (!currentUrl) return true;
  if (currentUrl.startsWith('chrome://newtab') || currentUrl === 'about:blank') return true;
  return normalizeUrlForComparison(pinnedUrl) === normalizeUrlForComparison(currentUrl);
}

export function isSafeNavigationUrl(rawUrl?: string | null): boolean {
  if (!rawUrl) return false;
  try {
    const parsed = new URL(rawUrl.trim());
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

export function sanitizeUserUrl(rawUrl: string): string | null {
  const full = ensureFullUrl(rawUrl);
  return isSafeNavigationUrl(full) ? full : null;
}

export function getFaviconUrl(pageUrl?: string, explicitFavIconUrl?: string): string {
  if (
    explicitFavIconUrl &&
    !explicitFavIconUrl.startsWith('chrome://theme') &&
    explicitFavIconUrl.trim().length > 0
  ) {
    return explicitFavIconUrl;
  }
  if (!pageUrl) {
    return '';
  }
  try {
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
      const u = new URL(chrome.runtime.getURL('/_favicon/'));
      u.searchParams.set('pageUrl', pageUrl);
      u.searchParams.set('size', '32');
      return u.toString();
    }
  } catch {
    // Fallback below
  }
  try {
    const parsed = new URL(pageUrl);
    return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(parsed.hostname)}&sz=64`;
  } catch {
    return '';
  }
}

export function looksLikeUrl(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed || /\s/.test(trimmed)) return false;
  if (/^https?:\/\//i.test(trimmed)) {
    return true;
  }
  if (/^localhost(:\d+)?(\/.*)?$/i.test(trimmed)) {
    return true;
  }
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+([/?#].*)?$/i.test(trimmed);
}

export function ensureFullUrl(input: string): string {
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (/^localhost(:\d+)?(\/.*)?$/i.test(trimmed)) {
    return `http://${trimmed}`;
  }
  return `https://${trimmed}`;
}

export function matchesShortcut(e: KeyboardEvent, sc?: ShortcutConfig | null): boolean {
  if (!sc || !sc.key) return false;
  return (
    e.key.toLowerCase() === sc.key.toLowerCase() &&
    !!e.altKey === !!sc.altKey &&
    !!e.ctrlKey === !!sc.ctrlKey &&
    !!e.metaKey === !!sc.metaKey &&
    !!e.shiftKey === !!sc.shiftKey
  );
}

export function formatShortcutLabel(sc?: ShortcutConfig | null, separator = '+'): string {
  if (!sc || !sc.key) return `Alt${separator}T`;
  const parts: string[] = [];
  if (sc.ctrlKey) parts.push('Ctrl');
  if (sc.altKey) parts.push('Alt');
  if (sc.shiftKey) parts.push('Shift');
  if (sc.metaKey) parts.push('Cmd');
  parts.push(sc.key.toUpperCase());
  return parts.join(separator);
}

export function shortcutsEqual(a?: ShortcutConfig | null, b?: ShortcutConfig | null): boolean {
  if (!a?.key || !b?.key) return false;
  return (
    a.key.toLowerCase() === b.key.toLowerCase() &&
    !!a.altKey === !!b.altKey &&
    !!a.ctrlKey === !!b.ctrlKey &&
    !!a.metaKey === !!b.metaKey &&
    !!a.shiftKey === !!b.shiftKey
  );
}

function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase();
  return TRACKING_PARAMS.some((p) => (p.endsWith('_') ? lower.startsWith(p) : lower === p));
}

/**
 * Returns a shareable copy of `rawUrl` with known tracking query parameters removed
 * (utm_*, fbclid, gclid, ...). Functional query parameters and the `#hash` are kept.
 * Returns `null` for anything that isn't an http(s) URL.
 */
export function cleanShareUrl(rawUrl?: string | null): string | null {
  if (!rawUrl || !isSafeNavigationUrl(rawUrl)) return null;
  let u: URL;
  try {
    u = new URL(rawUrl.trim());
  } catch {
    return null;
  }
  const toDelete = [...new Set([...u.searchParams.keys()].filter(isTrackingParam))];
  if (toDelete.length === 0) return u.toString();
  for (const key of toDelete) u.searchParams.delete(key);
  return u.toString();
}

/** Minimal structural type so this stays testable without a DOM. */
interface EditableCandidate {
  tagName?: string;
  type?: string;
  isContentEditable?: boolean;
  getAttribute?: (name: string) => string | null;
}

const NON_TEXT_INPUT_TYPES = new Set([
  'button',
  'checkbox',
  'color',
  'file',
  'hidden',
  'image',
  'radio',
  'range',
  'reset',
  'submit',
]);

/**
 * True when keyboard focus is somewhere the user is typing (text inputs, textareas,
 * selects, contentEditable regions, ARIA textboxes - which also covers web terminals
 * like xterm.js that capture keys through a hidden textarea).
 */
export function isEditableTarget(target?: EditableCandidate | null): boolean {
  if (!target) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName?.toLowerCase();
  if (tag === 'textarea' || tag === 'select') return true;
  if (tag === 'input') {
    return !NON_TEXT_INPUT_TYPES.has((target.type || 'text').toLowerCase());
  }
  const role = target.getAttribute?.('role');
  return role === 'textbox' || role === 'searchbox' || role === 'combobox';
}

export function getPinnedTabIds(s: BarkState): Set<number> {
  const ids = new Set<number>();
  for (const f of s.favorites) {
    if (f.tabId) ids.add(f.tabId);
  }
  for (const sp of s.spaces) {
    for (const p of sp.pinnedItems) {
      if (p.type === 'tab' && p.tabId) ids.add(p.tabId);
    }
  }
  return ids;
}

export function getDescendantIds(items: PinnedItem[], folderId: string): Set<string> {
  const result = new Set<string>();
  const queue = [folderId];
  while (queue.length > 0) {
    const curr = queue.shift()!;
    for (const item of items) {
      if (item.parentId === curr && !result.has(item.id)) {
        result.add(item.id);
        if (item.type === 'folder') {
          queue.push(item.id);
        }
      }
    }
  }
  return result;
}

export function getFolderPinnedTabs(items: PinnedItem[], folderId: string): PinnedTabNode[] {
  const descendants = getDescendantIds(items, folderId);
  return items.filter(
    (item): item is PinnedTabNode => item.type === 'tab' && descendants.has(item.id)
  );
}

export function buildCommandPaletteResults(
  rawQuery: string,
  state: BarkState,
  liveTabs: LiveTabInfo[]
): CommandPaletteResult[] {
  const query = rawQuery.trim();
  const qLower = query.toLowerCase();
  const results: CommandPaletteResult[] = [];

  // 1. Check if query starts with a configured search shortcut prefix (e.g., "yt music" or "yt")
  if (query.length > 0) {
    const firstSpaceIdx = query.indexOf(' ');
    const prefixCandidate = (firstSpaceIdx === -1 ? query : query.slice(0, firstSpaceIdx)).toLowerCase();
    const restQuery = firstSpaceIdx === -1 ? '' : query.slice(firstSpaceIdx + 1).trim();

    const matchedShortcut = state.searchShortcuts.find(
      (s) => s.prefix.toLowerCase() === prefixCandidate
    );
    if (matchedShortcut) {
      if (restQuery.length > 0) {
        const targetUrl = matchedShortcut.urlTemplate.replace(
          '%s',
          encodeURIComponent(restQuery)
        );
        results.push({
          id: `shortcut-exec-${matchedShortcut.id}`,
          type: 'search-shortcut',
          title: `Search ${matchedShortcut.name} for "${restQuery}"`,
          subtitle: `${matchedShortcut.prefix} • ${targetUrl}`,
          url: targetUrl,
          favIconUrl: getFaviconUrl(targetUrl),
          searchPrefix: matchedShortcut.prefix,
          searchQuery: restQuery,
        });
      } else {
        const rawBase = matchedShortcut.urlTemplate.replace('%s', '');
        let originUrl = rawBase;
        try {
          originUrl = new URL(rawBase).origin;
        } catch {}
        results.push({
          id: `shortcut-hint-${matchedShortcut.id}`,
          type: 'search-shortcut',
          title: `${matchedShortcut.name} (${matchedShortcut.prefix})`,
          subtitle: `Type "${matchedShortcut.prefix} <query>" to search ${matchedShortcut.name}`,
          url: originUrl,
          favIconUrl: getFaviconUrl(rawBase),
          searchPrefix: matchedShortcut.prefix,
          searchQuery: '',
        });
      }
    }
  }

  // 2. Match Spaces ("Focus on [Emoji] [Space Name]" - matches [image 10])
  for (const space of state.spaces) {
    if (
      !query ||
      space.name.toLowerCase().includes(qLower) ||
      `focus on ${space.name.toLowerCase()}`.includes(qLower) ||
      'space'.includes(qLower)
    ) {
      if (query.length > 0 || space.id !== state.activeSpaceId) {
        results.push({
          id: `space-${space.id}`,
          type: 'space',
          title: 'Focus on',
          badgeText: space.name,
          badgeEmoji: space.emoji,
          badgeColor: space.color,
          spaceId: space.id,
        });
      }
    }
  }

  // 3. Direct URL navigation if query looks like a URL
  if (looksLikeUrl(query)) {
    const fullUrl = ensureFullUrl(query);
    if (isSafeNavigationUrl(fullUrl)) {
      results.push({
        id: `url-${fullUrl}`,
        type: 'url',
        title: fullUrl,
        subtitle: 'Open URL',
        url: fullUrl,
        favIconUrl: getFaviconUrl(fullUrl),
      });
    }
  }

  // 4. Match Global Favorites
  for (const fav of state.favorites) {
    const match =
      !query ||
      fav.title.toLowerCase().includes(qLower) ||
      fav.url.toLowerCase().includes(qLower);
    if (match) {
      results.push({
        id: `fav-${fav.id}`,
        type: 'favorite-tab',
        title: fav.title,
        subtitle: `Favorite • ${fav.currentUrl || fav.url}`,
        url: fav.currentUrl || fav.url,
        favIconUrl: getFaviconUrl(fav.currentUrl || fav.url, fav.favIconUrl),
        favoriteId: fav.id,
        tabId: fav.tabId ?? undefined,
      });
    }
  }

  // 5. Match Workspace Pinned Tabs (across all Spaces)
  for (const space of state.spaces) {
    for (const item of space.pinnedItems) {
      if (item.type !== 'tab') continue;
      const displayTitle = item.customTitle || item.title;
      const match =
        !query ||
        displayTitle.toLowerCase().includes(qLower) ||
        item.url.toLowerCase().includes(qLower) ||
        (item.currentUrl && item.currentUrl.toLowerCase().includes(qLower));
      if (match) {
        results.push({
          id: `pinned-${space.id}-${item.id}`,
          type: 'pinned-tab',
          title: displayTitle,
          subtitle: `Pinned in ${space.emoji} ${space.name}`,
          url: item.currentUrl || item.url,
          favIconUrl: getFaviconUrl(item.currentUrl || item.url, item.favIconUrl),
          spaceId: space.id,
          pinnedItemId: item.id,
          tabId: item.tabId ?? undefined,
          badgeEmoji: space.emoji,
          badgeText: space.name,
          badgeColor: space.color,
        });
      }
    }
  }

  // 6. Match Open Normal Tabs
  const pinnedTabIds = getPinnedTabIds(state);

  for (const tab of liveTabs) {
    if (pinnedTabIds.has(tab.id)) continue;
    const displayTitle = state.tabCustomTitles[tab.id] || tab.title || tab.url;
    const spaceId = state.tabSpaceMap[tab.id] || state.activeSpaceId;
    const space = state.spaces.find((s) => s.id === spaceId);
    const match =
      !query ||
      displayTitle.toLowerCase().includes(qLower) ||
      (tab.url && tab.url.toLowerCase().includes(qLower));
    if (match) {
      results.push({
        id: `tab-${tab.id}`,
        type: 'open-tab',
        title: displayTitle,
        subtitle: space ? `Switch to Tab • ${space.emoji} ${space.name}` : 'Switch to Tab',
        url: tab.url,
        favIconUrl: getFaviconUrl(tab.url, tab.favIconUrl),
        tabId: tab.id,
        spaceId: space?.id,
        badgeEmoji: space?.emoji,
        badgeText: space?.name,
        badgeColor: space?.color,
      });
    }
  }

  // 7. Default Browser Search (shown whenever query is non-empty, matching [image 10] bottom row "🔍 side")
  if (query.length > 0) {
    results.push({
      id: `default-search-${query}`,
      type: 'default-search',
      title: query,
      subtitle: 'Search with browser default search engine',
      searchQuery: query,
    });
  }

  // 8. Built-in Bark Hub Commands if matching
  const hubCommands = [
    { action: 'open-spaces', title: 'Open Spaces Navigator', keywords: 'spaces workspace manage' },
    { action: 'open-archive', title: 'Open Archived Tabs', keywords: 'archive history closed tabs' },
    { action: 'open-downloads', title: 'Open Downloads', keywords: 'downloads files' },
    { action: 'open-settings', title: 'Open Settings & Preferences', keywords: 'settings preferences search engine prefix shortcut archive cleanup' },
  ];
  for (const cmd of hubCommands) {
    if (query.length > 1 && (cmd.title.toLowerCase().includes(qLower) || cmd.keywords.includes(qLower))) {
      results.push({
        id: `cmd-${cmd.action}`,
        type: 'command',
        title: cmd.title,
        subtitle: 'Bark Command',
        commandAction: cmd.action,
      });
    }
  }

  return results.slice(0, 18);
}

export function formatRelativeTime(timestamp: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (diffSec < 60) return 'Just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}
