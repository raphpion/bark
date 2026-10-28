import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { getDefaultSettings, SPACE_COLORS } from '../shared/constants';
import { showContextMenu } from '../shared/contextMenu';
import { openSpaceModal } from '../shared/spaceModal';
import {
  BarkMessage,
  BarkState,
  FolderNode,
  LiveTabInfo,
  ShortcutConfig,
  Space,
} from '../shared/types';
import {
  animateRowExit,
  BackResetIcon,
  ClearArrowDownIcon,
  CloseIcon,
  Favicon,
  FolderAnimatedIcon,
  InlineRenameInput,
  MinusIcon,
  PencilIcon,
  PinSlashIcon,
} from '../shared/uiHelpers';
import {
  formatRelativeTime,
  formatShortcutLabel,
  getPinnedTabIds,
  isSamePinnedUrl,
  matchesShortcut,
  shortcutsEqual,
  uid,
} from '../shared/utils';

type HubSection = 'archive' | 'downloads' | 'spaces' | 'settings';
type ShortcutTarget = 'palette' | 'copyUrl';

let hubDragItem:
  | { kind: 'pinned' | 'folder'; fromSpaceId: string; itemId: string }
  | { kind: 'normal'; tabId: number; fromSpaceId: string }
  | null = null;

function sendMessage(msg: BarkMessage): Promise<unknown> {
  return chrome.runtime.sendMessage(msg);
}

function getSectionFromHash(): HubSection {
  const h = window.location.hash.replace('#', '').toLowerCase();
  if (h === 'archive' || h === 'downloads' || h === 'spaces' || h === 'settings') {
    return h;
  }
  return 'spaces';
}

function SpacesBoardView({
  state,
  liveTabs,
  editingId,
  setEditingId,
}: {
  state: BarkState;
  liveTabs: LiveTabInfo[];
  editingId: string | number | null;
  setEditingId: (id: string | number | null) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const pinnedTabIds = getPinnedTabIds(state);

  const getLiveTab = (tabId?: number | null) =>
    tabId ? liveTabs.find((t) => t.id === tabId) : undefined;

  const renderHubPinnedLevel = (
    space: Space,
    parentId: string | null,
    depth: number,
    onlyOpenTabs = false
  ): preact.ComponentChild[] => {
    const items = space.pinnedItems.filter((i) => i.parentId === parentId);
    const out: preact.ComponentChild[] = [];

    for (const item of items) {
      if (item.type === 'folder') {
        if (onlyOpenTabs) {
          out.push(...renderHubPinnedLevel(space, item.id, depth, true));
          continue;
        }

        out.push(
          <div key={item.id} class="bark-folder-node">
            <div
              class={`bark-hub-item-row folder${item.collapsed ? ' is-collapsed' : ' is-open'}`}
              style={{ paddingLeft: `${9 + depth * 16}px` }}
              draggable={editingId !== item.id}
              onClick={() => {
                if (editingId === item.id) return;
                sendMessage({ type: 'TOGGLE_FOLDER', spaceId: space.id, folderId: item.id });
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                showContextMenu(e.clientX, e.clientY, [
                  {
                    label: 'New Nested Folder',
                    onClick: async () => {
                      if (item.collapsed) {
                        await sendMessage({
                          type: 'TOGGLE_FOLDER',
                          spaceId: space.id,
                          folderId: item.id,
                        });
                      }
                      const res = (await sendMessage({
                        type: 'CREATE_FOLDER',
                        spaceId: space.id,
                        title: 'New Folder',
                        parentId: item.id,
                      })) as { folder?: FolderNode } | undefined;
                      if (res?.folder?.id) {
                        setEditingId(res.folder.id);
                      }
                    },
                  },
                  {
                    label: `Turn “${item.title}” into Space`,
                    onClick: () => {
                      sendMessage({
                        type: 'TURN_FOLDER_INTO_SPACE',
                        spaceId: space.id,
                        folderId: item.id,
                      });
                    },
                  },
                  { type: 'divider' },
                  {
                    label: 'Rename',
                    onClick: () => setEditingId(item.id),
                  },
                  {
                    label: 'Delete',
                    danger: true,
                    onClick: () => {
                      sendMessage({
                        type: 'DELETE_FOLDER',
                        spaceId: space.id,
                        folderId: item.id,
                      });
                    },
                  },
                ]);
              }}
              onDragStart={() => {
                hubDragItem = { kind: 'folder', fromSpaceId: space.id, itemId: item.id };
                requestAnimationFrame(() => setIsDragging(true));
              }}
              onDragEnd={() => {
                hubDragItem = null;
                setIsDragging(false);
              }}
            >
              <span class="bark-row-icon-wrap">
                <FolderAnimatedIcon />
              </span>
              <div class="bark-row-text-col">
                {editingId === item.id ? (
                  <InlineRenameInput
                    initialValue={item.title}
                    onSave={(newName) => {
                      setEditingId(null);
                      sendMessage({
                        type: 'RENAME_FOLDER',
                        spaceId: space.id,
                        folderId: item.id,
                        title: newName,
                      });
                    }}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <span class="bark-hub-item-title">{item.title}</span>
                )}
              </div>
            </div>
            <div class={`bark-folder-children${item.collapsed ? ' collapsed' : ' expanded'}`}>
              <div class="bark-folder-children-inner">
                {renderHubPinnedLevel(space, item.id, depth + 1, item.collapsed)}
              </div>
            </div>
          </div>
        );
      } else {
        const live = getLiveTab(item.tabId);
        if (onlyOpenTabs && !live) continue;

        const isOpen = !!live;
        const isActive = !!live?.active;
        const currentUrl = live?.url || item.currentUrl;
        const isAwayFromPin = isOpen && !!currentUrl && !isSamePinnedUrl(item.url, currentUrl);
        const displayTitle = item.customTitle || live?.title || item.title;

        out.push(
          <div
            key={item.id}
            class={`bark-hub-item-row${isActive ? ' active' : ''}${!isOpen ? ' reduced' : ''}${
              isAwayFromPin ? ' away-from-pin' : ''
            }`}
            style={{ paddingLeft: `${9 + depth * 16}px` }}
            draggable={editingId !== item.id}
            onClick={(e) => {
              if (editingId === item.id || e.detail > 1) return;
              sendMessage({ type: 'SWITCH_SPACE', spaceId: space.id });
              sendMessage({ type: 'ACTIVATE_PINNED_TAB', spaceId: space.id, itemId: item.id });
            }}
            onDblClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setEditingId(item.id);
            }}
            onMouseDown={(e) => {
              if (e.button === 1) e.preventDefault();
            }}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                e.stopPropagation();
                if (isOpen) {
                  sendMessage({ type: 'REDUCE_PINNED_TAB', spaceId: space.id, itemId: item.id });
                } else {
                  animateRowExit(e.currentTarget as HTMLElement, () => {
                    sendMessage({ type: 'REMOVE_PINNED_TAB', spaceId: space.id, itemId: item.id });
                  });
                }
              }
            }}
            onDragStart={() => {
              hubDragItem = { kind: 'pinned', fromSpaceId: space.id, itemId: item.id };
              requestAnimationFrame(() => setIsDragging(true));
            }}
            onDragEnd={() => {
              hubDragItem = null;
              setIsDragging(false);
            }}
          >
            <span class="bark-row-icon-wrap">
              <Favicon
                pageUrl={currentUrl || item.url}
                explicitFavIcon={item.favIconUrl}
                className="bark-hub-item-icon"
              />
              {isAwayFromPin && (
                <button
                  type="button"
                  class="bark-icon-reset-btn"
                  title={`Back to Pinned URL (${item.url})`}
                  onClick={(e) => {
                    e.stopPropagation();
                    sendMessage({
                      type: 'RESET_PINNED_TAB_URL',
                      spaceId: space.id,
                      itemId: item.id,
                    });
                  }}
                >
                  <BackResetIcon />
                </button>
              )}
            </span>

            <div class="bark-row-text-col">
              {editingId === item.id ? (
                <InlineRenameInput
                  initialValue={displayTitle}
                  onSave={(newName) => {
                    setEditingId(null);
                    sendMessage({
                      type: 'UPDATE_PINNED_TAB',
                      spaceId: space.id,
                      itemId: item.id,
                      updates: { customTitle: newName },
                    });
                  }}
                  onCancel={() => setEditingId(null)}
                />
              ) : (
                <>
                  <div class="bark-row-title-row">
                    {isAwayFromPin && (
                      <span class="bark-pin-slash">
                        <PinSlashIcon />
                      </span>
                    )}
                    <span class="bark-hub-item-title">{displayTitle}</span>
                  </div>
                  {isAwayFromPin && (
                    <span class="bark-row-subtitle-back">Back to Pinned URL</span>
                  )}
                </>
              )}
            </div>

            <div class="bark-row-actions">
              <button
                type="button"
                class="bark-row-action-btn"
                title={
                  isOpen
                    ? 'Reduce pinned tab (close tab, keep pin)'
                    : 'Remove pin'
                }
                onClick={(e) => {
                  e.stopPropagation();
                  if (isOpen) {
                    sendMessage({
                      type: 'REDUCE_PINNED_TAB',
                      spaceId: space.id,
                      itemId: item.id,
                    });
                  } else {
                    const rowEl = (e.currentTarget as HTMLElement).closest(
                      '.bark-hub-item-row'
                    ) as HTMLElement | null;
                    animateRowExit(rowEl, () => {
                      sendMessage({
                        type: 'REMOVE_PINNED_TAB',
                        spaceId: space.id,
                        itemId: item.id,
                      });
                    });
                  }
                }}
              >
                {isOpen ? <MinusIcon /> : <CloseIcon />}
              </button>
            </div>
          </div>
        );
      }
    }

    return out;
  };

  return (
    <div class={`bark-spaces-board${isDragging ? ' is-dragging' : ''}`}>
      {state.spaces.map((space) => {
        const palette = SPACE_COLORS[space.color] || SPACE_COLORS.purple;
        const normalInSpace = liveTabs.filter(
          (t) =>
            !pinnedTabIds.has(t.id) &&
            !t.url.includes('hub.html') &&
            (state.tabSpaceMap[t.id] || state.activeSpaceId) === space.id
        );
        const hasPinned = space.pinnedItems.length > 0;
        const hasNormal = normalInSpace.length > 0;

        return (
          <div
            key={space.id}
            class={`bark-space-card${space.id === state.activeSpaceId ? ' active-space' : ''}`}
            style={
              {
                '--card-bg': palette.cardBg,
                '--card-border': palette.border,
              } as Record<string, string>
            }
            onDragOver={(e) => {
              if (!hubDragItem) return;
              e.preventDefault();
              e.currentTarget.classList.add('drag-over-card');
            }}
            onDragLeave={(e) => {
              e.currentTarget.classList.remove('drag-over-card');
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.currentTarget.classList.remove('drag-over-card');
              if (!hubDragItem) return;
              const drag = hubDragItem;
              hubDragItem = null;
              setIsDragging(false);

              if (drag.fromSpaceId === space.id) return;
              if (drag.kind === 'normal') {
                sendMessage({
                  type: 'MOVE_NORMAL_TAB_TO_SPACE',
                  tabId: drag.tabId,
                  toSpaceId: space.id,
                });
              } else {
                sendMessage({
                  type: 'MOVE_PINNED_ITEM_TO_SPACE',
                  fromSpaceId: drag.fromSpaceId,
                  itemId: drag.itemId,
                  toSpaceId: space.id,
                });
              }
            }}
          >
            <div class="bark-space-card-header">
              <div
                class="bark-space-card-title"
                title="Click to focus this Space"
                onClick={() =>
                  sendMessage({ type: 'SWITCH_SPACE', spaceId: space.id, focusFirstTab: true })
                }
              >
                <span class="bark-space-card-emoji">{space.emoji}</span>
                <span class="bark-space-card-name">{space.name}</span>
              </div>
              <button
                type="button"
                class="bark-space-card-edit"
                title="Edit Space"
                onClick={(e) => {
                  e.stopPropagation();
                  openSpaceModal({
                    existingSpace: space,
                    canDelete: true,
                    onSave(res) {
                      sendMessage({
                        type: 'UPDATE_SPACE',
                        spaceId: space.id,
                        name: res.name,
                        emoji: res.emoji,
                        color: res.color,
                      });
                    },
                    onDelete(spaceId) {
                      sendMessage({ type: 'DELETE_SPACE', spaceId });
                    },
                  });
                }}
              >
                <PencilIcon />
              </button>
            </div>

            <div class="bark-space-card-body">
              <div class="bark-space-card-list">
                {renderHubPinnedLevel(space, null, 0, false)}
              </div>

              <div
                class={`bark-space-card-divider${!hasPinned ? ' no-separator' : ''}${
                  !hasPinned && !hasNormal ? ' hidden-row' : ''
                }`}
              >
                <div class="bark-space-card-divider-line" />
                {hasNormal && (
                  <button
                    type="button"
                    class="bark-hub-clear-btn"
                    onClick={() =>
                      sendMessage({ type: 'CLEAR_NORMAL_TABS', spaceId: space.id })
                    }
                  >
                    <ClearArrowDownIcon />
                    <span>Clear</span>
                  </button>
                )}
              </div>

              {normalInSpace.length > 0 && (
                <div class="bark-space-card-list">
                  {normalInSpace.map((tab) => {
                    const displayTitle =
                      state.tabCustomTitles[tab.id] || tab.title || tab.url;

                    return (
                      <div
                        key={tab.id}
                        class={`bark-hub-item-row${tab.active ? ' active' : ''}`}
                        draggable={editingId !== tab.id}
                        onClick={(e) => {
                          if (editingId === tab.id || e.detail > 1) return;
                          sendMessage({ type: 'SWITCH_SPACE', spaceId: space.id });
                          sendMessage({ type: 'ACTIVATE_NORMAL_TAB', tabId: tab.id });
                        }}
                        onDblClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setEditingId(tab.id);
                        }}
                        onMouseDown={(e) => {
                          if (e.button === 1) e.preventDefault();
                        }}
                        onAuxClick={(e) => {
                          if (e.button === 1) {
                            e.preventDefault();
                            e.stopPropagation();
                            animateRowExit(e.currentTarget as HTMLElement, () => {
                              sendMessage({ type: 'CLOSE_NORMAL_TAB', tabId: tab.id });
                            });
                          }
                        }}
                        onDragStart={() => {
                          hubDragItem = {
                            kind: 'normal',
                            tabId: tab.id,
                            fromSpaceId: space.id,
                          };
                          requestAnimationFrame(() => setIsDragging(true));
                        }}
                        onDragEnd={() => {
                          hubDragItem = null;
                          setIsDragging(false);
                        }}
                      >
                        <span class="bark-row-icon-wrap">
                          <Favicon
                            pageUrl={tab.url}
                            explicitFavIcon={tab.favIconUrl}
                            className="bark-hub-item-icon"
                          />
                        </span>
                        <div class="bark-row-text-col">
                          {editingId === tab.id ? (
                            <InlineRenameInput
                              initialValue={displayTitle}
                              onSave={(newName) => {
                                setEditingId(null);
                                sendMessage({
                                  type: 'RENAME_NORMAL_TAB',
                                  tabId: tab.id,
                                  title: newName,
                                });
                              }}
                              onCancel={() => setEditingId(null)}
                            />
                          ) : (
                            <span class="bark-hub-item-title">{displayTitle}</span>
                          )}
                        </div>
                        <div class="bark-row-actions">
                          <button
                            type="button"
                            class="bark-row-action-btn"
                            title="Close & Archive Tab"
                            onClick={(e) => {
                              e.stopPropagation();
                              const rowEl = (e.currentTarget as HTMLElement).closest(
                                '.bark-hub-item-row'
                              ) as HTMLElement | null;
                              animateRowExit(rowEl, () => {
                                sendMessage({ type: 'CLOSE_NORMAL_TAB', tabId: tab.id });
                              });
                            }}
                          >
                            <CloseIcon />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        );
      })}

      <div class="bark-add-space-circle-wrap">
        <button
          type="button"
          class="bark-add-space-circle"
          title="New Space"
          onClick={() => {
            openSpaceModal({
              onSave(res) {
                sendMessage({
                  type: 'CREATE_SPACE',
                  name: res.name,
                  emoji: res.emoji,
                  color: res.color,
                });
              },
            });
          }}
        >
          +
        </button>
      </div>
    </div>
  );
}

function ArchiveView({ state }: { state: BarkState }) {
  const [filterQuery, setFilterQuery] = useState('');
  const [filterSpace, setFilterSpace] = useState('all');

  const retentionText =
    state.settings.archiveRetentionHours === 0
      ? 'forever'
      : `for ${state.settings.archiveRetentionHours} hours before being automatically cleaned`;

  const durations = [
    { hours: 1, label: 'Keep for 1 hour' },
    { hours: 6, label: 'Keep for 6 hours' },
    { hours: 12, label: 'Keep for 12 hours (Default)' },
    { hours: 24, label: 'Keep for 24 hours' },
    { hours: 72, label: 'Keep for 3 days' },
    { hours: 168, label: 'Keep for 7 days' },
    { hours: 720, label: 'Keep for 30 days' },
    { hours: 0, label: 'Keep forever' },
  ];

  const q = filterQuery.trim().toLowerCase();
  const filtered = state.archivedTabs.filter((item) => {
    if (filterSpace !== 'all' && item.spaceId !== filterSpace) return false;
    if (!q) return true;
    return (
      item.title.toLowerCase().includes(q) ||
      item.url.toLowerCase().includes(q) ||
      item.spaceName.toLowerCase().includes(q)
    );
  });

  return (
    <div class="bark-page-container">
      <div class="bark-page-header">
        <div>
          <h1 class="bark-page-title">Archived Tabs</h1>
          <p class="bark-page-subtitle">
            Closed, cleared, and unpinned tabs live here {retentionText}.
          </p>
        </div>
        <button
          type="button"
          class="bark-btn bark-btn-danger"
          disabled={state.archivedTabs.length === 0}
          onClick={() => sendMessage({ type: 'CLEAR_ARCHIVE' })}
        >
          Clear Archive
        </button>
      </div>

      <div class="bark-toolbar">
        <input
          type="text"
          class="bark-search-input"
          placeholder="Search archived tabs by title or URL..."
          value={filterQuery}
          onInput={(e) => setFilterQuery((e.target as HTMLInputElement).value)}
        />
        <select
          class="bark-select"
          value={filterSpace}
          onChange={(e) => setFilterSpace((e.target as HTMLSelectElement).value)}
        >
          <option value="all">All Spaces</option>
          {state.spaces.map((sp) => (
            <option key={sp.id} value={sp.id}>
              {sp.emoji} {sp.name}
            </option>
          ))}
        </select>
        <select
          class="bark-select"
          title="Archive retention duration"
          value={String(state.settings.archiveRetentionHours)}
          onChange={(e) => {
            const val = Number((e.target as HTMLSelectElement).value);
            sendMessage({
              type: 'UPDATE_SETTINGS',
              settings: { archiveRetentionHours: Number.isNaN(val) ? 12 : val },
            });
          }}
        >
          {durations.map((d) => (
            <option key={d.hours} value={String(d.hours)}>
              {d.label}
            </option>
          ))}
        </select>
      </div>

      <div class="bark-card-list">
        {filtered.length === 0 ? (
          <div class="bark-empty-state">No archived tabs match your filter.</div>
        ) : (
          filtered.map((item) => (
            <div key={item.id} class="bark-list-card">
              <Favicon
                pageUrl={item.url}
                explicitFavIcon={item.favIconUrl}
                className="bark-hub-item-icon"
              />
              <div
                class="bark-list-card-main"
                title="Click to restore tab"
                onClick={() =>
                  sendMessage({ type: 'RESTORE_ARCHIVED_TAB', archiveId: item.id })
                }
              >
                <div class="bark-list-card-title">{item.title}</div>
                <div class="bark-list-card-meta">{item.url}</div>
              </div>
              <span class="bark-badge">
                {item.spaceEmoji} {item.spaceName}
              </span>
              <span class="bark-badge">{formatRelativeTime(item.archivedAt)}</span>
              <button
                type="button"
                class="bark-btn bark-btn-ghost"
                onClick={() =>
                  sendMessage({ type: 'RESTORE_ARCHIVED_TAB', archiveId: item.id })
                }
              >
                Restore
              </button>
              <button
                type="button"
                class="bark-icon-btn"
                title="Remove from archive"
                onClick={() =>
                  sendMessage({ type: 'DELETE_ARCHIVED_TAB', archiveId: item.id })
                }
              >
                ×
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function DownloadsView() {
  const [downloads, setDownloads] = useState<chrome.downloads.DownloadItem[]>([]);
  const [filterQuery, setFilterQuery] = useState('');

  useEffect(() => {
    chrome.downloads
      .search({ limit: 100, orderBy: ['-startTime'] })
      .then((res) => setDownloads(res))
      .catch(() => setDownloads([]));
  }, []);

  const q = filterQuery.trim().toLowerCase();
  const filtered = downloads.filter((d) => {
    if (!q) return true;
    const filename = d.filename.split(/[/\\]/).pop() || d.filename;
    return filename.toLowerCase().includes(q) || (d.url && d.url.toLowerCase().includes(q));
  });

  return (
    <div class="bark-page-container">
      <div class="bark-page-header">
        <div>
          <h1 class="bark-page-title">Downloads</h1>
          <p class="bark-page-subtitle">Recent files downloaded in Chrome.</p>
        </div>
      </div>

      <div class="bark-toolbar">
        <input
          type="text"
          class="bark-search-input"
          placeholder="Filter downloads by filename or URL..."
          value={filterQuery}
          onInput={(e) => setFilterQuery((e.target as HTMLInputElement).value)}
        />
      </div>

      <div class="bark-card-list">
        {filtered.length === 0 ? (
          <div class="bark-empty-state">No downloads found.</div>
        ) : (
          filtered.map((d) => {
            const filename = d.filename.split(/[/\\]/).pop() || d.url || 'Download';
            const sizeKb = d.fileSize > 0 ? `${(d.fileSize / 1024).toFixed(1)} KB` : '';

            return (
              <div key={d.id} class="bark-list-card">
                <div
                  class="bark-list-card-main"
                  onClick={() => {
                    if (d.state === 'complete') {
                      chrome.downloads.open(d.id);
                    }
                  }}
                >
                  <div class="bark-list-card-title">{filename}</div>
                  <div class="bark-list-card-meta">
                    {d.url}
                    {sizeKb ? ` • ${sizeKb}` : ''}
                  </div>
                </div>
                <span class="bark-badge">
                  {d.state === 'complete' ? 'Completed' : d.state}
                </span>
                <button
                  type="button"
                  class="bark-btn bark-btn-ghost"
                  onClick={() => chrome.downloads.show(d.id)}
                >
                  Show in Folder
                </button>
                <button
                  type="button"
                  class="bark-icon-btn"
                  title="Remove from list"
                  onClick={async () => {
                    await chrome.downloads.erase({ id: d.id });
                    setDownloads((prev) => prev.filter((x) => x.id !== d.id));
                  }}
                >
                  ×
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function SettingsView({ state }: { state: BarkState }) {
  const [recordingTarget, setRecordingTarget] = useState<ShortcutTarget | null>(null);
  const [shortcutError, setShortcutError] = useState<string | null>(null);
  const [prefix, setPrefix] = useState('');
  const [name, setName] = useState('');
  const [urlTemplate, setUrlTemplate] = useState('');

  useEffect(() => {
    if (!recordingTarget) return;
    const onKey = (e: KeyboardEvent) => {
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(e.key)) return;
      e.preventDefault();
      e.stopPropagation();
      setRecordingTarget(null);
      if (e.key === 'Escape') return;

      const recorded: ShortcutConfig = {
        key: e.key.toLowerCase(),
        altKey: e.altKey,
        ctrlKey: e.ctrlKey,
        metaKey: e.metaKey,
        shiftKey: e.shiftKey,
      };
      const other =
        recordingTarget === 'palette'
          ? state.settings.copyUrlShortcut
          : state.settings.customShortcut;
      if (shortcutsEqual(recorded, other)) {
        setShortcutError(
          `${formatShortcutLabel(recorded, ' + ')} is already used by ${
            recordingTarget === 'palette' ? 'Copy Current URL' : 'the Command Palette'
          }.`
        );
        return;
      }
      setShortcutError(null);
      sendMessage({
        type: 'UPDATE_SETTINGS',
        settings:
          recordingTarget === 'palette'
            ? { customShortcut: recorded }
            : { copyUrlShortcut: recorded },
      });
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [recordingTarget, state.settings.customShortcut, state.settings.copyUrlShortcut]);

  const durationOptions = [
    { hours: 1, label: 'After 1 hour' },
    { hours: 6, label: 'After 6 hours' },
    { hours: 12, label: 'After 12 hours (Default)' },
    { hours: 24, label: 'After 24 hours' },
    { hours: 72, label: 'After 3 days' },
    { hours: 168, label: 'After 7 days' },
    { hours: 720, label: 'After 30 days' },
    { hours: 0, label: 'Never' },
  ];

  const currentUnpinnedHours = state.settings.autoArchiveUnpinnedHours ?? 12;
  const currentArchiveHours = state.settings.archiveRetentionHours ?? 12;
  const scLabel = formatShortcutLabel(state.settings.customShortcut, ' + ');
  const copyUrlShortcut = state.settings.copyUrlShortcut;
  const copyLabel = copyUrlShortcut ? formatShortcutLabel(copyUrlShortcut, ' + ') : 'Disabled';
  const defaultCopyShortcut = getDefaultSettings().copyUrlShortcut;
  const isCopyDefault = shortcutsEqual(copyUrlShortcut, defaultCopyShortcut);

  return (
    <div class="bark-page-container">
      <div class="bark-page-header">
        <div>
          <h1 class="bark-page-title">Settings</h1>
          <p class="bark-page-subtitle">
            Configure automatic tab cleanup, archive expiration, keyboard shortcuts, and custom
            Command Palette search prefixes.
          </p>
        </div>
      </div>

      <div class="bark-settings-panel">
        <h3>Automatic Tab Cleanup & Archive Expiration</h3>
        <p class="bark-page-subtitle" style={{ margin: 0 }}>
          Automatically archive inactive unpinned tabs in your Spaces and clean up old archived
          tabs.
        </p>
        <div
          class="bark-form-row"
          style={{ alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}
        >
          <div>
            <div style={{ fontSize: '13.5px', fontWeight: 500, color: '#f3f4f6' }}>
              Auto-archive unpinned workspace tabs
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
              Inactive tabs in a Space that aren't pinned are moved to Archived Tabs
            </div>
          </div>
          <select
            class="bark-select"
            style={{ minWidth: '210px' }}
            value={String(currentUnpinnedHours)}
            onChange={(e) => {
              const val = Number((e.target as HTMLSelectElement).value);
              sendMessage({
                type: 'UPDATE_SETTINGS',
                settings: { autoArchiveUnpinnedHours: Number.isNaN(val) ? 12 : val },
              });
            }}
          >
            {durationOptions.map((d) => (
              <option key={d.hours} value={String(d.hours)}>
                {d.label}
              </option>
            ))}
          </select>
        </div>

        <div
          class="bark-form-row"
          style={{ alignItems: 'center', justifyContent: 'space-between', marginTop: '4px' }}
        >
          <div>
            <div style={{ fontSize: '13.5px', fontWeight: 500, color: '#f3f4f6' }}>
              Archived tabs expiration
            </div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.5)' }}>
              Permanently delete tabs from the Archive after this duration
            </div>
          </div>
          <select
            class="bark-select"
            style={{ minWidth: '210px' }}
            value={String(currentArchiveHours)}
            onChange={(e) => {
              const val = Number((e.target as HTMLSelectElement).value);
              sendMessage({
                type: 'UPDATE_SETTINGS',
                settings: { archiveRetentionHours: Number.isNaN(val) ? 12 : val },
              });
            }}
          >
            {durationOptions.map((d) => (
              <option key={d.hours} value={String(d.hours)}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div class="bark-settings-panel">
        <h3>Command Palette Shortcut</h3>
        <p class="bark-page-subtitle" style={{ margin: 0 }}>
          Press this shortcut on any web page or inside Bark to toggle the Command Palette.
        </p>
        <div class="bark-form-row" style={{ alignItems: 'center' }}>
          <button
            type="button"
            id="record-palette-shortcut-btn"
            class="bark-btn bark-btn-ghost"
            style={{ minWidth: '160px', fontWeight: 600 }}
            onClick={() => {
              setShortcutError(null);
              setRecordingTarget('palette');
            }}
          >
            {recordingTarget === 'palette'
              ? 'Press any key combo (e.g. Alt+T)...'
              : `Current: ${scLabel} (Click to record)`}
          </button>
          <button
            type="button"
            class="bark-btn bark-btn-ghost"
            onClick={() => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' })}
          >
            Open Chrome Extension Shortcuts
          </button>
        </div>
      </div>

      <div class="bark-settings-panel">
        <h3>Copy Current URL Shortcut</h3>
        <p class="bark-page-subtitle" style={{ margin: 0 }}>
          Press this shortcut on any web page to copy a clean, shareable link (tracking parameters
          like <code>utm_source</code> or <code>fbclid</code> are removed). Ignored while typing in
          text fields.
        </p>
        <div class="bark-form-row" style={{ alignItems: 'center' }}>
          <button
            type="button"
            id="record-copy-url-shortcut-btn"
            class="bark-btn bark-btn-ghost"
            style={{ minWidth: '160px', fontWeight: 600 }}
            onClick={() => {
              setShortcutError(null);
              setRecordingTarget('copyUrl');
            }}
          >
            {recordingTarget === 'copyUrl'
              ? 'Press any key combo (e.g. Alt+C)...'
              : `Current: ${copyLabel} (Click to record)`}
          </button>
          <button
            type="button"
            id="reset-copy-url-shortcut-btn"
            class="bark-btn bark-btn-ghost"
            disabled={isCopyDefault}
            onClick={() => {
              setShortcutError(null);
              sendMessage({
                type: 'UPDATE_SETTINGS',
                settings: { copyUrlShortcut: defaultCopyShortcut },
              });
            }}
          >
            Reset to default
          </button>
          <button
            type="button"
            id="disable-copy-url-shortcut-btn"
            class="bark-btn bark-btn-ghost"
            disabled={!copyUrlShortcut}
            onClick={() => {
              setShortcutError(null);
              sendMessage({ type: 'UPDATE_SETTINGS', settings: { copyUrlShortcut: null } });
            }}
          >
            Disable
          </button>
        </div>
        {shortcutError && (
          <p class="bark-shortcut-error" role="alert">
            {shortcutError}
          </p>
        )}
      </div>

      <div class="bark-settings-panel">
        <h3>Add Custom Search Engine Prefix</h3>
        <p class="bark-page-subtitle" style={{ margin: 0 }}>
          Use <code>%s</code> in the URL where the search query should be inserted. Example:
          typing <code>yt lo-fi</code> in the Command Palette searches YouTube.
        </p>
        <div class="bark-form-row">
          <input
            type="text"
            class="bark-text-input"
            style={{ maxWidth: '130px' }}
            placeholder="Prefix (e.g. yt)"
            value={prefix}
            onInput={(e) => setPrefix((e.target as HTMLInputElement).value)}
          />
          <input
            type="text"
            class="bark-text-input"
            style={{ maxWidth: '220px' }}
            placeholder="Name (e.g. YouTube)"
            value={name}
            onInput={(e) => setName((e.target as HTMLInputElement).value)}
          />
          <input
            type="text"
            class="bark-text-input"
            placeholder="URL with %s (e.g. https://www.youtube.com/results?search_query=%s)"
            value={urlTemplate}
            onInput={(e) => setUrlTemplate((e.target as HTMLInputElement).value)}
          />
          <button
            type="button"
            class="bark-btn bark-btn-primary"
            onClick={() => {
              const cleanPrefix = prefix.trim().toLowerCase();
              const cleanName = name.trim() || cleanPrefix.toUpperCase();
              let cleanUrl = urlTemplate.trim();
              if (!cleanPrefix || !cleanUrl) return;
              if (!cleanUrl.includes('%s')) {
                cleanUrl = `${cleanUrl}%s`;
              }
              sendMessage({
                type: 'SAVE_SEARCH_SHORTCUT',
                shortcut: {
                  id: uid('sc'),
                  prefix: cleanPrefix,
                  name: cleanName,
                  urlTemplate: cleanUrl,
                },
              });
              setPrefix('');
              setName('');
              setUrlTemplate('');
            }}
          >
            Add Prefix
          </button>
        </div>
      </div>

      <div class="bark-card-list">
        {state.searchShortcuts.map((item) => (
          <div key={item.id} class="bark-list-card">
            <Favicon
              pageUrl={item.urlTemplate.replace('%s', '')}
              className="bark-hub-item-icon"
            />
            <span class="bark-badge" style={{ fontWeight: 700, color: '#c4b5fd' }}>
              {item.prefix}
            </span>
            <div class="bark-list-card-main">
              <div class="bark-list-card-title">{item.name}</div>
              <div class="bark-list-card-meta">{item.urlTemplate}</div>
            </div>
            <button
              type="button"
              class="bark-icon-btn"
              title="Delete search shortcut"
              onClick={() =>
                sendMessage({ type: 'DELETE_SEARCH_SHORTCUT', shortcutId: item.id })
              }
            >
              ×
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function HubMainView() {
  const [state, setState] = useState<BarkState | null>(null);
  const [liveTabs, setLiveTabs] = useState<LiveTabInfo[]>([]);
  const [activeSection, setActiveSection] = useState<HubSection>(getSectionFromHash);
  const [editingId, setEditingId] = useState<string | number | null>(null);

  useEffect(() => {
    const syncNavButtons = (sec: HubSection) => {
      document.querySelectorAll<HTMLButtonElement>('.bark-rail-btn').forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.section === sec);
      });
    };

    syncNavButtons(activeSection);

    const railBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('.bark-rail-btn'));
    const onRailClick = (e: Event) => {
      const btn = e.currentTarget as HTMLButtonElement;
      const sec = btn.dataset.section as HubSection | undefined;
      if (sec) {
        window.location.hash = sec;
        setActiveSection(sec);
        syncNavButtons(sec);
      }
    };
    railBtns.forEach((b) => b.addEventListener('click', onRailClick));

    const onHashChange = () => {
      const sec = getSectionFromHash();
      setActiveSection(sec);
      syncNavButtons(sec);
    };
    window.addEventListener('hashchange', onHashChange);

    sendMessage({ type: 'GET_STATE' }).then((res: unknown) => {
      const data = res as { state?: BarkState; liveTabs?: LiveTabInfo[] } | undefined;
      if (data?.state) {
        setState(data.state);
        setLiveTabs(data.liveTabs || []);
      }
    });

    const onMessage = (msg: { type?: string; state?: BarkState; liveTabs?: LiveTabInfo[] }) => {
      if (msg?.type === 'STATE_UPDATED' && msg.state) {
        setState(msg.state);
        setLiveTabs(msg.liveTabs || []);
      }
    };
    chrome.runtime.onMessage.addListener(onMessage);

    return () => {
      railBtns.forEach((b) => b.removeEventListener('click', onRailClick));
      window.removeEventListener('hashchange', onHashChange);
      chrome.runtime.onMessage.removeListener(onMessage);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!state) return;
      const activeTag = document.activeElement?.tagName.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
        return;
      }
      if (matchesShortcut(e, state.settings.customShortcut)) {
        e.preventDefault();
        sendMessage({ type: 'TOGGLE_COMMAND_PALETTE' });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [state]);

  if (!state) return null;

  if (activeSection === 'spaces') {
    return (
      <SpacesBoardView
        state={state}
        liveTabs={liveTabs}
        editingId={editingId}
        setEditingId={setEditingId}
      />
    );
  }
  if (activeSection === 'archive') {
    return <ArchiveView state={state} />;
  }
  if (activeSection === 'downloads') {
    return <DownloadsView />;
  }
  return <SettingsView state={state} />;
}

const mainContentEl = document.getElementById('hub-main-content')!;
render(<HubMainView />, mainContentEl);
