import {
  getDefaultSettings,
  STORAGE_KEY,
} from '../shared/constants';
import {
  ArchivedTabItem,
  BarkMessage,
  BarkState,
  CommandPaletteResult,
  FavoriteItem,
  FolderNode,
  LiveTabInfo,
  PinnedItem,
  PinnedTabNode,
  Space,
  SpaceColor,
} from '../shared/types';
import {
  getDescendantIds,
  getFaviconUrl,
  isSafeNavigationUrl,
  sanitizeUserUrl,
  uid,
} from '../shared/utils';

let state: BarkState | null = null;
let loadStatePromise: Promise<BarkState> | null = null;
let isSyncingGroups = false;
let palettePopupWindowId: number | null = null;
let broadcastTimer: ReturnType<typeof setTimeout> | null = null;
const intentionallyClosedTabIds = new Set<number>();
const liveTabSnapshot = new Map<number, { title: string; url: string; favIconUrl?: string }>();

const VALID_COLORS = new Set<SpaceColor>([
  'grey',
  'blue',
  'red',
  'yellow',
  'green',
  'pink',
  'purple',
  'cyan',
  'orange',
]);

function normalizeGroupColor(color?: string): SpaceColor {
  if (color && VALID_COLORS.has(color as SpaceColor)) {
    return color as SpaceColor;
  }
  return 'purple';
}

function isInternalExtensionUrl(url: string): boolean {
  return (
    url.includes('palette.html') ||
    url.includes('sidepanel.html') ||
    url.includes('hub.html')
  );
}

async function loadState(): Promise<BarkState> {
  if (state) return state;
  if (loadStatePromise) return loadStatePromise;

  loadStatePromise = (async () => {
    const stored = await chrome.storage.local.get(STORAGE_KEY);
    if (stored && stored[STORAGE_KEY]) {
      const loaded = stored[STORAGE_KEY] as BarkState;
      loaded.favorites = loaded.favorites || [];
      loaded.spaces = loaded.spaces || [];
      loaded.tabSpaceMap = loaded.tabSpaceMap || {};
      loaded.tabCustomTitles = loaded.tabCustomTitles || {};
      loaded.tabLastActiveMap = loaded.tabLastActiveMap || {};
      loaded.archivedTabs = loaded.archivedTabs || [];
      loaded.searchShortcuts = loaded.searchShortcuts || [];
      loaded.settings = {
        ...getDefaultSettings(),
        ...(loaded.settings || {}),
      };

      state = loaded;
      await reconcileWithBrowser(state);
      if (state.spaces.length > 0 && !state.spaces.some((s) => s.id === state!.activeSpaceId)) {
        state.activeSpaceId = state.spaces[0].id;
      } else if (state.spaces.length === 0) {
        state.activeSpaceId = '';
      }
      await saveState(false);
      return state;
    }

    const initial: BarkState = {
      initialized: true,
      activeSpaceId: '',
      favorites: [],
      spaces: [],
      tabSpaceMap: {},
      tabCustomTitles: {},
      tabLastActiveMap: {},
      archivedTabs: [],
      searchShortcuts: [],
      settings: getDefaultSettings(),
    };

    state = initial;
    await reconcileWithBrowser(state);
    if (state.spaces.length > 0 && !state.activeSpaceId) {
      state.activeSpaceId = state.spaces[0].id;
    }
    await saveState();
    return state;
  })();

  try {
    return await loadStatePromise;
  } finally {
    loadStatePromise = null;
  }
}

async function saveState(broadcast = true): Promise<void> {
  if (!state) return;
  await chrome.storage.local.set({ [STORAGE_KEY]: state });
  if (broadcast) {
    scheduleBroadcastState();
  }
}

async function getNormalWindowTabs(): Promise<chrome.tabs.Tab[]> {
  try {
    const win = await chrome.windows.getLastFocused({
      populate: true,
      windowTypes: ['normal'],
    });
    if (win?.tabs && win.tabs.length > 0) {
      return win.tabs;
    }
  } catch {}
  try {
    const allNormalWins = await chrome.windows.getAll({
      populate: true,
      windowTypes: ['normal'],
    });
    if (allNormalWins[0]?.tabs) {
      return allNormalWins[0].tabs;
    }
  } catch {}
  return chrome.tabs.query({});
}

async function getLiveTabs(): Promise<LiveTabInfo[]> {
  const rawTabs = await getNormalWindowTabs();
  const result: LiveTabInfo[] = [];

  for (const t of rawTabs) {
    if (typeof t.id !== 'number') continue;
    const url = t.url || t.pendingUrl || '';
    if (url.includes('palette.html') || url.includes('sidepanel.html')) continue;
    const title = t.title || url || 'New Tab';
    const info: LiveTabInfo = {
      id: t.id,
      title,
      url,
      favIconUrl: t.favIconUrl,
      active: !!t.active,
      audible: !!t.audible,
      muted: !!t.mutedInfo?.muted,
      groupId: typeof t.groupId === 'number' ? t.groupId : -1,
      index: t.index,
      windowId: t.windowId,
    };
    liveTabSnapshot.set(t.id, { title, url, favIconUrl: t.favIconUrl });
    result.push(info);
  }
  return result;
}

function scheduleBroadcastState(): void {
  if (broadcastTimer) {
    clearTimeout(broadcastTimer);
  }
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    void broadcastStateNow();
  }, 25);
}

async function broadcastStateNow(): Promise<void> {
  if (!state) return;
  const liveTabs = await getLiveTabs();
  try {
    await chrome.runtime.sendMessage({
      type: 'STATE_UPDATED',
      state,
      liveTabs,
    });
  } catch {
    // No extension views listening right now
  }
}

async function reconcileWithBrowser(s: BarkState): Promise<void> {
  try {
    const groups = await chrome.tabGroups.query({});
    const allTabs = await chrome.tabs.query({});
    const openTabIds = new Set<number>();

    for (const t of allTabs) {
      if (typeof t.id === 'number') {
        openTabIds.add(t.id);
        liveTabSnapshot.set(t.id, {
          title: t.title || t.url || 'Tab',
          url: t.url || '',
          favIconUrl: t.favIconUrl,
        });
      }
    }

    // 1. Reconcile Chrome Tab Groups with existing Spaces
    const existingGroupIds = new Set<number>();
    for (const grp of groups) {
      existingGroupIds.add(grp.id);
      let space = s.spaces.find((sp) => sp.chromeGroupId === grp.id);
      if (!space && grp.title) {
        space = s.spaces.find(
          (sp) => !sp.chromeGroupId && sp.name.toLowerCase() === grp.title!.trim().toLowerCase()
        );
      }
      if (space) {
        space.chromeGroupId = grp.id;
        if (grp.title && grp.title.trim()) {
          space.name = grp.title.trim();
        }
        space.color = normalizeGroupColor(grp.color);
      }
    }

    for (const sp of s.spaces) {
      if (sp.chromeGroupId && !existingGroupIds.has(sp.chromeGroupId)) {
        sp.chromeGroupId = null;
      }
    }

    // 2. Clear dead tabIds on Favorites and Pinned items
    for (const fav of s.favorites) {
      if (fav.tabId && !openTabIds.has(fav.tabId)) {
        fav.tabId = null;
        fav.currentUrl = undefined;
      }
    }

    for (const sp of s.spaces) {
      for (const item of sp.pinnedItems) {
        if (item.type === 'tab' && item.tabId && !openTabIds.has(item.tabId)) {
          item.tabId = null;
          item.currentUrl = undefined;
        }
      }
    }

    // 3. Ensure every open normal tab is mapped to a Space & has a last-active timestamp
    s.tabLastActiveMap = s.tabLastActiveMap || {};
    const now = Date.now();
    for (const t of allTabs) {
      if (typeof t.id !== 'number') continue;
      if (!s.tabLastActiveMap[t.id]) {
        s.tabLastActiveMap[t.id] =
          typeof t.lastAccessed === 'number' && t.lastAccessed > 0 ? t.lastAccessed : now;
      } else if (t.active) {
        s.tabLastActiveMap[t.id] = now;
      }
      if (typeof t.groupId === 'number' && t.groupId > -1) {
        const groupSpace = s.spaces.find((sp) => sp.chromeGroupId === t.groupId);
        if (groupSpace) {
          s.tabSpaceMap[t.id] = groupSpace.id;
          continue;
        }
      }
      if (!s.tabSpaceMap[t.id] || !s.spaces.some((sp) => sp.id === s.tabSpaceMap[t.id!])) {
        s.tabSpaceMap[t.id] = s.activeSpaceId;
      }
    }

    // Clean up stale entries in tabSpaceMap & tabLastActiveMap
    for (const rawId of Object.keys(s.tabSpaceMap)) {
      const id = Number(rawId);
      if (!openTabIds.has(id)) {
        delete s.tabSpaceMap[id];
        delete s.tabCustomTitles[id];
        delete s.tabLastActiveMap[id];
      }
    }
    for (const rawId of Object.keys(s.tabLastActiveMap)) {
      const id = Number(rawId);
      if (!openTabIds.has(id)) {
        delete s.tabLastActiveMap[id];
      }
    }
  } catch (err) {
    console.warn('Bark reconcile error:', err);
  }
}

function isPinnedOrFavoriteTab(s: BarkState, tabId: number): boolean {
  if (s.favorites.some((f) => f.tabId === tabId)) return true;
  for (const sp of s.spaces) {
    if (sp.pinnedItems.some((i) => i.type === 'tab' && i.tabId === tabId)) {
      return true;
    }
  }
  return false;
}

async function syncSpaceTabGroup(space: Space): Promise<void> {
  if (!state || isSyncingGroups) return;
  isSyncingGroups = true;
  try {
    const allTabs = await getNormalWindowTabs();
    const spaceTabIds: number[] = [];

    for (const item of space.pinnedItems) {
      if (item.type === 'tab' && item.tabId) {
        if (allTabs.some((t) => t.id === item.tabId)) {
          spaceTabIds.push(item.tabId);
        }
      }
    }

    for (const t of allTabs) {
      if (typeof t.id !== 'number') continue;
      if (isPinnedOrFavoriteTab(state, t.id)) continue;
      if (state.tabSpaceMap[t.id] === space.id) {
        spaceTabIds.push(t.id);
      }
    }

    if (spaceTabIds.length === 0) {
      return;
    }

    let groupId = space.chromeGroupId ?? undefined;
    if (groupId) {
      try {
        await chrome.tabGroups.get(groupId);
      } catch {
        groupId = undefined;
        space.chromeGroupId = null;
      }
    }

    const newGroupId = await chrome.tabs.group({
      tabIds: spaceTabIds as [number, ...number[]],
      groupId,
    });
    space.chromeGroupId = newGroupId;

    await chrome.tabGroups.update(newGroupId, {
      title: space.name,
      color: space.color,
      collapsed: space.id !== state.activeSpaceId,
    });
  } catch {
    // Tab group operations may fail on restricted windows or during drag
  } finally {
    isSyncingGroups = false;
  }
}

async function updateAllTabGroupCollapseStates(): Promise<void> {
  if (!state || isSyncingGroups) return;
  isSyncingGroups = true;
  try {
    for (const sp of state.spaces) {
      if (sp.chromeGroupId) {
        try {
          await chrome.tabGroups.update(sp.chromeGroupId, {
            title: sp.name,
            color: sp.color,
            collapsed: sp.id !== state.activeSpaceId,
          });
        } catch {
          sp.chromeGroupId = null;
        }
      }
    }
  } finally {
    isSyncingGroups = false;
  }
}

function addArchiveEntry(
  s: BarkState,
  entry: {
    title: string;
    url: string;
    favIconUrl?: string;
    spaceId: string;
    reason: 'closed' | 'cleared' | 'unpinned';
  }
) {
  if (
    !entry.url ||
    entry.url.startsWith('chrome://newtab') ||
    entry.url === 'about:blank' ||
    isInternalExtensionUrl(entry.url)
  ) {
    return;
  }
  const space = s.spaces.find((sp) => sp.id === entry.spaceId) || s.spaces[0];
  const item: ArchivedTabItem = {
    id: uid('arc'),
    title: entry.title || entry.url,
    url: entry.url,
    favIconUrl: entry.favIconUrl || getFaviconUrl(entry.url),
    spaceId: space?.id || 'space-default',
    spaceName: space?.name || 'My space',
    spaceEmoji: space?.emoji || '🌍',
    archivedAt: Date.now(),
    reason: entry.reason,
  };
  s.archivedTabs.unshift(item);
  if (s.archivedTabs.length > 500) {
    s.archivedTabs.length = 500;
  }
}

async function cleanupExpiredArchive(): Promise<void> {
  const s = await loadState();
  let changed = false;

  // 1. Clean up expired archived tabs based on archiveRetentionHours (0 = Never expire)
  const retentionHours = s.settings.archiveRetentionHours ?? 12;
  if (retentionHours > 0) {
    const maxAgeMs = retentionHours * 3600 * 1000;
    const cutoff = Date.now() - maxAgeMs;
    const beforeCount = s.archivedTabs.length;
    s.archivedTabs = s.archivedTabs.filter((item) => item.archivedAt >= cutoff);
    if (s.archivedTabs.length !== beforeCount) {
      changed = true;
    }
  }

  // 2. Auto-archive inactive unpinned workspace tabs based on autoArchiveUnpinnedHours (0 = Never auto-archive)
  const unpinnedExpireHours = s.settings.autoArchiveUnpinnedHours ?? 12;
  if (unpinnedExpireHours > 0) {
    const maxInactiveMs = unpinnedExpireHours * 3600 * 1000;
    const now = Date.now();
    const liveTabs = await getLiveTabs();
    s.tabLastActiveMap = s.tabLastActiveMap || {};

    const toArchiveAndClose: number[] = [];
    for (const t of liveTabs) {
      if (t.active || t.audible) {
        s.tabLastActiveMap[t.id] = now;
        continue;
      }
      if (isPinnedOrFavoriteTab(s, t.id)) continue;

      const lastActive = s.tabLastActiveMap[t.id] || now;
      if (now - lastActive >= maxInactiveMs) {
        addArchiveEntry(s, {
          title: s.tabCustomTitles[t.id] || t.title || t.url,
          url: t.url,
          favIconUrl: t.favIconUrl,
          spaceId: s.tabSpaceMap[t.id] || s.activeSpaceId || '',
          reason: 'cleared',
        });
        toArchiveAndClose.push(t.id);
        intentionallyClosedTabIds.add(t.id);
        delete s.tabSpaceMap[t.id];
        delete s.tabCustomTitles[t.id];
        delete s.tabLastActiveMap[t.id];
        changed = true;
      }
    }

    if (toArchiveAndClose.length > 0) {
      if (toArchiveAndClose.length >= liveTabs.length) {
        const blank = await chrome.tabs.create({ active: true });
        if (typeof blank.id === 'number' && s.activeSpaceId) {
          s.tabSpaceMap[blank.id] = s.activeSpaceId;
          s.tabLastActiveMap[blank.id] = now;
        }
      }
      try {
        await chrome.tabs.remove(toArchiveAndClose);
      } catch {}
    }
  }

  if (changed) {
    await saveState();
  }
}

async function findExistingPalettePopupWindow(): Promise<chrome.windows.Window | null> {
  if (palettePopupWindowId !== null) {
    try {
      const existingWin = await chrome.windows.get(palettePopupWindowId);
      if (existingWin && existingWin.id) {
        return existingWin;
      }
    } catch {
      palettePopupWindowId = null;
    }
  }
  // Recover popup window ID if service worker restarted while popup was open
  try {
    const popupBaseUrl = chrome.runtime.getURL('palette.html');
    const popups = await chrome.windows.getAll({ populate: true, windowTypes: ['popup'] });
    const match = popups.find((w) => w.tabs?.some((t) => t.url?.startsWith(popupBaseUrl)));
    if (match?.id) {
      palettePopupWindowId = match.id;
      return match;
    }
  } catch {}
  return null;
}

async function triggerCommandPaletteOnActiveTab(initialQuery = '', toggle = true): Promise<void> {
  const existingWin = await findExistingPalettePopupWindow();
  if (existingWin?.id) {
    if (toggle) {
      try {
        await chrome.windows.remove(existingWin.id);
      } catch {}
      palettePopupWindowId = null;
      return;
    } else {
      try {
        await chrome.windows.update(existingWin.id, { focused: true });
        return;
      } catch {
        palettePopupWindowId = null;
      }
    }
  }

  let normalWin: chrome.windows.Window | undefined;
  try {
    normalWin = await chrome.windows.getLastFocused({
      populate: false,
      windowTypes: ['normal'],
    });
  } catch {}

  const popupWidth = 650;
  const popupHeight = 420;
  let left: number | undefined;
  let top: number | undefined;

  if (
    normalWin &&
    typeof normalWin.left === 'number' &&
    typeof normalWin.top === 'number' &&
    typeof normalWin.width === 'number' &&
    typeof normalWin.height === 'number'
  ) {
    left = Math.round(normalWin.left + (normalWin.width - popupWidth) / 2);
    top = Math.round(normalWin.top + Math.max(80, (normalWin.height - popupHeight) * 0.28));
  }

  const paletteUrl = new URL(chrome.runtime.getURL('palette.html'));
  if (initialQuery) {
    paletteUrl.searchParams.set('q', initialQuery);
  }

  try {
    const createdWin = await chrome.windows.create({
      url: paletteUrl.toString(),
      type: 'popup',
      width: popupWidth,
      height: popupHeight,
      left,
      top,
      focused: true,
    });
    if (createdWin?.id) {
      palettePopupWindowId = createdWin.id;
    }
  } catch (err) {
    console.warn('Failed to open palette popup window:', err);
  }
}

async function getTargetNormalWindowId(): Promise<number | undefined> {
  try {
    const win = await chrome.windows.getLastFocused({
      populate: false,
      windowTypes: ['normal'],
    });
    if (win?.id) return win.id;
  } catch {}
  try {
    const allWins = await chrome.windows.getAll({ windowTypes: ['normal'] });
    return allWins[0]?.id;
  } catch {}
  return undefined;
}

async function openHubPage(section: 'archive' | 'downloads' | 'spaces' | 'settings' = 'spaces'): Promise<void> {
  const hubBaseUrl = chrome.runtime.getURL('hub.html');
  const targetUrl = `${hubBaseUrl}#${section}`;
  const winId = await getTargetNormalWindowId();
  const tabs = await getNormalWindowTabs();
  const existing = tabs.find((t) => t.url && t.url.startsWith(hubBaseUrl));
  if (existing && typeof existing.id === 'number') {
    await chrome.tabs.update(existing.id, { url: targetUrl, active: true });
    if (existing.windowId) {
      await chrome.windows.update(existing.windowId, { focused: true });
    }
  } else {
    await chrome.tabs.create({ url: targetUrl, active: true, windowId: winId });
    if (winId) {
      await chrome.windows.update(winId, { focused: true });
    }
  }
}

async function executePaletteAction(item: CommandPaletteResult, rawQuery: string): Promise<void> {
  const s = await loadState();
  const winId = await getTargetNormalWindowId();
  if (winId) {
    try {
      await chrome.windows.update(winId, { focused: true });
    } catch {}
  }

  if (item.type === 'space' && item.spaceId) {
    await handleMessage({ type: 'SWITCH_SPACE', spaceId: item.spaceId, focusFirstTab: true });
    return;
  }

  if (item.type === 'favorite-tab' && item.favoriteId) {
    await handleMessage({ type: 'ACTIVATE_FAVORITE', favoriteId: item.favoriteId });
    return;
  }

  if (item.type === 'pinned-tab' && item.spaceId && item.pinnedItemId) {
    if (s.activeSpaceId !== item.spaceId) {
      s.activeSpaceId = item.spaceId;
    }
    await handleMessage({
      type: 'ACTIVATE_PINNED_TAB',
      spaceId: item.spaceId,
      itemId: item.pinnedItemId,
    });
    return;
  }

  if (item.type === 'open-tab' && typeof item.tabId === 'number') {
    if (item.spaceId && s.activeSpaceId !== item.spaceId) {
      s.activeSpaceId = item.spaceId;
      await updateAllTabGroupCollapseStates();
    }
    await handleMessage({ type: 'ACTIVATE_NORMAL_TAB', tabId: item.tabId });
    return;
  }

  if ((item.type === 'search-shortcut' || item.type === 'url') && item.url && isSafeNavigationUrl(item.url)) {
    const created = await chrome.tabs.create({ url: item.url, active: true, windowId: winId });
    if (typeof created.id === 'number') {
      s.tabSpaceMap[created.id] = s.activeSpaceId;
      const activeSpace = s.spaces.find((sp) => sp.id === s.activeSpaceId);
      if (activeSpace) {
        await syncSpaceTabGroup(activeSpace);
      }
      await saveState();
    }
    return;
  }

  if (item.type === 'command' && item.commandAction) {
    if (item.commandAction === 'open-spaces') await openHubPage('spaces');
    else if (item.commandAction === 'open-archive') await openHubPage('archive');
    else if (item.commandAction === 'open-downloads') await openHubPage('downloads');
    else if (item.commandAction === 'open-settings') await openHubPage('settings');
    return;
  }

  // Default browser search engine via chrome.search.query
  const searchText = item.searchQuery || rawQuery.trim();
  if (searchText) {
    try {
      await chrome.search.query({
        text: searchText,
        disposition: 'NEW_TAB',
      });
    } catch {
      const fallbackUrl = `https://www.google.com/search?q=${encodeURIComponent(searchText)}`;
      const created = await chrome.tabs.create({ url: fallbackUrl, active: true, windowId: winId });
      if (typeof created.id === 'number') {
        s.tabSpaceMap[created.id] = s.activeSpaceId;
        await saveState();
      }
    }
  }
}

function getOrCreateTargetSpace(s: BarkState, spaceId?: string): Space {
  if (spaceId) {
    const found = s.spaces.find((sp) => sp.id === spaceId);
    if (found) return found;
  }
  if (s.activeSpaceId) {
    const active = s.spaces.find((sp) => sp.id === s.activeSpaceId);
    if (active) return active;
  }
  if (s.spaces.length > 0) {
    s.activeSpaceId = s.spaces[0].id;
    return s.spaces[0];
  }
  const created: Space = {
    id: uid('space'),
    name: 'Space',
    emoji: '🌍',
    color: 'purple',
    chromeGroupId: null,
    pinnedItems: [],
  };
  s.spaces.push(created);
  s.activeSpaceId = created.id;
  return created;
}

function reorderSiblingItems(
  space: Space,
  movingItem: PinnedItem,
  targetParentId: string | null,
  targetIndex: number
) {
  movingItem.parentId = targetParentId;
  const siblings = space.pinnedItems.filter(
    (i) => i.parentId === targetParentId && i.id !== movingItem.id
  );
  const others = space.pinnedItems.filter(
    (i) => i.parentId !== targetParentId && i.id !== movingItem.id
  );
  const clampedIdx = Math.max(0, Math.min(targetIndex, siblings.length));
  siblings.splice(clampedIdx, 0, movingItem);
  space.pinnedItems = [...others, ...siblings];
}

// Shared Helpers for Favorites & Pinned Tab Entries
async function activateTabEntry(
  entry: FavoriteItem | PinnedTabNode,
  openUrl: string,
  onNewTabCreated?: (tabId: number) => Promise<void>
): Promise<void> {
  if (entry.tabId) {
    try {
      const existing = await chrome.tabs.get(entry.tabId);
      if (existing && typeof existing.id === 'number') {
        await chrome.tabs.update(existing.id, { active: true });
        if (existing.windowId) {
          await chrome.windows.update(existing.windowId, { focused: true }).catch(() => {});
        }
        return;
      }
    } catch {
      entry.tabId = null;
    }
  }

  const winId = await getTargetNormalWindowId();
  const created = await chrome.tabs.create({
    url: openUrl,
    active: true,
    windowId: winId,
  });
  if (typeof created.id === 'number') {
    entry.tabId = created.id;
    entry.currentUrl = entry.url;
    await onNewTabCreated?.(created.id);
  }
}

async function reduceTabEntry(entry: FavoriteItem | PinnedTabNode): Promise<void> {
  const tabIdToClose = entry.tabId;
  entry.tabId = null;
  entry.currentUrl = undefined;
  if (tabIdToClose) {
    intentionallyClosedTabIds.add(tabIdToClose);
    try {
      await chrome.tabs.remove(tabIdToClose);
    } catch {}
  }
}

async function resetTabEntryUrl(entry: FavoriteItem | PinnedTabNode): Promise<void> {
  entry.currentUrl = entry.url;
  if (entry.tabId) {
    try {
      await chrome.tabs.update(entry.tabId, { url: entry.url, active: true });
    } catch {}
  }
}

async function replaceTabEntryWithCurrentUrl(
  entry: FavoriteItem | PinnedTabNode,
  shouldUpdateTitle: boolean
): Promise<void> {
  if (entry.tabId) {
    try {
      const live = await chrome.tabs.get(entry.tabId);
      if (live.url && isSafeNavigationUrl(live.url)) {
        entry.url = live.url;
        entry.currentUrl = live.url;
        if (live.title && shouldUpdateTitle) {
          entry.title = live.title;
        }
      }
    } catch {}
  } else if (entry.currentUrl && isSafeNavigationUrl(entry.currentUrl)) {
    entry.url = entry.currentUrl;
  }
}

async function fetchSearchSuggestions(q: string, urlTemplate?: string): Promise<string[]> {
  const filterSuggestions = (arr: unknown[]): string[] =>
    arr
      .filter(
        (item): item is string =>
          typeof item === 'string' &&
          item.trim().length > 0 &&
          item.toLowerCase() !== q.toLowerCase()
      )
      .slice(0, 7);

  if (urlTemplate) {
    try {
      const sampleUrl = new URL(urlTemplate.replace('%s', encodeURIComponent(q)));
      const host = sampleUrl.hostname.toLowerCase();

      // 1. YouTube
      if (host.includes('youtube.com') || host === 'youtu.be') {
        const res = await fetch(
          `https://suggestqueries.google.com/complete/search?client=firefox&ds=yt&q=${encodeURIComponent(q)}`
        );
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && Array.isArray(data[1])) {
            const list = filterSuggestions(data[1]);
            if (list.length > 0) return list;
          }
        }
      }

      // 2. MediaWiki sites (only probe when hostname or URL looks like a wiki)
      if (host.includes('wiki') || host.endsWith('fandom.com') || sampleUrl.pathname.includes('/wiki')) {
        const apiEndpoints = [
          `${sampleUrl.origin}/api.php?action=opensearch&search=${encodeURIComponent(q)}&limit=8&format=json`,
          `${sampleUrl.origin}/w/api.php?action=opensearch&search=${encodeURIComponent(q)}&limit=8&format=json`,
        ];
        for (const ep of apiEndpoints) {
          try {
            const res = await fetch(ep);
            if (res.ok) {
              const contentType = res.headers.get('content-type') || '';
              if (contentType.includes('json')) {
                const data = await res.json();
                if (Array.isArray(data) && Array.isArray(data[1])) {
                  const list = filterSuggestions(data[1]);
                  if (list.length > 0) return list;
                }
              }
            }
          } catch {
            // Try next endpoint
          }
        }
      }
    } catch {
      // Fallback to general search suggestions
    }
  }

  // General browser search suggestions (Google -> DuckDuckGo fallback)
  try {
    const res = await fetch(
      `https://suggestqueries.google.com/complete/search?client=chrome&q=${encodeURIComponent(q)}`
    );
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && Array.isArray(data[1])) {
        const list = filterSuggestions(data[1]);
        if (list.length > 0) return list;
      }
    }
  } catch {}

  try {
    const res = await fetch(
      `https://ac.duckduckgo.com/ac/?q=${encodeURIComponent(q)}&type=list`
    );
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && Array.isArray(data[1])) {
        return filterSuggestions(data[1]);
      }
    }
  } catch {}

  return [];
}

function findSpaceAndPinnedTab(
  s: BarkState,
  spaceId: string,
  itemId: string
): { space: Space; item: PinnedTabNode } | null {
  const space = s.spaces.find((sp) => sp.id === spaceId);
  if (!space) return null;
  const item = space.pinnedItems.find(
    (i): i is PinnedTabNode => i.id === itemId && i.type === 'tab'
  );
  if (!item) return null;
  return { space, item };
}

async function handleMessage(msg: BarkMessage): Promise<unknown> {
  const s = await loadState();

  switch (msg.type) {
    case 'GET_STATE': {
      const liveTabs = await getLiveTabs();
      return { state: s, liveTabs };
    }

    case 'OPEN_COMMAND_PALETTE': {
      await triggerCommandPaletteOnActiveTab(msg.initialQuery || '', false);
      return { ok: true };
    }

    case 'TOGGLE_COMMAND_PALETTE': {
      await triggerCommandPaletteOnActiveTab(msg.initialQuery || '', true);
      return { ok: true };
    }

    case 'EXECUTE_PALETTE_ACTION': {
      await executePaletteAction(msg.item, msg.query);
      return { ok: true };
    }

    case 'SWITCH_SPACE': {
      const targetSpace = s.spaces.find((sp) => sp.id === msg.spaceId);
      if (!targetSpace) return { ok: false };
      s.activeSpaceId = targetSpace.id;
      await syncSpaceTabGroup(targetSpace);
      await updateAllTabGroupCollapseStates();

      if (msg.focusFirstTab) {
        const liveTabs = await getLiveTabs();
        const pinnedOpen = targetSpace.pinnedItems.find(
          (i): i is PinnedTabNode =>
            i.type === 'tab' && !!i.tabId && liveTabs.some((t) => t.id === i.tabId)
        );
        const normalOpen = liveTabs.find(
          (t) => !isPinnedOrFavoriteTab(s, t.id) && s.tabSpaceMap[t.id] === targetSpace.id
        );
        const tabIdToFocus = normalOpen?.id ?? pinnedOpen?.tabId;
        if (tabIdToFocus) {
          try {
            await chrome.tabs.update(tabIdToFocus, { active: true });
          } catch {}
        }
      }

      await saveState();
      return { ok: true };
    }

    case 'CREATE_SPACE': {
      const newSpace: Space = {
        id: uid('space'),
        name: msg.name.trim() || 'New Space',
        emoji: msg.emoji || '🌍',
        color: msg.color || 'purple',
        chromeGroupId: null,
        pinnedItems: [],
      };
      s.spaces.push(newSpace);
      s.activeSpaceId = newSpace.id;

      if (msg.moveItem) {
        if (msg.moveItem.kind === 'normal' && typeof msg.moveItem.id === 'number') {
          s.tabSpaceMap[msg.moveItem.id] = newSpace.id;
        } else if (
          (msg.moveItem.kind === 'pinned' || msg.moveItem.kind === 'folder') &&
          typeof msg.moveItem.id === 'string' &&
          msg.moveItem.fromSpaceId
        ) {
          const fromSpace = s.spaces.find((sp) => sp.id === msg.moveItem!.fromSpaceId);
          if (fromSpace) {
            const targetId = msg.moveItem.id;
            const descendants = getDescendantIds(fromSpace.pinnedItems, targetId);
            const moving = fromSpace.pinnedItems.filter(
              (i) => i.id === targetId || descendants.has(i.id)
            );
            fromSpace.pinnedItems = fromSpace.pinnedItems.filter(
              (i) => i.id !== targetId && !descendants.has(i.id)
            );
            for (const m of moving) {
              if (m.id === targetId) m.parentId = null;
              newSpace.pinnedItems.push(m);
            }
          }
        }
      }

      await syncSpaceTabGroup(newSpace);
      await updateAllTabGroupCollapseStates();
      await saveState();
      return { ok: true, space: newSpace };
    }

    case 'UPDATE_SPACE': {
      const sp = s.spaces.find((x) => x.id === msg.spaceId);
      if (sp) {
        sp.name = msg.name.trim() || sp.name;
        sp.emoji = msg.emoji || sp.emoji;
        sp.color = msg.color || sp.color;
        await syncSpaceTabGroup(sp);
        await saveState();
      }
      return { ok: true };
    }

    case 'DELETE_SPACE': {
      const idx = s.spaces.findIndex((x) => x.id === msg.spaceId);
      if (idx === -1) return { ok: false };
      const [removed] = s.spaces.splice(idx, 1);
      const fallbackSpace = s.spaces[Math.max(0, idx - 1)];
      if (s.activeSpaceId === removed.id) {
        s.activeSpaceId = fallbackSpace?.id || '';
      }
      for (const [tabIdStr, spId] of Object.entries(s.tabSpaceMap)) {
        if (spId === removed.id) {
          if (fallbackSpace) {
            s.tabSpaceMap[Number(tabIdStr)] = fallbackSpace.id;
          } else {
            delete s.tabSpaceMap[Number(tabIdStr)];
          }
        }
      }
      await updateAllTabGroupCollapseStates();
      await saveState();
      return { ok: true };
    }

    case 'ACTIVATE_FAVORITE': {
      const fav = s.favorites.find((f) => f.id === msg.favoriteId);
      if (!fav) return { ok: false };
      await activateTabEntry(fav, fav.currentUrl || fav.url);
      await saveState();
      return { ok: true };
    }

    case 'REDUCE_FAVORITE': {
      const fav = s.favorites.find((f) => f.id === msg.favoriteId);
      if (!fav) return { ok: false };
      await reduceTabEntry(fav);
      await saveState();
      return { ok: true };
    }

    case 'REMOVE_FAVORITE': {
      const idx = s.favorites.findIndex((f) => f.id === msg.favoriteId);
      if (idx !== -1) {
        const [fav] = s.favorites.splice(idx, 1);
        addArchiveEntry(s, {
          title: fav.title,
          url: fav.currentUrl || fav.url,
          favIconUrl: fav.favIconUrl,
          spaceId: s.activeSpaceId,
          reason: 'unpinned',
        });
        await reduceTabEntry(fav);
        await saveState();
      }
      return { ok: true };
    }

    case 'ADD_FAVORITE': {
      const safeUrl = sanitizeUserUrl(msg.url);
      if (!safeUrl) return { ok: false };
      s.favorites.push({
        id: uid('fav'),
        title: msg.title || safeUrl,
        url: safeUrl,
        currentUrl: safeUrl,
        favIconUrl: msg.favIconUrl || getFaviconUrl(safeUrl),
        tabId: msg.tabId ?? null,
      });
      await saveState();
      return { ok: true };
    }

    case 'UPDATE_FAVORITE': {
      const fav = s.favorites.find((f) => f.id === msg.favoriteId);
      if (!fav) return { ok: false };
      if (msg.updates.title !== undefined && msg.updates.title.trim()) {
        fav.title = msg.updates.title.trim();
      }
      if (msg.updates.url !== undefined && msg.updates.url.trim()) {
        const safeUrl = sanitizeUserUrl(msg.updates.url);
        if (!safeUrl) return { ok: false };
        fav.url = safeUrl;
        if (!fav.currentUrl) {
          fav.favIconUrl = getFaviconUrl(fav.url);
        }
      }
      await saveState();
      return { ok: true };
    }

    case 'REPLACE_FAVORITE_WITH_CURRENT_URL': {
      const fav = s.favorites.find((f) => f.id === msg.favoriteId);
      if (!fav) return { ok: false };
      await replaceTabEntryWithCurrentUrl(fav, true);
      await saveState();
      return { ok: true };
    }

    case 'RESET_FAVORITE_URL': {
      const fav = s.favorites.find((f) => f.id === msg.favoriteId);
      if (!fav) return { ok: false };
      await resetTabEntryUrl(fav);
      await saveState();
      return { ok: true };
    }

    case 'DUPLICATE_FAVORITE': {
      const idx = s.favorites.findIndex((f) => f.id === msg.favoriteId);
      if (idx === -1) return { ok: false };
      const fav = s.favorites[idx];
      s.favorites.splice(idx + 1, 0, {
        ...structuredClone(fav),
        id: uid('fav'),
        tabId: null,
        currentUrl: undefined,
      });
      await saveState();
      return { ok: true };
    }

    case 'ACTIVATE_PINNED_TAB': {
      const found = findSpaceAndPinnedTab(s, msg.spaceId, msg.itemId);
      if (!found) return { ok: false };
      await activateTabEntry(found.item, found.item.url, async () => {
        await syncSpaceTabGroup(found.space);
      });
      await saveState();
      return { ok: true };
    }

    case 'REDUCE_PINNED_TAB': {
      const found = findSpaceAndPinnedTab(s, msg.spaceId, msg.itemId);
      if (!found) return { ok: false };
      await reduceTabEntry(found.item);
      await saveState();
      return { ok: true };
    }

    case 'REMOVE_PINNED_TAB': {
      const space = s.spaces.find((sp) => sp.id === msg.spaceId);
      if (!space) return { ok: false };
      const idx = space.pinnedItems.findIndex((i) => i.id === msg.itemId);
      if (idx === -1) return { ok: false };
      const [removed] = space.pinnedItems.splice(idx, 1);
      if (removed.type === 'tab') {
        addArchiveEntry(s, {
          title: removed.customTitle || removed.title,
          url: removed.currentUrl || removed.url,
          favIconUrl: removed.favIconUrl,
          spaceId: space.id,
          reason: 'unpinned',
        });
        await reduceTabEntry(removed);
      }
      await saveState();
      return { ok: true };
    }

    case 'RESET_PINNED_TAB_URL': {
      const found = findSpaceAndPinnedTab(s, msg.spaceId, msg.itemId);
      if (!found) return { ok: false };
      await resetTabEntryUrl(found.item);
      await saveState();
      return { ok: true };
    }

    case 'UPDATE_PINNED_TAB': {
      const found = findSpaceAndPinnedTab(s, msg.spaceId, msg.itemId);
      if (!found) return { ok: false };
      const { item } = found;
      if (msg.updates.customTitle !== undefined) {
        item.customTitle = msg.updates.customTitle.trim() || undefined;
      }
      if (msg.updates.title !== undefined) {
        item.title = msg.updates.title;
      }
      if (msg.updates.url !== undefined && msg.updates.url.trim()) {
        const safeUrl = sanitizeUserUrl(msg.updates.url);
        if (!safeUrl) return { ok: false };
        item.url = safeUrl;
        if (!item.currentUrl) {
          item.favIconUrl = getFaviconUrl(item.url);
        }
      }
      await saveState();
      return { ok: true };
    }

    case 'REPLACE_PINNED_WITH_CURRENT_URL': {
      const found = findSpaceAndPinnedTab(s, msg.spaceId, msg.itemId);
      if (!found) return { ok: false };
      await replaceTabEntryWithCurrentUrl(found.item, !found.item.customTitle);
      await saveState();
      return { ok: true };
    }

    case 'DUPLICATE_PINNED_TAB': {
      const found = findSpaceAndPinnedTab(s, msg.spaceId, msg.itemId);
      if (!found) return { ok: false };
      const { space, item } = found;
      const idx = space.pinnedItems.findIndex((i) => i.id === item.id);
      space.pinnedItems.splice(idx + 1, 0, {
        ...structuredClone(item),
        id: uid('pin'),
        tabId: null,
        currentUrl: undefined,
      });
      await saveState();
      return { ok: true };
    }

    case 'MOVE_PINNED_ITEM_TO_SPACE': {
      if (msg.fromSpaceId === msg.toSpaceId) return { ok: true };
      const fromSpace = s.spaces.find((sp) => sp.id === msg.fromSpaceId);
      const toSpace = s.spaces.find((sp) => sp.id === msg.toSpaceId);
      if (!fromSpace || !toSpace) return { ok: false };

      const descendants = getDescendantIds(fromSpace.pinnedItems, msg.itemId);
      const moving = fromSpace.pinnedItems.filter(
        (i) => i.id === msg.itemId || descendants.has(i.id)
      );
      fromSpace.pinnedItems = fromSpace.pinnedItems.filter(
        (i) => i.id !== msg.itemId && !descendants.has(i.id)
      );

      for (const m of moving) {
        if (m.id === msg.itemId) {
          m.parentId = null;
        }
        toSpace.pinnedItems.push(m);
      }

      await syncSpaceTabGroup(toSpace);
      await saveState();
      return { ok: true };
    }

    case 'CREATE_FOLDER': {
      const space = getOrCreateTargetSpace(s, msg.spaceId);
      const folder: FolderNode = {
        id: uid('folder'),
        type: 'folder',
        title: msg.title.trim() || 'New Folder',
        collapsed: false,
        parentId: msg.parentId ?? null,
      };
      space.pinnedItems.push(folder);
      await saveState();
      return { ok: true, folder };
    }

    case 'TOGGLE_FOLDER': {
      const space = s.spaces.find((sp) => sp.id === msg.spaceId);
      if (!space) return { ok: false };
      const folder = space.pinnedItems.find(
        (i): i is FolderNode => i.id === msg.folderId && i.type === 'folder'
      );
      if (folder) {
        folder.collapsed = !folder.collapsed;
        await saveState();
      }
      return { ok: true };
    }

    case 'RENAME_FOLDER': {
      const space = s.spaces.find((sp) => sp.id === msg.spaceId);
      if (!space) return { ok: false };
      const folder = space.pinnedItems.find(
        (i): i is FolderNode => i.id === msg.folderId && i.type === 'folder'
      );
      if (folder && msg.title.trim()) {
        folder.title = msg.title.trim();
        await saveState();
      }
      return { ok: true };
    }

    case 'DUPLICATE_FOLDER': {
      const space = s.spaces.find((sp) => sp.id === msg.spaceId);
      if (!space) return { ok: false };
      const rootFolder = space.pinnedItems.find(
        (i): i is FolderNode => i.id === msg.folderId && i.type === 'folder'
      );
      if (!rootFolder) return { ok: false };

      const descendants = getDescendantIds(space.pinnedItems, rootFolder.id);
      const idMap = new Map<string, string>();
      idMap.set(rootFolder.id, uid('folder'));
      for (const dId of descendants) {
        idMap.set(dId, uid('item'));
      }

      const clonedItems: PinnedItem[] = [];
      for (const item of space.pinnedItems) {
        if (item.id === rootFolder.id || descendants.has(item.id)) {
          const newId = idMap.get(item.id)!;
          const newParentId =
            item.id === rootFolder.id
              ? rootFolder.parentId
              : item.parentId
              ? idMap.get(item.parentId) ?? null
              : null;

          if (item.type === 'folder') {
            clonedItems.push({
              ...structuredClone(item),
              id: newId,
              title: item.id === rootFolder.id ? `${item.title} Copy` : item.title,
              parentId: newParentId,
            });
          } else {
            clonedItems.push({
              ...structuredClone(item),
              id: newId,
              tabId: null,
              currentUrl: undefined,
              parentId: newParentId,
            });
          }
        }
      }
      space.pinnedItems.push(...clonedItems);
      await saveState();
      return { ok: true };
    }

    case 'DELETE_FOLDER': {
      const space = s.spaces.find((sp) => sp.id === msg.spaceId);
      if (!space) return { ok: false };
      const descendants = getDescendantIds(space.pinnedItems, msg.folderId);
      const toRemove = space.pinnedItems.filter(
        (i) => i.id === msg.folderId || descendants.has(i.id)
      );
      space.pinnedItems = space.pinnedItems.filter(
        (i) => i.id !== msg.folderId && !descendants.has(i.id)
      );
      for (const item of toRemove) {
        if (item.type === 'tab') {
          addArchiveEntry(s, {
            title: item.customTitle || item.title,
            url: item.currentUrl || item.url,
            favIconUrl: item.favIconUrl,
            spaceId: space.id,
            reason: 'unpinned',
          });
          await reduceTabEntry(item);
        }
      }
      await saveState();
      return { ok: true };
    }

    case 'TURN_FOLDER_INTO_SPACE': {
      const space = s.spaces.find((sp) => sp.id === msg.spaceId);
      if (!space) return { ok: false };
      const folder = space.pinnedItems.find(
        (i): i is FolderNode => i.id === msg.folderId && i.type === 'folder'
      );
      if (!folder) return { ok: false };

      const descendants = getDescendantIds(space.pinnedItems, folder.id);
      const childItems = space.pinnedItems.filter((i) => descendants.has(i.id));
      space.pinnedItems = space.pinnedItems.filter(
        (i) => i.id !== folder.id && !descendants.has(i.id)
      );

      for (const item of childItems) {
        if (item.parentId === folder.id) {
          item.parentId = null;
        }
      }

      const newSpace: Space = {
        id: uid('space'),
        name: folder.title,
        emoji: '📂',
        color: space.color,
        chromeGroupId: null,
        pinnedItems: childItems,
      };
      s.spaces.push(newSpace);
      s.activeSpaceId = newSpace.id;
      await syncSpaceTabGroup(newSpace);
      await updateAllTabGroupCollapseStates();
      await saveState();
      return { ok: true };
    }

    case 'ACTIVATE_NORMAL_TAB': {
      try {
        await chrome.tabs.update(msg.tabId, { active: true });
      } catch {}
      return { ok: true };
    }

    case 'CLOSE_NORMAL_TAB': {
      try {
        const tab = await chrome.tabs.get(msg.tabId);
        if (tab) {
          addArchiveEntry(s, {
            title: s.tabCustomTitles[msg.tabId] || tab.title || tab.url || 'Tab',
            url: tab.url || '',
            favIconUrl: tab.favIconUrl,
            spaceId: s.tabSpaceMap[msg.tabId] || s.activeSpaceId,
            reason: 'closed',
          });
        }
        intentionallyClosedTabIds.add(msg.tabId);
        delete s.tabSpaceMap[msg.tabId];
        delete s.tabCustomTitles[msg.tabId];
        await chrome.tabs.remove(msg.tabId);
      } catch {}
      await saveState();
      return { ok: true };
    }

    case 'CLEAR_NORMAL_TABS': {
      const liveTabs = await getLiveTabs();
      const toClose: number[] = [];
      for (const t of liveTabs) {
        if (isPinnedOrFavoriteTab(s, t.id)) continue;
        const tabSpace = s.tabSpaceMap[t.id] || s.activeSpaceId || '';
        if (!msg.spaceId || tabSpace === msg.spaceId || s.spaces.length === 0) {
          addArchiveEntry(s, {
            title: s.tabCustomTitles[t.id] || t.title || t.url,
            url: t.url,
            favIconUrl: t.favIconUrl,
            spaceId: msg.spaceId || '',
            reason: 'cleared',
          });
          toClose.push(t.id);
          intentionallyClosedTabIds.add(t.id);
          delete s.tabSpaceMap[t.id];
          delete s.tabCustomTitles[t.id];
        }
      }

      if (toClose.length > 0) {
        if (toClose.length >= liveTabs.length) {
          const blank = await chrome.tabs.create({ active: true });
          if (typeof blank.id === 'number' && msg.spaceId) {
            s.tabSpaceMap[blank.id] = msg.spaceId;
          }
        }
        try {
          await chrome.tabs.remove(toClose);
        } catch {}
      }
      await saveState();
      return { ok: true };
    }

    case 'PIN_NORMAL_TAB': {
      const space = getOrCreateTargetSpace(s, msg.spaceId);
      try {
        const tab = await chrome.tabs.get(msg.tabId);
        if (!tab || typeof tab.id !== 'number') return { ok: false };
        const newPin: PinnedTabNode = {
          id: uid('pin'),
          type: 'tab',
          title: tab.title || tab.url || 'Pinned Tab',
          customTitle: s.tabCustomTitles[tab.id],
          url: tab.url || 'https://www.google.com',
          currentUrl: tab.url,
          favIconUrl: tab.favIconUrl || getFaviconUrl(tab.url),
          tabId: tab.id,
          parentId: msg.parentId ?? null,
        };
        delete s.tabSpaceMap[tab.id];
        delete s.tabCustomTitles[tab.id];

        if (typeof msg.targetIndex === 'number') {
          reorderSiblingItems(space, newPin, msg.parentId ?? null, msg.targetIndex);
        } else {
          space.pinnedItems.push(newPin);
        }
        await syncSpaceTabGroup(space);
        await saveState();
      } catch {}
      return { ok: true };
    }

    case 'UNPIN_TO_NORMAL_TAB': {
      const space = s.spaces.find((sp) => sp.id === msg.spaceId);
      if (!space) return { ok: false };
      const idx = space.pinnedItems.findIndex(
        (i) => i.id === msg.itemId && i.type === 'tab'
      );
      if (idx === -1) return { ok: false };
      const [removed] = space.pinnedItems.splice(idx, 1) as [PinnedTabNode];

      if (removed.tabId) {
        s.tabSpaceMap[removed.tabId] = space.id;
        if (removed.customTitle) {
          s.tabCustomTitles[removed.tabId] = removed.customTitle;
        }
      } else {
        const winId = await getTargetNormalWindowId();
        const created = await chrome.tabs.create({
          url: removed.url,
          active: false,
          windowId: winId,
        });
        if (typeof created.id === 'number') {
          s.tabSpaceMap[created.id] = space.id;
          if (removed.customTitle) {
            s.tabCustomTitles[created.id] = removed.customTitle;
          }
        }
      }
      await syncSpaceTabGroup(space);
      await saveState();
      return { ok: true };
    }

    case 'MOVE_NORMAL_TAB_TO_SPACE': {
      const toSpace = s.spaces.find((sp) => sp.id === msg.toSpaceId);
      if (!toSpace) return { ok: false };
      s.tabSpaceMap[msg.tabId] = toSpace.id;
      await syncSpaceTabGroup(toSpace);
      await saveState();
      return { ok: true };
    }

    case 'RENAME_NORMAL_TAB': {
      if (msg.title.trim()) {
        s.tabCustomTitles[msg.tabId] = msg.title.trim();
      } else {
        delete s.tabCustomTitles[msg.tabId];
      }
      await saveState();
      return { ok: true };
    }

    case 'DUPLICATE_NORMAL_TAB': {
      try {
        const dup = await chrome.tabs.duplicate(msg.tabId);
        if (dup && typeof dup.id === 'number') {
          const spId = s.tabSpaceMap[msg.tabId] || s.activeSpaceId;
          s.tabSpaceMap[dup.id] = spId;
          const sp = s.spaces.find((x) => x.id === spId);
          if (sp) await syncSpaceTabGroup(sp);
        }
      } catch {}
      await saveState();
      return { ok: true };
    }

    case 'TOGGLE_MUTE_TAB': {
      try {
        const tab = await chrome.tabs.get(msg.tabId);
        const currentlyMuted = !!tab.mutedInfo?.muted;
        await chrome.tabs.update(msg.tabId, { muted: !currentlyMuted });
      } catch {}
      scheduleBroadcastState();
      return { ok: true };
    }

    case 'REORDER_FAVORITES': {
      const map = new Map(s.favorites.map((f) => [f.id, f]));
      const next: typeof s.favorites = [];
      for (const id of msg.orderedIds) {
        const item = map.get(id);
        if (item) {
          next.push(item);
          map.delete(id);
        }
      }
      for (const leftover of map.values()) {
        next.push(leftover);
      }
      s.favorites = next;
      await saveState();
      return { ok: true };
    }

    case 'FAVORITE_TO_PINNED': {
      const favIdx = s.favorites.findIndex((f) => f.id === msg.favoriteId);
      if (favIdx === -1) return { ok: false };
      const space = getOrCreateTargetSpace(s, msg.spaceId);
      const [fav] = s.favorites.splice(favIdx, 1);
      const pin: PinnedTabNode = {
        id: uid('pin'),
        type: 'tab',
        title: fav.title,
        url: fav.url,
        currentUrl: fav.currentUrl,
        favIconUrl: fav.favIconUrl,
        tabId: fav.tabId,
        parentId: msg.parentId,
      };
      reorderSiblingItems(space, pin, msg.parentId, msg.targetIndex ?? 999);
      await syncSpaceTabGroup(space);
      await saveState();
      return { ok: true };
    }

    case 'PINNED_TO_FAVORITE': {
      const space = s.spaces.find((sp) => sp.id === msg.spaceId);
      if (!space) return { ok: false };
      const idx = space.pinnedItems.findIndex(
        (i) => i.id === msg.itemId && i.type === 'tab'
      );
      if (idx === -1) return { ok: false };
      const [pin] = space.pinnedItems.splice(idx, 1) as [PinnedTabNode];
      const fav: FavoriteItem = {
        id: uid('fav'),
        title: pin.customTitle || pin.title,
        url: pin.url,
        currentUrl: pin.currentUrl,
        favIconUrl: pin.favIconUrl,
        tabId: pin.tabId,
      };
      const targetIdx =
        typeof msg.targetIndex === 'number'
          ? Math.max(0, Math.min(msg.targetIndex, s.favorites.length))
          : s.favorites.length;
      s.favorites.splice(targetIdx, 0, fav);
      await saveState();
      return { ok: true };
    }

    case 'NORMAL_TO_FAVORITE': {
      try {
        const tab = await chrome.tabs.get(msg.tabId);
        if (!tab || typeof tab.id !== 'number') return { ok: false };
        const fav: FavoriteItem = {
          id: uid('fav'),
          title: s.tabCustomTitles[tab.id] || tab.title || tab.url || 'Favorite',
          url: tab.url || 'https://www.google.com',
          currentUrl: tab.url,
          favIconUrl: tab.favIconUrl || getFaviconUrl(tab.url),
          tabId: tab.id,
        };
        delete s.tabSpaceMap[tab.id];
        delete s.tabCustomTitles[tab.id];
        const targetIdx =
          typeof msg.targetIndex === 'number'
            ? Math.max(0, Math.min(msg.targetIndex, s.favorites.length))
            : s.favorites.length;
        s.favorites.splice(targetIdx, 0, fav);
        await saveState();
      } catch {}
      return { ok: true };
    }

    case 'FAVORITE_TO_NORMAL': {
      const idx = s.favorites.findIndex((f) => f.id === msg.favoriteId);
      if (idx === -1) return { ok: false };
      const [fav] = s.favorites.splice(idx, 1);
      if (fav.tabId) {
        s.tabSpaceMap[fav.tabId] = msg.spaceId;
      } else {
        const winId = await getTargetNormalWindowId();
        const created = await chrome.tabs.create({
          url: fav.url,
          active: false,
          windowId: winId,
        });
        if (typeof created.id === 'number') {
          s.tabSpaceMap[created.id] = msg.spaceId;
        }
      }
      const sp = s.spaces.find((x) => x.id === msg.spaceId);
      if (sp) await syncSpaceTabGroup(sp);
      await saveState();
      return { ok: true };
    }

    case 'MOVE_PINNED_NODE': {
      const space = s.spaces.find((sp) => sp.id === msg.spaceId);
      if (!space) return { ok: false };
      const item = space.pinnedItems.find((i) => i.id === msg.itemId);
      if (!item) return { ok: false };
      if (item.type === 'folder' && msg.targetParentId) {
        const desc = getDescendantIds(space.pinnedItems, item.id);
        if (msg.targetParentId === item.id || desc.has(msg.targetParentId)) {
          return { ok: false };
        }
      }
      reorderSiblingItems(space, item, msg.targetParentId, msg.targetIndex);
      await saveState();
      return { ok: true };
    }

    case 'RESTORE_ARCHIVED_TAB': {
      const idx = s.archivedTabs.findIndex((a) => a.id === msg.archiveId);
      if (idx === -1) return { ok: false };
      const [archived] = s.archivedTabs.splice(idx, 1);
      const targetSpace =
        s.spaces.find((sp) => sp.id === archived.spaceId) ||
        s.spaces.find((sp) => sp.id === s.activeSpaceId) ||
        s.spaces[0];

      const winId = await getTargetNormalWindowId();
      const created = await chrome.tabs.create({
        url: archived.url,
        active: true,
        windowId: winId,
      });
      if (typeof created.id === 'number' && targetSpace) {
        s.tabSpaceMap[created.id] = targetSpace.id;
        await syncSpaceTabGroup(targetSpace);
      }
      await saveState();
      return { ok: true };
    }

    case 'DELETE_ARCHIVED_TAB': {
      s.archivedTabs = s.archivedTabs.filter((a) => a.id !== msg.archiveId);
      await saveState();
      return { ok: true };
    }

    case 'CLEAR_ARCHIVE': {
      s.archivedTabs = [];
      await saveState();
      return { ok: true };
    }

    case 'UPDATE_SETTINGS': {
      s.settings = {
        ...s.settings,
        ...msg.settings,
      };
      await cleanupExpiredArchive();
      await saveState();
      return { ok: true };
    }

    case 'SAVE_SEARCH_SHORTCUT': {
      const cleanPrefix = msg.shortcut.prefix.trim().toLowerCase();
      const rawTemplate = msg.shortcut.urlTemplate.trim();
      if (!cleanPrefix || !rawTemplate) return { ok: false };
      const testUrl = rawTemplate.replace('%s', 'test');
      if (!isSafeNavigationUrl(testUrl)) return { ok: false };

      const existingIdx = s.searchShortcuts.findIndex(
        (sc) => sc.id === msg.shortcut.id || sc.prefix.toLowerCase() === cleanPrefix
      );
      const entry = {
        id: msg.shortcut.id || uid('sc'),
        prefix: cleanPrefix,
        name: msg.shortcut.name.trim() || cleanPrefix.toUpperCase(),
        urlTemplate: rawTemplate,
      };
      if (existingIdx !== -1) {
        s.searchShortcuts[existingIdx] = entry;
      } else {
        s.searchShortcuts.push(entry);
      }
      await saveState();
      return { ok: true };
    }

    case 'DELETE_SEARCH_SHORTCUT': {
      s.searchShortcuts = s.searchShortcuts.filter((sc) => sc.id !== msg.shortcutId);
      await saveState();
      return { ok: true };
    }

    case 'FETCH_SEARCH_SUGGESTIONS': {
      const q = msg.query.trim();
      if (!q) return { suggestions: [] };
      const suggestions = await fetchSearchSuggestions(q, msg.urlTemplate);
      return { suggestions };
    }

    case 'OPEN_HUB': {
      await openHubPage(msg.section || 'spaces');
      return { ok: true };
    }
  }

  return { ok: false };
}

// Chrome Runtime & Browser Event Listeners
async function initExtensionRuntime(): Promise<void> {
  try {
    await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  } catch {}
  chrome.alarms.create('bark-archive-cleanup', { periodInMinutes: 5 });
  await loadState();
}

chrome.runtime.onInstalled.addListener(initExtensionRuntime);
chrome.runtime.onStartup.addListener(initExtensionRuntime);

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'bark-archive-cleanup') {
    await cleanupExpiredArchive();
  }
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command === 'toggle-command-palette') {
    await triggerCommandPaletteOnActiveTab('', true);
  }
});

chrome.runtime.onMessage.addListener((msg: BarkMessage, sender, sendResponse) => {
  // Sender verification: content scripts (running inside web pages) may only toggle the Command Palette
  const isExtensionOrigin =
    sender.id === chrome.runtime.id &&
    (!sender.tab || sender.url?.startsWith(chrome.runtime.getURL('')));

  if (!isExtensionOrigin && msg?.type !== 'TOGGLE_COMMAND_PALETTE') {
    sendResponse({ ok: false, error: 'Unauthorized sender context' });
    return false;
  }

  handleMessage(msg)
    .then((res) => sendResponse(res))
    .catch((err) => {
      console.error('Bark message error:', err);
      sendResponse({ ok: false });
    });
  return true;
});

chrome.tabs.onCreated.addListener(async (tab) => {
  if (typeof tab.id !== 'number') return;
  const tabUrl = tab.url || tab.pendingUrl || '';
  if (
    tabUrl.includes('palette.html') ||
    tabUrl.includes('sidepanel.html') ||
    (palettePopupWindowId !== null && tab.windowId === palettePopupWindowId)
  ) {
    return;
  }
  const s = await loadState();
  liveTabSnapshot.set(tab.id, {
    title: tab.title || tab.url || 'New Tab',
    url: tab.url || tab.pendingUrl || '',
    favIconUrl: tab.favIconUrl,
  });

  if (typeof tab.groupId === 'number' && tab.groupId > -1) {
    const grpSpace = s.spaces.find((sp) => sp.chromeGroupId === tab.groupId);
    if (grpSpace) {
      s.tabSpaceMap[tab.id] = grpSpace.id;
      await saveState();
      return;
    }
  }

  if (!s.tabSpaceMap[tab.id]) {
    s.tabSpaceMap[tab.id] = s.activeSpaceId;
  }
  s.tabLastActiveMap = s.tabLastActiveMap || {};
  s.tabLastActiveMap[tab.id] = Date.now();
  await saveState();
});

chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  const s = await loadState();
  let stateChanged = false;

  if (tab.url || tab.title || tab.favIconUrl) {
    liveTabSnapshot.set(tabId, {
      title: tab.title || tab.url || 'Tab',
      url: tab.url || '',
      favIconUrl: tab.favIconUrl,
    });
  }

  // Sync with Favorites
  for (const fav of s.favorites) {
    if (fav.tabId === tabId) {
      if (tab.url && !tab.url.startsWith('chrome://newtab')) {
        fav.currentUrl = tab.url;
        stateChanged = true;
      }
      if (tab.favIconUrl) {
        fav.favIconUrl = tab.favIconUrl;
        stateChanged = true;
      }
    }
  }

  // Sync with Workspace Pinned Tabs
  for (const sp of s.spaces) {
    for (const item of sp.pinnedItems) {
      if (item.type === 'tab' && item.tabId === tabId) {
        if (tab.url && !tab.url.startsWith('chrome://newtab')) {
          item.currentUrl = tab.url;
          stateChanged = true;
        }
        if (tab.title && !item.customTitle) {
          item.title = tab.title;
          stateChanged = true;
        }
        if (tab.favIconUrl) {
          item.favIconUrl = tab.favIconUrl;
          stateChanged = true;
        }
      }
    }
  }

  // Sync if user moved tab between Chrome Tab Groups
  if (!isSyncingGroups && changeInfo.groupId !== undefined) {
    if (changeInfo.groupId > -1) {
      const grpSpace = s.spaces.find((sp) => sp.chromeGroupId === changeInfo.groupId);
      if (grpSpace && s.tabSpaceMap[tabId] !== grpSpace.id) {
        s.tabSpaceMap[tabId] = grpSpace.id;
        stateChanged = true;
      }
    }
  }

  if (stateChanged) {
    await saveState();
  } else {
    scheduleBroadcastState();
  }
});

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const s = await loadState();
  s.tabLastActiveMap = s.tabLastActiveMap || {};
  s.tabLastActiveMap[activeInfo.tabId] = Date.now();
  await saveState();
});

chrome.windows.onRemoved.addListener((windowId) => {
  if (palettePopupWindowId === windowId) {
    palettePopupWindowId = null;
  }
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const s = await loadState();
  const snap = liveTabSnapshot.get(tabId);
  liveTabSnapshot.delete(tabId);

  const wasIntentional = intentionallyClosedTabIds.has(tabId);
  intentionallyClosedTabIds.delete(tabId);

  // 1. Was it a Global Favorite? Keep favorite tile in reduced state!
  const fav = s.favorites.find((f) => f.tabId === tabId);
  if (fav) {
    fav.tabId = null;
    fav.currentUrl = undefined;
    await saveState();
    return;
  }

  // 2. Was it a Workspace Pinned Tab? Keep pinned tab in reduced state!
  for (const sp of s.spaces) {
    const pinned = sp.pinnedItems.find(
      (i): i is PinnedTabNode => i.type === 'tab' && i.tabId === tabId
    );
    if (pinned) {
      pinned.tabId = null;
      pinned.currentUrl = undefined;
      await saveState();
      return;
    }
  }

  // 3. Normal tab closed -> add to Archived Tabs if not already archived
  const spaceId = s.tabSpaceMap[tabId] || s.activeSpaceId;
  const customTitle = s.tabCustomTitles[tabId];
  delete s.tabSpaceMap[tabId];
  delete s.tabCustomTitles[tabId];
  if (s.tabLastActiveMap) {
    delete s.tabLastActiveMap[tabId];
  }

  if (!wasIntentional && snap && snap.url) {
    addArchiveEntry(s, {
      title: customTitle || snap.title || snap.url,
      url: snap.url,
      favIconUrl: snap.favIconUrl,
      spaceId,
      reason: 'closed',
    });
  }

  await saveState();
});

chrome.tabGroups.onUpdated.addListener(async (group) => {
  if (isSyncingGroups) return;
  const s = await loadState();
  let sp = s.spaces.find((x) => x.chromeGroupId === group.id);
  if (!sp && group.title) {
    sp = s.spaces.find(
      (x) => !x.chromeGroupId && x.name.toLowerCase() === group.title!.trim().toLowerCase()
    );
    if (sp) {
      sp.chromeGroupId = group.id;
    }
  }
  if (sp) {
    if (group.title && group.title.trim()) {
      sp.name = group.title.trim();
    }
    sp.color = normalizeGroupColor(group.color);
    await saveState();
  }
});

chrome.tabGroups.onRemoved.addListener(async (group) => {
  if (isSyncingGroups) return;
  const s = await loadState();
  for (const sp of s.spaces) {
    if (sp.chromeGroupId === group.id) {
      sp.chromeGroupId = null;
    }
  }
  await saveState();
});
