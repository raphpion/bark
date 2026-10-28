import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { SPACE_COLORS } from '../shared/constants';
import { ContextMenuItem, showContextMenu } from '../shared/contextMenu';
import { openPromptModal, openSpaceModal } from '../shared/spaceModal';
import {
  BarkMessage,
  BarkState,
  FavoriteItem,
  FolderNode,
  LiveTabInfo,
  PinnedItem,
  PinnedTabNode,
  Space,
} from '../shared/types';
import {
  animateRowExit,
  AudioMutedIcon,
  AudioOnIcon,
  BackResetIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
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
  formatShortcutLabel,
  getFolderPinnedTabs,
  getPinnedTabIds,
  isSamePinnedUrl,
  matchesShortcut,
} from '../shared/utils';

type DragPayload =
  | { kind: 'favorite'; id: string }
  | { kind: 'pinned'; spaceId: string; id: string; itemType: 'tab' | 'folder' }
  | { kind: 'normal'; tabId: number };

let activeDrag: DragPayload | null = null;

function sendMessage(msg: BarkMessage): Promise<unknown> {
  return chrome.runtime.sendMessage(msg);
}

function triggerCommandPaletteFromSidebar(toggle = false) {
  (document.activeElement as HTMLElement | null)?.blur?.();
  sendMessage({ type: toggle ? 'TOGGLE_COMMAND_PALETTE' : 'OPEN_COMMAND_PALETTE' });
}

function openCreateSpaceModal(moveItem?: {
  kind: 'pinned' | 'normal' | 'folder';
  id: string | number;
  fromSpaceId?: string;
}) {
  openSpaceModal({
    onSave(res) {
      sendMessage({
        type: 'CREATE_SPACE',
        name: res.name,
        emoji: res.emoji,
        color: res.color,
        moveItem,
      });
    },
  });
}

function openEditSpaceModal(space: Space) {
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
}

function SidebarApp() {
  const [state, setState] = useState<BarkState | null>(null);
  const [liveTabs, setLiveTabs] = useState<LiveTabInfo[]>([]);
  const [editingId, setEditingId] = useState<string | number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
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
    return () => chrome.runtime.onMessage.removeListener(onMessage);
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
        triggerCommandPaletteFromSidebar(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [state]);

  if (!state) return null;

  const activeSpace =
    state.spaces.find((sp) => sp.id === state.activeSpaceId) || state.spaces[0];
  const palette = activeSpace
    ? SPACE_COLORS[activeSpace.color] || SPACE_COLORS.purple
    : undefined;
  const topTint = palette
    ? `color-mix(in srgb, ${palette.hex} 36%, transparent)`
    : 'transparent';

  const getLiveTab = (tabId?: number | null) =>
    tabId ? liveTabs.find((t) => t.id === tabId) : undefined;

  const createFolderAndEdit = async (spaceId: string, parentId: string | null = null) => {
    if (parentId) {
      const sp = state.spaces.find((x) => x.id === spaceId);
      const parentFolder = sp?.pinnedItems.find(
        (i): i is FolderNode => i.id === parentId && i.type === 'folder'
      );
      if (parentFolder && parentFolder.collapsed) {
        await sendMessage({ type: 'TOGGLE_FOLDER', spaceId, folderId: parentId });
      }
    }
    const res = (await sendMessage({
      type: 'CREATE_FOLDER',
      spaceId,
      title: 'New Folder',
      parentId,
    })) as { folder?: FolderNode } | undefined;
    if (res?.folder?.id) {
      setEditingId(res.folder.id);
    }
  };

  const handleDropOnFavorite = (targetIndex: number) => {
    if (!activeDrag) return;
    const drag = activeDrag;
    activeDrag = null;
    setIsDragging(false);

    if (drag.kind === 'favorite') {
      const ids = state.favorites.map((f) => f.id).filter((id) => id !== drag.id);
      ids.splice(Math.min(targetIndex, ids.length), 0, drag.id);
      sendMessage({ type: 'REORDER_FAVORITES', orderedIds: ids });
    } else if (drag.kind === 'pinned' && drag.itemType === 'tab') {
      sendMessage({
        type: 'PINNED_TO_FAVORITE',
        spaceId: drag.spaceId,
        itemId: drag.id,
        targetIndex,
      });
    } else if (drag.kind === 'normal') {
      sendMessage({
        type: 'NORMAL_TO_FAVORITE',
        tabId: drag.tabId,
        targetIndex,
      });
    }
  };

  const handleDropIntoPinnedTree = (
    spaceId: string,
    targetParentId: string | null,
    targetIndex: number
  ) => {
    if (!activeDrag) return;
    const drag = activeDrag;
    activeDrag = null;
    setIsDragging(false);

    if (drag.kind === 'pinned') {
      if (drag.id === targetParentId) return;
      sendMessage({
        type: 'MOVE_PINNED_NODE',
        spaceId,
        itemId: drag.id,
        targetParentId,
        targetIndex,
      });
    } else if (drag.kind === 'normal') {
      sendMessage({
        type: 'PIN_NORMAL_TAB',
        tabId: drag.tabId,
        spaceId,
        parentId: targetParentId,
        targetIndex,
      });
    } else if (drag.kind === 'favorite') {
      sendMessage({
        type: 'FAVORITE_TO_PINNED',
        favoriteId: drag.id,
        spaceId,
        parentId: targetParentId,
        targetIndex,
      });
    }
  };

  const handleDropIntoNormalTabs = (spaceId: string, targetChromeIndex?: number) => {
    if (!activeDrag) return;
    const drag = activeDrag;
    activeDrag = null;
    setIsDragging(false);

    if (drag.kind === 'pinned' && drag.itemType === 'tab') {
      sendMessage({
        type: 'UNPIN_TO_NORMAL_TAB',
        spaceId: drag.spaceId,
        itemId: drag.id,
      });
    } else if (drag.kind === 'favorite') {
      sendMessage({
        type: 'FAVORITE_TO_NORMAL',
        favoriteId: drag.id,
        spaceId,
      });
    } else if (drag.kind === 'normal' && typeof targetChromeIndex === 'number') {
      chrome.tabs.move(drag.tabId, { index: targetChromeIndex }).catch(() => {});
    }
  };

  const openFavoriteContextMenu = (x: number, y: number, fav: FavoriteItem) => {
    const live = getLiveTab(fav.tabId);
    const isOpen = !!live;
    const isMuted = !!live?.muted;

    const moveSubmenu: ContextMenuItem[] = [
      ...state.spaces.map((sp) => ({
        label: sp.name,
        onClick: () => {
          sendMessage({
            type: 'FAVORITE_TO_PINNED',
            favoriteId: fav.id,
            spaceId: sp.id,
            parentId: null,
          });
        },
      })),
      ...(state.spaces.length > 0 ? [{ type: 'divider' as const }] : []),
      {
        label: 'New Space...',
        onClick: () => {
          openSpaceModal({
            onSave: async (res) => {
              const created = (await sendMessage({
                type: 'CREATE_SPACE',
                name: res.name,
                emoji: res.emoji,
                color: res.color,
              })) as { space?: Space } | undefined;
              if (created?.space?.id) {
                sendMessage({
                  type: 'FAVORITE_TO_PINNED',
                  favoriteId: fav.id,
                  spaceId: created.space.id,
                  parentId: null,
                });
              }
            },
          });
        },
      },
    ];

    showContextMenu(x, y, [
      {
        label: 'Copy Link',
        onClick: () => {
          navigator.clipboard.writeText(live?.url || fav.currentUrl || fav.url);
        },
      },
      { type: 'divider' },
      {
        label: 'Rename',
        onClick: () => {
          openPromptModal({
            title: 'Rename Favorite',
            label: 'Favorite Title',
            initialValue: fav.title,
            onConfirm: (newName) => {
              sendMessage({
                type: 'UPDATE_FAVORITE',
                favoriteId: fav.id,
                updates: { title: newName },
              });
            },
          });
        },
      },
      {
        label: isMuted ? 'Unmute' : 'Mute',
        disabled: !isOpen,
        onClick: () => {
          if (live) sendMessage({ type: 'TOGGLE_MUTE_TAB', tabId: live.id });
        },
      },
      {
        label: 'Edit Pinned Page',
        children: [
          {
            label: 'Edit URL...',
            onClick: () => {
              openPromptModal({
                title: 'Edit Favorite URL',
                label: 'Favorite Tab Default URL',
                initialValue: fav.url,
                onConfirm: (newUrl) => {
                  sendMessage({
                    type: 'UPDATE_FAVORITE',
                    favoriteId: fav.id,
                    updates: { url: newUrl },
                  });
                },
              });
            },
          },
          {
            label: 'Replace with Current URL',
            disabled: !isOpen && !fav.currentUrl,
            onClick: () => {
              sendMessage({
                type: 'REPLACE_FAVORITE_WITH_CURRENT_URL',
                favoriteId: fav.id,
              });
            },
          },
        ],
      },
      { type: 'divider' },
      {
        label: 'Duplicate',
        onClick: () => {
          sendMessage({ type: 'DUPLICATE_FAVORITE', favoriteId: fav.id });
        },
      },
      {
        label: 'Move to',
        children: moveSubmenu,
      },
      { type: 'divider' },
      {
        label: 'Remove Pin',
        danger: true,
        onClick: () => {
          sendMessage({ type: 'REMOVE_FAVORITE', favoriteId: fav.id });
        },
      },
    ]);
  };

  const openPinnedTabContextMenu = (
    x: number,
    y: number,
    item: PinnedTabNode,
    space: Space,
    live?: LiveTabInfo
  ) => {
    const isOpen = !!live;
    const isMuted = !!live?.muted;

    showContextMenu(x, y, [
      {
        label: 'Copy Link',
        onClick: () => {
          navigator.clipboard.writeText(live?.url || item.currentUrl || item.url);
        },
      },
      { type: 'divider' },
      {
        label: 'Rename',
        onClick: () => setEditingId(item.id),
      },
      {
        label: isMuted ? 'Unmute' : 'Mute',
        disabled: !isOpen,
        onClick: () => {
          if (live) sendMessage({ type: 'TOGGLE_MUTE_TAB', tabId: live.id });
        },
      },
      {
        label: 'Edit Pinned Page',
        children: [
          {
            label: 'Edit URL...',
            onClick: () => {
              openPromptModal({
                title: 'Edit Pinned URL',
                label: 'Pinned Tab Default URL',
                initialValue: item.url,
                onConfirm: (newUrl) => {
                  sendMessage({
                    type: 'UPDATE_PINNED_TAB',
                    spaceId: space.id,
                    itemId: item.id,
                    updates: { url: newUrl },
                  });
                },
              });
            },
          },
          {
            label: 'Replace with Current URL',
            disabled: !isOpen && !item.currentUrl,
            onClick: () => {
              sendMessage({
                type: 'REPLACE_PINNED_WITH_CURRENT_URL',
                spaceId: space.id,
                itemId: item.id,
              });
            },
          },
        ],
      },
      { type: 'divider' },
      {
        label: 'Duplicate',
        onClick: () => {
          sendMessage({
            type: 'DUPLICATE_PINNED_TAB',
            spaceId: space.id,
            itemId: item.id,
          });
        },
      },
      {
        label: 'Move to',
        children: [
          ...state.spaces.map((sp) => ({
            label: sp.name,
            checked: sp.id === space.id,
            onClick: () => {
              sendMessage({
                type: 'MOVE_PINNED_ITEM_TO_SPACE',
                fromSpaceId: space.id,
                itemId: item.id,
                toSpaceId: sp.id,
              });
            },
          })),
          { type: 'divider' as const },
          {
            label: 'New Space...',
            onClick: () =>
              openCreateSpaceModal({ kind: 'pinned', id: item.id, fromSpaceId: space.id }),
          },
        ],
      },
      { type: 'divider' },
      {
        label: 'Remove Pin',
        onClick: () => {
          sendMessage({
            type: 'REMOVE_PINNED_TAB',
            spaceId: space.id,
            itemId: item.id,
          });
        },
      },
    ]);
  };

  const openFolderContextMenu = (x: number, y: number, folder: FolderNode, space: Space) => {
    showContextMenu(x, y, [
      {
        label: 'New Nested Folder',
        onClick: () => createFolderAndEdit(space.id, folder.id),
      },
      {
        label: `Turn “${folder.title}” into Space`,
        onClick: () => {
          sendMessage({
            type: 'TURN_FOLDER_INTO_SPACE',
            spaceId: space.id,
            folderId: folder.id,
          });
        },
      },
      {
        label: 'Copy All Links',
        onClick: () => {
          const tabs = getFolderPinnedTabs(space.pinnedItems, folder.id);
          const urls = tabs.map((t) => t.currentUrl || t.url).join('\n');
          if (urls) navigator.clipboard.writeText(urls);
        },
      },
      { type: 'divider' },
      {
        label: 'Rename',
        onClick: () => setEditingId(folder.id),
      },
      { type: 'divider' },
      {
        label: 'Duplicate',
        onClick: () => {
          sendMessage({
            type: 'DUPLICATE_FOLDER',
            spaceId: space.id,
            folderId: folder.id,
          });
        },
      },
      {
        label: 'Move to',
        children: [
          ...state.spaces.map((sp) => ({
            label: sp.name,
            checked: sp.id === space.id,
            onClick: () => {
              sendMessage({
                type: 'MOVE_PINNED_ITEM_TO_SPACE',
                fromSpaceId: space.id,
                itemId: folder.id,
                toSpaceId: sp.id,
              });
            },
          })),
          { type: 'divider' as const },
          {
            label: 'New Space...',
            onClick: () =>
              openCreateSpaceModal({ kind: 'folder', id: folder.id, fromSpaceId: space.id }),
          },
        ],
      },
      { type: 'divider' },
      {
        label: 'Delete',
        danger: true,
        onClick: () => {
          sendMessage({
            type: 'DELETE_FOLDER',
            spaceId: space.id,
            folderId: folder.id,
          });
        },
      },
    ]);
  };

  const openNormalTabContextMenu = (
    x: number,
    y: number,
    tab: LiveTabInfo,
    space?: Space
  ) => {
    showContextMenu(x, y, [
      {
        label: 'Copy Link',
        onClick: () => navigator.clipboard.writeText(tab.url),
      },
      { type: 'divider' },
      {
        label: 'Rename',
        onClick: () => setEditingId(tab.id),
      },
      {
        label: tab.muted ? 'Unmute' : 'Mute',
        onClick: () => sendMessage({ type: 'TOGGLE_MUTE_TAB', tabId: tab.id }),
      },
      {
        label: 'Pin to Space',
        onClick: () => {
          sendMessage({
            type: 'PIN_NORMAL_TAB',
            tabId: tab.id,
            spaceId: space?.id || '',
          });
        },
      },
      {
        label: 'Add to Favorites',
        onClick: () => {
          sendMessage({
            type: 'NORMAL_TO_FAVORITE',
            tabId: tab.id,
          });
        },
      },
      { type: 'divider' },
      {
        label: 'Duplicate',
        onClick: () => sendMessage({ type: 'DUPLICATE_NORMAL_TAB', tabId: tab.id }),
      },
      {
        label: 'Move to',
        children: [
          ...state.spaces.map((sp) => ({
            label: sp.name,
            checked: sp.id === space?.id,
            onClick: () => {
              sendMessage({
                type: 'MOVE_NORMAL_TAB_TO_SPACE',
                tabId: tab.id,
                toSpaceId: sp.id,
              });
            },
          })),
          ...(state.spaces.length > 0 ? [{ type: 'divider' as const }] : []),
          {
            label: 'New Space...',
            onClick: () => openCreateSpaceModal({ kind: 'normal', id: tab.id }),
          },
        ],
      },
      { type: 'divider' },
      {
        label: 'Close Tab',
        danger: true,
        onClick: () => sendMessage({ type: 'CLOSE_NORMAL_TAB', tabId: tab.id }),
      },
    ]);
  };

  const renderPinnedNodes = (
    space: Space,
    parentId: string | null,
    depth: number,
    onlyOpenTabs = false
  ): preact.ComponentChild[] => {
    const children = space.pinnedItems.filter((item) => item.parentId === parentId);
    const out: preact.ComponentChild[] = [];

    children.forEach((item, indexInLevel) => {
      const setupRowDragProps = (elItem: PinnedItem) => ({
        draggable: editingId !== elItem.id,
        onDragStart: (e: DragEvent) => {
          activeDrag = {
            kind: 'pinned',
            spaceId: space.id,
            id: elItem.id,
            itemType: elItem.type,
          };
          e.dataTransfer?.setData('text/plain', elItem.id);
          requestAnimationFrame(() => setIsDragging(true));
        },
        onDragEnd: (e: DragEvent) => {
          activeDrag = null;
          setIsDragging(false);
          (e.currentTarget as HTMLElement).classList.remove(
            'drop-before',
            'drop-after',
            'drop-inside'
          );
        },
        onDragOver: (e: DragEvent) => {
          if (!activeDrag) return;
          e.preventDefault();
          e.stopPropagation();
          const row = e.currentTarget as HTMLElement;
          const rect = row.getBoundingClientRect();
          const relY = e.clientY - rect.top;
          row.classList.remove('drop-before', 'drop-after', 'drop-inside');
          if (
            elItem.type === 'folder' &&
            relY > rect.height * 0.25 &&
            relY < rect.height * 0.75
          ) {
            row.classList.add('drop-inside');
          } else if (relY < rect.height / 2) {
            row.classList.add('drop-before');
          } else {
            row.classList.add('drop-after');
          }
        },
        onDragLeave: (e: DragEvent) => {
          (e.currentTarget as HTMLElement).classList.remove(
            'drop-before',
            'drop-after',
            'drop-inside'
          );
        },
        onDrop: (e: DragEvent) => {
          if (!activeDrag) return;
          e.preventDefault();
          e.stopPropagation();
          const row = e.currentTarget as HTMLElement;
          const isInside = row.classList.contains('drop-inside');
          const isBefore = row.classList.contains('drop-before');
          row.classList.remove('drop-before', 'drop-after', 'drop-inside');
          if (elItem.type === 'folder' && isInside) {
            const folderChildrenCount = space.pinnedItems.filter(
              (i) => i.parentId === elItem.id
            ).length;
            handleDropIntoPinnedTree(space.id, elItem.id, folderChildrenCount);
          } else {
            const targetIdx = isBefore ? indexInLevel : indexInLevel + 1;
            handleDropIntoPinnedTree(space.id, elItem.parentId, targetIdx);
          }
        },
      });

      if (item.type === 'folder') {
        if (onlyOpenTabs) {
          out.push(...renderPinnedNodes(space, item.id, depth, true));
          return;
        }

        out.push(
          <div key={item.id} class="bark-folder-node">
            <div
              class={`bark-row folder-row${item.collapsed ? ' is-collapsed' : ' is-open'}`}
              style={{ paddingLeft: `${9 + depth * 16}px` }}
              onClick={() => {
                if (editingId === item.id) return;
                sendMessage({ type: 'TOGGLE_FOLDER', spaceId: space.id, folderId: item.id });
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openFolderContextMenu(e.clientX, e.clientY, item, space);
              }}
              {...setupRowDragProps(item)}
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
                  <span class="bark-row-title">{item.title}</span>
                )}
              </div>
            </div>
            <div class={`bark-folder-children${item.collapsed ? ' collapsed' : ' expanded'}`}>
              <div class="bark-folder-children-inner">
                {renderPinnedNodes(space, item.id, depth + 1, item.collapsed)}
              </div>
            </div>
          </div>
        );
      } else {
        const live = getLiveTab(item.tabId);
        if (onlyOpenTabs && !live) return;

        const isOpen = !!live;
        const isActive = !!live?.active;
        const currentUrl = live?.url || item.currentUrl;
        const isAwayFromPin = isOpen && !!currentUrl && !isSamePinnedUrl(item.url, currentUrl);
        const displayTitle = item.customTitle || live?.title || item.title;

        out.push(
          <div
            key={item.id}
            class={`bark-row${isActive ? ' active' : ''}${!isOpen ? ' reduced' : ''}${
              isAwayFromPin ? ' away-from-pin' : ''
            }`}
            style={{ paddingLeft: `${9 + depth * 16}px` }}
            onClick={(e) => {
              if (editingId === item.id || e.detail > 1) return;
              if (isOpen && isActive) return;
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
            onContextMenu={(e) => {
              e.preventDefault();
              e.stopPropagation();
              openPinnedTabContextMenu(e.clientX, e.clientY, item, space, live);
            }}
            {...setupRowDragProps(item)}
          >
            <span class="bark-row-icon-wrap">
              <Favicon pageUrl={currentUrl || item.url} explicitFavIcon={item.favIconUrl} />
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
                    <span class="bark-row-title">{displayTitle}</span>
                  </div>
                  {isAwayFromPin && (
                    <span class="bark-row-subtitle-back">Back to Pinned URL</span>
                  )}
                </>
              )}
            </div>

            <div class="bark-row-actions">
              {live && (live.audible || live.muted) && (
                <button
                  type="button"
                  class="bark-audio-btn"
                  title={live.muted ? 'Unmute tab' : 'Mute tab'}
                  onClick={(e) => {
                    e.stopPropagation();
                    sendMessage({ type: 'TOGGLE_MUTE_TAB', tabId: live.id });
                  }}
                >
                  {live.muted ? <AudioMutedIcon /> : <AudioOnIcon />}
                </button>
              )}
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
                      '.bark-row'
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
    });

    return out;
  };

  const pinnedTabIds = getPinnedTabIds(state);
  const spaceNormalTabs = liveTabs.filter((t) => {
    if (pinnedTabIds.has(t.id)) return false;
    if (!activeSpace) return true;
    const assignedSpace = state.tabSpaceMap[t.id] || state.activeSpaceId;
    return !assignedSpace || assignedSpace === activeSpace.id;
  });

  const hasPinned = !!activeSpace && activeSpace.pinnedItems.length > 0;
  const hasClear = spaceNormalTabs.length > 0;

  const cycleSpace = (delta: number) => {
    if (state.spaces.length <= 1) return;
    const idx = state.spaces.findIndex((sp) => sp.id === state.activeSpaceId);
    const nextIdx = (idx + delta + state.spaces.length) % state.spaces.length;
    sendMessage({ type: 'SWITCH_SPACE', spaceId: state.spaces[nextIdx].id });
  };

  const pinToSpaceRoot = (e: DragEvent) => {
    if (!activeDrag) return;
    e.preventDefault();
    e.stopPropagation();
    const rootChildrenCount = activeSpace
      ? activeSpace.pinnedItems.filter((i) => i.parentId === null).length
      : 0;
    handleDropIntoPinnedTree(activeSpace?.id || '', null, rootChildrenCount);
  };

  return (
    <div
      id="bark-sidebar-app"
      class={`bark-sidebar${isDragging ? ' is-dragging' : ''}`}
      style={{ '--sidebar-top-color': topTint } as Record<string, string>}
      onContextMenu={(e) => {
        e.preventDefault();
        const target = e.target as HTMLElement | null;
        const inPinnedArea = !!target?.closest(
          '#pinned-tree, #space-header, #tabs-divider-row'
        );

        const menuItems: ContextMenuItem[] = [
          {
            label: 'New Tab',
            onClick: () => triggerCommandPaletteFromSidebar(false),
          },
        ];
        if (inPinnedArea) {
          menuItems.push({
            label: 'New Folder',
            onClick: () => createFolderAndEdit(activeSpace?.id || '', null),
          });
        }
        menuItems.push({ type: 'divider' });
        if (activeSpace) {
          menuItems.push({
            label: `Edit "${activeSpace.name}"...`,
            onClick: () => openEditSpaceModal(activeSpace),
          });
        }
        menuItems.push({
          label: 'New Space...',
          onClick: () => openCreateSpaceModal(),
        });
        showContextMenu(e.clientX, e.clientY, menuItems);
      }}
    >
      {/* 1. Top Global Favorites Grid */}
      <section
        id="favorites-section"
        class={`bark-favorites-grid${state.favorites.length === 0 ? ' empty' : ''}${
          isDragging ? ' drag-active' : ''
        }`}
        aria-label="Pinned Favorites"
        onDragOver={(e) => {
          if (!activeDrag) return;
          e.preventDefault();
          e.currentTarget.classList.add('drag-over-container');
        }}
        onDragLeave={(e) => {
          e.currentTarget.classList.remove('drag-over-container');
        }}
        onDrop={(e) => {
          if (!activeDrag) return;
          e.preventDefault();
          e.currentTarget.classList.remove('drag-over-container');
          handleDropOnFavorite(state.favorites.length);
        }}
      >
        {state.favorites.map((fav, idx) => {
          const live = getLiveTab(fav.tabId);
          const isOpen = !!live;
          const isActive = !!live?.active;

          return (
            <div
              key={fav.id}
              class={`bark-fav-tile${isActive ? ' active' : isOpen ? ' open-indicator' : ''}`}
              title={`${fav.title}\n${fav.currentUrl || fav.url}`}
              draggable
              onClick={() => sendMessage({ type: 'ACTIVATE_FAVORITE', favoriteId: fav.id })}
              onMouseDown={(e) => {
                if (e.button === 1) e.preventDefault();
              }}
              onAuxClick={(e) => {
                if (e.button === 1) {
                  e.preventDefault();
                  e.stopPropagation();
                  if (isOpen) {
                    sendMessage({ type: 'REDUCE_FAVORITE', favoriteId: fav.id });
                  } else {
                    animateRowExit(e.currentTarget as HTMLElement, () => {
                      sendMessage({ type: 'REMOVE_FAVORITE', favoriteId: fav.id });
                    });
                  }
                }
              }}
              onContextMenu={(e) => {
                e.preventDefault();
                e.stopPropagation();
                openFavoriteContextMenu(e.clientX, e.clientY, fav);
              }}
              onDragStart={(e) => {
                activeDrag = { kind: 'favorite', id: fav.id };
                e.dataTransfer?.setData('text/plain', fav.id);
                requestAnimationFrame(() => setIsDragging(true));
              }}
              onDragEnd={(e) => {
                activeDrag = null;
                setIsDragging(false);
                e.currentTarget.classList.remove('drag-over');
              }}
              onDragOver={(e) => {
                if (!activeDrag) return;
                e.preventDefault();
                e.currentTarget.classList.add('drag-over');
              }}
              onDragLeave={(e) => {
                e.currentTarget.classList.remove('drag-over');
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                e.currentTarget.classList.remove('drag-over');
                handleDropOnFavorite(idx);
              }}
            >
              <Favicon
                pageUrl={fav.currentUrl || fav.url}
                explicitFavIcon={fav.favIconUrl}
                className="bark-fav-icon"
              />
              <button
                type="button"
                class="bark-fav-action"
                title={
                  isOpen
                    ? 'Reduce pinned tab (close tab, keep favorite)'
                    : 'Remove favorite'
                }
                onClick={(e) => {
                  e.stopPropagation();
                  if (isOpen) {
                    sendMessage({ type: 'REDUCE_FAVORITE', favoriteId: fav.id });
                  } else {
                    const tileEl = (e.currentTarget as HTMLElement).closest(
                      '.bark-fav-tile'
                    ) as HTMLElement | null;
                    animateRowExit(tileEl, () => {
                      sendMessage({ type: 'REMOVE_FAVORITE', favoriteId: fav.id });
                    });
                  }
                }}
              >
                {isOpen ? '−' : '×'}
              </button>
            </div>
          );
        })}
      </section>

      {/* 2. Current Space Header */}
      {activeSpace && (
        <header
          id="space-header"
          class="bark-space-header"
          onDragOver={(e) => {
            if (!activeDrag) return;
            e.preventDefault();
            e.currentTarget.classList.add('drag-over-pin');
          }}
          onDragLeave={(e) => {
            e.currentTarget.classList.remove('drag-over-pin');
          }}
          onDrop={(e) => {
            e.currentTarget.classList.remove('drag-over-pin');
            pinToSpaceRoot(e);
          }}
        >
          <button
            type="button"
            class="bark-space-title-btn"
            title="Click to switch or manage Space"
            onClick={(e) => {
              e.stopPropagation();
              const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
              showContextMenu(rect.left, rect.bottom + 4, [
                { type: 'header', label: 'Spaces' },
                ...state.spaces.map((sp) => ({
                  label: `${sp.emoji}  ${sp.name}`,
                  checked: sp.id === activeSpace.id,
                  onClick: () => sendMessage({ type: 'SWITCH_SPACE', spaceId: sp.id }),
                })),
                { type: 'divider' },
                {
                  label: 'Edit Current Space...',
                  onClick: () => openEditSpaceModal(activeSpace),
                },
                {
                  label: 'New Space...',
                  onClick: () => openCreateSpaceModal(),
                },
              ]);
            }}
          >
            <span class="bark-space-emoji">{activeSpace.emoji}</span>
            <span class="bark-space-name">{activeSpace.name}</span>
          </button>

          <div class="bark-space-header-actions">
            {state.spaces.length > 1 && (
              <>
                <button
                  type="button"
                  class="bark-header-mini-btn"
                  title="Previous Space"
                  onClick={() => cycleSpace(-1)}
                >
                  <ChevronLeftIcon />
                </button>
                <button
                  type="button"
                  class="bark-header-mini-btn"
                  title="Next Space"
                  onClick={() => cycleSpace(1)}
                >
                  <ChevronRightIcon />
                </button>
              </>
            )}
            <button
              type="button"
              class="bark-header-mini-btn"
              title="Edit Space"
              onClick={() => openEditSpaceModal(activeSpace)}
            >
              <PencilIcon />
            </button>
          </div>
        </header>
      )}

      {/* 3. Scrollable Workspace Content */}
      <main id="sidebar-scroll" class="bark-sidebar-scroll">
        <section
          id="pinned-tree"
          class={`bark-pinned-tree${!hasPinned ? ' empty' : ''}`}
          aria-label="Workspace Pinned Tabs"
          onDragOver={(e) => {
            if (!activeDrag) return;
            e.preventDefault();
            if (!hasPinned) e.currentTarget.classList.add('drag-over-empty');
          }}
          onDragLeave={(e) => {
            e.currentTarget.classList.remove('drag-over-empty');
          }}
          onDrop={(e) => {
            e.currentTarget.classList.remove('drag-over-empty');
            pinToSpaceRoot(e);
          }}
        >
          {activeSpace && renderPinnedNodes(activeSpace, null, 0, false)}
        </section>

        {/* Divider & Clear Row */}
        <div
          id="tabs-divider-row"
          class={`bark-divider-row${!hasPinned ? ' no-separator' : ''}${
            !hasPinned && !hasClear ? ' hidden-row' : ''
          }`}
          onDragOver={(e) => {
            if (!activeDrag) return;
            e.preventDefault();
          }}
          onDrop={pinToSpaceRoot}
        >
          <div class="bark-divider-line" />
          {hasClear && (
            <button
              id="clear-tabs-btn"
              type="button"
              class="bark-clear-btn"
              onClick={() =>
                sendMessage({ type: 'CLEAR_NORMAL_TABS', spaceId: state.activeSpaceId })
              }
            >
              <ClearArrowDownIcon />
              <span>Clear</span>
            </button>
          )}
        </div>

        {/* + New Tab trigger */}
        <button
          id="sidebar-new-tab-btn"
          type="button"
          class="bark-new-tab-row"
          onClick={() => triggerCommandPaletteFromSidebar(false)}
        >
          <span class="bark-new-tab-plus">+</span>
          <span class="bark-new-tab-label">New Tab</span>
          <span id="sidebar-shortcut-hint" class="bark-new-tab-shortcut">
            {formatShortcutLabel(state.settings?.customShortcut)}
          </span>
        </button>

        {/* Normal Unpinned Tabs */}
        <section
          id="normal-tabs-list"
          class="bark-normal-tabs"
          aria-label="Open Tabs"
          onDragOver={(e) => {
            if (!activeDrag) return;
            e.preventDefault();
            if (spaceNormalTabs.length === 0) {
              e.currentTarget.classList.add('drag-over-empty');
            }
          }}
          onDragLeave={(e) => {
            e.currentTarget.classList.remove('drag-over-empty');
          }}
          onDrop={(e) => {
            if (!activeDrag) return;
            e.preventDefault();
            e.currentTarget.classList.remove('drag-over-empty');
            handleDropIntoNormalTabs(activeSpace?.id || '');
          }}
        >
          {spaceNormalTabs.map((tab) => {
            const displayTitle = state.tabCustomTitles[tab.id] || tab.title || tab.url;

            return (
              <div
                key={tab.id}
                class={`bark-row${tab.active ? ' active' : ''}`}
                draggable={editingId !== tab.id}
                onClick={(e) => {
                  if (editingId === tab.id || e.detail > 1) return;
                  if (tab.active) return;
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
                onContextMenu={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  openNormalTabContextMenu(e.clientX, e.clientY, tab, activeSpace);
                }}
                onDragStart={(e) => {
                  activeDrag = { kind: 'normal', tabId: tab.id };
                  e.dataTransfer?.setData('text/plain', String(tab.id));
                  requestAnimationFrame(() => setIsDragging(true));
                }}
                onDragEnd={(e) => {
                  activeDrag = null;
                  setIsDragging(false);
                  e.currentTarget.classList.remove('drop-before', 'drop-after');
                }}
                onDragOver={(e) => {
                  if (!activeDrag) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const row = e.currentTarget as HTMLElement;
                  const rect = row.getBoundingClientRect();
                  row.classList.remove('drop-before', 'drop-after');
                  if (e.clientY - rect.top < rect.height / 2) {
                    row.classList.add('drop-before');
                  } else {
                    row.classList.add('drop-after');
                  }
                }}
                onDragLeave={(e) => {
                  e.currentTarget.classList.remove('drop-before', 'drop-after');
                }}
                onDrop={(e) => {
                  if (!activeDrag) return;
                  e.preventDefault();
                  e.stopPropagation();
                  const row = e.currentTarget as HTMLElement;
                  const isBefore = row.classList.contains('drop-before');
                  row.classList.remove('drop-before', 'drop-after');
                  handleDropIntoNormalTabs(
                    activeSpace?.id || '',
                    isBefore ? tab.index : tab.index + 1
                  );
                }}
              >
                <span class="bark-row-icon-wrap">
                  <Favicon pageUrl={tab.url} explicitFavIcon={tab.favIconUrl} />
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
                    <span class="bark-row-title">{displayTitle}</span>
                  )}
                </div>

                <div class="bark-row-actions">
                  {(tab.audible || tab.muted) && (
                    <button
                      type="button"
                      class="bark-audio-btn"
                      title={tab.muted ? 'Unmute tab' : 'Mute tab'}
                      onClick={(e) => {
                        e.stopPropagation();
                        sendMessage({ type: 'TOGGLE_MUTE_TAB', tabId: tab.id });
                      }}
                    >
                      {tab.muted ? <AudioMutedIcon /> : <AudioOnIcon />}
                    </button>
                  )}
                  <button
                    type="button"
                    class="bark-row-action-btn"
                    title="Close & Archive Tab"
                    onClick={(e) => {
                      e.stopPropagation();
                      const rowEl = (e.currentTarget as HTMLElement).closest(
                        '.bark-row'
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
        </section>
      </main>

      {/* 4. Bottom Bar */}
      <footer class="bark-bottom-bar">
        <button
          id="open-archive-btn"
          type="button"
          class="bark-bottom-icon-btn"
          title="Archive, Downloads & Spaces"
          onClick={() => sendMessage({ type: 'OPEN_HUB', section: 'spaces' })}
        >
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.9"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <rect width="20" height="5" x="2" y="3" rx="1" />
            <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
            <path d="M10 12h4" />
          </svg>
        </button>

        <div id="space-switcher-dots" class="bark-space-dots" role="tablist" aria-label="Spaces">
          {state.spaces.map((sp) => (
            <button
              key={sp.id}
              type="button"
              class={`bark-space-dot-btn${sp.id === activeSpace?.id ? ' active' : ''}`}
              title={sp.name}
              onClick={() => sendMessage({ type: 'SWITCH_SPACE', spaceId: sp.id })}
            >
              {sp.emoji}
            </button>
          ))}
        </div>

        <button
          id="plus-menu-btn"
          type="button"
          class="bark-bottom-icon-btn"
          title="New Space, Folder, or Tab"
          onClick={(e) => {
            e.stopPropagation();
            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
            showContextMenu(rect.right - 190, rect.top - 150, [
              {
                label: 'New Space',
                onClick: () => openCreateSpaceModal(),
              },
              {
                label: 'New Folder',
                onClick: () => createFolderAndEdit(activeSpace?.id || '', null),
              },
              { type: 'divider' },
              {
                label: 'New Tab',
                onClick: () => triggerCommandPaletteFromSidebar(false),
              },
            ]);
          }}
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.1"
            stroke-linecap="round"
            stroke-linejoin="round"
          >
            <path d="M12 5v14" />
            <path d="M5 12h14" />
          </svg>
        </button>
      </footer>
    </div>
  );
}

render(<SidebarApp />, document.body);
