export type SpaceColor =
  | 'grey'
  | 'blue'
  | 'red'
  | 'yellow'
  | 'green'
  | 'pink'
  | 'purple'
  | 'cyan'
  | 'orange';

export interface FavoriteItem {
  id: string;
  title: string;
  url: string;
  currentUrl?: string;
  favIconUrl?: string;
  tabId?: number | null;
}

export interface PinnedTabNode {
  id: string;
  type: 'tab';
  title: string;
  customTitle?: string;
  url: string;
  currentUrl?: string;
  favIconUrl?: string;
  tabId?: number | null;
  parentId: string | null;
}

export interface FolderNode {
  id: string;
  type: 'folder';
  title: string;
  collapsed: boolean;
  parentId: string | null;
}

export type PinnedItem = PinnedTabNode | FolderNode;

export interface Space {
  id: string;
  name: string;
  emoji: string;
  color: SpaceColor;
  chromeGroupId?: number | null;
  pinnedItems: PinnedItem[];
}

export interface ArchivedTabItem {
  id: string;
  title: string;
  url: string;
  favIconUrl?: string;
  spaceId: string;
  spaceName: string;
  spaceEmoji: string;
  archivedAt: number;
  reason: 'closed' | 'cleared' | 'unpinned';
}

export interface SearchShortcut {
  id: string;
  prefix: string;
  name: string;
  urlTemplate: string;
}

export interface ShortcutConfig {
  key: string;
  altKey: boolean;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
}

export interface BarkSettings {
  archiveRetentionHours: number;
  autoArchiveUnpinnedHours: number;
  customShortcut: ShortcutConfig;
  /** Shortcut that copies the current page's cleaned-up URL. `null` = disabled. */
  copyUrlShortcut: ShortcutConfig | null;
}

export interface BarkState {
  initialized: boolean;
  activeSpaceId: string;
  favorites: FavoriteItem[];
  spaces: Space[];
  tabSpaceMap: Record<number, string>;
  tabCustomTitles: Record<number, string>;
  tabLastActiveMap?: Record<number, number>;
  archivedTabs: ArchivedTabItem[];
  searchShortcuts: SearchShortcut[];
  settings: BarkSettings;
}

export interface LiveTabInfo {
  id: number;
  title: string;
  url: string;
  favIconUrl?: string;
  active: boolean;
  audible: boolean;
  muted: boolean;
  groupId: number;
  index: number;
  windowId: number;
}

export type CommandPaletteItemType =
  | 'space'
  | 'open-tab'
  | 'pinned-tab'
  | 'favorite-tab'
  | 'search-shortcut'
  | 'url'
  | 'default-search'
  | 'command';

export interface CommandPaletteResult {
  id: string;
  type: CommandPaletteItemType;
  title: string;
  subtitle?: string;
  url?: string;
  favIconUrl?: string;
  badgeText?: string;
  badgeEmoji?: string;
  badgeColor?: SpaceColor;
  spaceId?: string;
  tabId?: number;
  pinnedItemId?: string;
  favoriteId?: string;
  searchPrefix?: string;
  searchQuery?: string;
  commandAction?: string;
}

export type BarkMessage =
  | { type: 'GET_STATE' }
  | { type: 'OPEN_COMMAND_PALETTE'; initialQuery?: string }
  | { type: 'TOGGLE_COMMAND_PALETTE'; initialQuery?: string }
  | { type: 'EXECUTE_PALETTE_ACTION'; item: CommandPaletteResult; query: string }
  | { type: 'SWITCH_SPACE'; spaceId: string; focusFirstTab?: boolean }
  | { type: 'CREATE_SPACE'; name: string; emoji: string; color: SpaceColor; moveItem?: { kind: 'pinned' | 'normal' | 'folder'; id: string | number; fromSpaceId?: string } }
  | { type: 'UPDATE_SPACE'; spaceId: string; name: string; emoji: string; color: SpaceColor }
  | { type: 'DELETE_SPACE'; spaceId: string }
  | { type: 'ACTIVATE_FAVORITE'; favoriteId: string }
  | { type: 'REDUCE_FAVORITE'; favoriteId: string }
  | { type: 'REMOVE_FAVORITE'; favoriteId: string }
  | { type: 'ADD_FAVORITE'; title: string; url: string; favIconUrl?: string; tabId?: number }
  | { type: 'UPDATE_FAVORITE'; favoriteId: string; updates: Partial<FavoriteItem> }
  | { type: 'REPLACE_FAVORITE_WITH_CURRENT_URL'; favoriteId: string }
  | { type: 'RESET_FAVORITE_URL'; favoriteId: string }
  | { type: 'DUPLICATE_FAVORITE'; favoriteId: string }
  | { type: 'ACTIVATE_PINNED_TAB'; spaceId: string; itemId: string }
  | { type: 'REDUCE_PINNED_TAB'; spaceId: string; itemId: string }
  | { type: 'REMOVE_PINNED_TAB'; spaceId: string; itemId: string }
  | { type: 'RESET_PINNED_TAB_URL'; spaceId: string; itemId: string }
  | { type: 'UPDATE_PINNED_TAB'; spaceId: string; itemId: string; updates: Partial<PinnedTabNode> }
  | { type: 'REPLACE_PINNED_WITH_CURRENT_URL'; spaceId: string; itemId: string }
  | { type: 'DUPLICATE_PINNED_TAB'; spaceId: string; itemId: string }
  | { type: 'MOVE_PINNED_ITEM_TO_SPACE'; fromSpaceId: string; itemId: string; toSpaceId: string }
  | { type: 'CREATE_FOLDER'; spaceId: string; title: string; parentId?: string | null }
  | { type: 'TOGGLE_FOLDER'; spaceId: string; folderId: string }
  | { type: 'RENAME_FOLDER'; spaceId: string; folderId: string; title: string }
  | { type: 'DUPLICATE_FOLDER'; spaceId: string; folderId: string }
  | { type: 'DELETE_FOLDER'; spaceId: string; folderId: string }
  | { type: 'TURN_FOLDER_INTO_SPACE'; spaceId: string; folderId: string }
  | { type: 'ACTIVATE_NORMAL_TAB'; tabId: number }
  | { type: 'CLOSE_NORMAL_TAB'; tabId: number }
  | { type: 'CLEAR_NORMAL_TABS'; spaceId: string }
  | { type: 'PIN_NORMAL_TAB'; tabId: number; spaceId: string; parentId?: string | null; targetIndex?: number }
  | { type: 'UNPIN_TO_NORMAL_TAB'; spaceId: string; itemId: string }
  | { type: 'MOVE_NORMAL_TAB_TO_SPACE'; tabId: number; toSpaceId: string }
  | { type: 'RENAME_NORMAL_TAB'; tabId: number; title: string }
  | { type: 'DUPLICATE_NORMAL_TAB'; tabId: number }
  | { type: 'TOGGLE_MUTE_TAB'; tabId: number }
  | { type: 'REORDER_FAVORITES'; orderedIds: string[] }
  | { type: 'FAVORITE_TO_PINNED'; favoriteId: string; spaceId: string; parentId: string | null; targetIndex?: number }
  | { type: 'PINNED_TO_FAVORITE'; spaceId: string; itemId: string; targetIndex?: number }
  | { type: 'NORMAL_TO_FAVORITE'; tabId: number; targetIndex?: number }
  | { type: 'FAVORITE_TO_NORMAL'; favoriteId: string; spaceId: string }
  | { type: 'MOVE_PINNED_NODE'; spaceId: string; itemId: string; targetParentId: string | null; targetIndex: number }
  | { type: 'RESTORE_ARCHIVED_TAB'; archiveId: string }
  | { type: 'DELETE_ARCHIVED_TAB'; archiveId: string }
  | { type: 'CLEAR_ARCHIVE' }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<BarkSettings> }
  | { type: 'SAVE_SEARCH_SHORTCUT'; shortcut: SearchShortcut }
  | { type: 'DELETE_SEARCH_SHORTCUT'; shortcutId: string }
  | { type: 'FETCH_SEARCH_SUGGESTIONS'; query: string; urlTemplate?: string }
  | { type: 'OPEN_HUB'; section?: 'archive' | 'downloads' | 'spaces' | 'settings' };
