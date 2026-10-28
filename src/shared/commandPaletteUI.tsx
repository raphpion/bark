import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { SPACE_COLORS } from './constants';
import { BarkState, CommandPaletteResult, LiveTabInfo } from './types';
import { Favicon, GlobeFallbackIcon } from './uiHelpers';
import { buildCommandPaletteResults } from './utils';

export const COMMAND_PALETTE_CSS = `
:host, .bark-cp-root {
  all: initial;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Inter, Helvetica, Arial, sans-serif;
  color: #f3f4f6;
  box-sizing: border-box;
}

.bark-cp-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(8, 8, 12, 0.55);
  backdrop-filter: blur(3px);
  z-index: 2147483647;
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: min(16vh, 130px);
  animation: barkCpFadeIn 0.12s ease-out;
}

.bark-cp-backdrop.bark-cp-compact {
  padding: 14px 8px;
  align-items: flex-start;
}

@keyframes barkCpFadeIn {
  from { opacity: 0; transform: scale(0.985); }
  to { opacity: 1; transform: scale(1); }
}

.bark-cp-dialog {
  width: min(640px, calc(100vw - 24px));
  background: #232327;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.65), 0 0 0 1px rgba(0, 0, 0, 0.5);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.bark-cp-input-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.bark-cp-arrow-badge {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  background: #ffffff;
  color: #18181b;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.bark-cp-arrow-badge svg {
  width: 15px;
  height: 15px;
  stroke-width: 2.5;
}

.bark-cp-input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  color: #ffffff;
  font-size: 17px;
  font-weight: 500;
  line-height: 1.3;
  font-family: inherit;
}

.bark-cp-input::placeholder {
  color: rgba(255, 255, 255, 0.38);
  font-weight: 400;
}

.bark-cp-results {
  max-height: min(420px, 62vh);
  overflow-y: auto;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.bark-cp-results::-webkit-scrollbar {
  width: 6px;
}

.bark-cp-results::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.18);
  border-radius: 3px;
}

.bark-cp-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 10px;
  border-radius: 9px;
  cursor: pointer;
  user-select: none;
  transition: background 0.08s ease;
  color: #e5e7eb;
  font-size: 14px;
}

.bark-cp-item:hover {
  background: rgba(255, 255, 255, 0.07);
}

.bark-cp-item.selected {
  background: #2b5b84;
  color: #ffffff;
}

.bark-cp-item.selected.space-highlight {
  background: var(--space-highlight-bg, #28683b);
}

.bark-cp-item-icon {
  width: 24px;
  height: 24px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: rgba(255, 255, 255, 0.68);
}

.bark-cp-item.selected .bark-cp-item-icon {
  color: #ffffff;
}

.bark-cp-item-favicon {
  width: 18px;
  height: 18px;
  border-radius: 4px;
  object-fit: contain;
}

.bark-cp-item-main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.bark-cp-item-title {
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bark-cp-space-pill {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 3px 9px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.16);
  font-size: 13.5px;
  font-weight: 500;
  color: #ffffff;
  white-space: nowrap;
}

.bark-cp-item-subtitle {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-left: auto;
  padding-left: 8px;
  max-width: 45%;
}

.bark-cp-item.selected .bark-cp-item-subtitle {
  color: rgba(255, 255, 255, 0.8);
}

.bark-cp-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  background: rgba(0, 0, 0, 0.18);
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.42);
}

.bark-cp-kbd {
  display: inline-block;
  padding: 1px 5px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.72);
  font-size: 10.5px;
  margin: 0 2px;
}
`;

function ArrowRightIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      stroke-linejoin="round"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

export interface CommandPaletteController {
  open: (state: BarkState, liveTabs: LiveTabInfo[], initialQuery?: string) => void;
  close: () => void;
  isOpen: () => boolean;
  updateData: (state: BarkState, liveTabs: LiveTabInfo[]) => void;
  focusInput: () => void;
}

export function createCommandPaletteUI(
  mountRoot: HTMLElement | ShadowRoot,
  options: {
    compact?: boolean;
    onExecute: (item: CommandPaletteResult, rawQuery: string) => void;
    onClose?: () => void;
  }
): CommandPaletteController {
  let externalOpen: (state: BarkState, liveTabs: LiveTabInfo[], initialQuery?: string) => void =
    () => {};
  let externalClose: () => void = () => {};
  let externalUpdate: (state: BarkState, liveTabs: LiveTabInfo[]) => void = () => {};
  let externalFocus: () => void = () => {};
  let isVisible = false;

  function CommandPaletteView() {
    const [visible, setVisible] = useState(false);
    const [query, setQuery] = useState('');
    const [appState, setAppState] = useState<BarkState | null>(null);
    const [tabs, setTabs] = useState<LiveTabInfo[]>([]);
    const [results, setResults] = useState<CommandPaletteResult[]>([]);
    const [selectedIndex, setSelectedIndex] = useState(0);

    const inputRef = useRef<HTMLInputElement>(null);
    const resultsListRef = useRef<HTMLDivElement>(null);
    const suggestionSeqRef = useRef(0);

    isVisible = visible;

    const focusInput = () => {
      window.focus();
      const el = inputRef.current;
      if (!el) return;
      el.focus({ preventScroll: true });
      const len = el.value.length;
      try {
        el.setSelectionRange(len, len);
      } catch {}
    };

    externalOpen = (nextState, nextTabs, initialQ = '') => {
      setAppState(nextState);
      setTabs(nextTabs);
      setQuery(initialQ);
      setSelectedIndex(0);
      setVisible(true);
      requestAnimationFrame(() => {
        focusInput();
        if (initialQ) {
          inputRef.current?.select();
        }
      });
      setTimeout(focusInput, 50);
    };

    externalClose = () => {
      if (!isVisible) return;
      setVisible(false);
      options.onClose?.();
    };

    externalUpdate = (nextState, nextTabs) => {
      setAppState(nextState);
      setTabs(nextTabs);
    };

    externalFocus = focusInput;

    useEffect(() => {
      const onWinFocus = () => {
        if (isVisible) {
          inputRef.current?.focus({ preventScroll: true });
        }
      };
      window.addEventListener('focus', onWinFocus);
      return () => window.removeEventListener('focus', onWinFocus);
    }, []);

    useEffect(() => {
      if (!appState) return;
      suggestionSeqRef.current++;
      const seq = suggestionSeqRef.current;

      const baseResults = buildCommandPaletteResults(query, appState, tabs);
      setResults(baseResults);
      setSelectedIndex(0);

      const trimmed = query.trim();
      const shortcutItem = baseResults.find((r) => r.type === 'search-shortcut' && !!r.searchQuery);
      const matchedShortcut = shortcutItem
        ? appState.searchShortcuts.find(
            (s) => s.prefix.toLowerCase() === shortcutItem.searchPrefix?.toLowerCase()
          )
        : undefined;

      const hasOtherMatches = baseResults.some(
        (r) => r.type !== 'default-search' && r.type !== 'search-shortcut'
      );

      if (
        !visible ||
        trimmed.length === 0 ||
        (!matchedShortcut && hasOtherMatches) ||
        typeof chrome === 'undefined' ||
        !chrome.runtime?.sendMessage
      ) {
        return;
      }

      const queryToSuggest = matchedShortcut ? shortcutItem!.searchQuery! : trimmed;
      const timer = setTimeout(() => {
        chrome.runtime
          .sendMessage({
            type: 'FETCH_SEARCH_SUGGESTIONS',
            query: queryToSuggest,
            urlTemplate: matchedShortcut?.urlTemplate,
          })
          .then((res: unknown) => {
            if (!isVisible || seq !== suggestionSeqRef.current) return;
            const data = res as { suggestions?: string[] } | undefined;
            const suggestions = data?.suggestions;
            if (!suggestions || suggestions.length === 0) return;

            if (matchedShortcut) {
              const suggestionItems: CommandPaletteResult[] = suggestions.map((sText, i) => {
                const targetUrl = matchedShortcut.urlTemplate.replace(
                  '%s',
                  encodeURIComponent(sText)
                );
                return {
                  id: `shortcut-suggest-${matchedShortcut.id}-${i}-${sText}`,
                  type: 'search-shortcut',
                  title: `Search ${matchedShortcut.name} for "${sText}"`,
                  subtitle: `${matchedShortcut.prefix} • ${targetUrl}`,
                  url: targetUrl,
                  favIconUrl: shortcutItem?.favIconUrl,
                  searchPrefix: matchedShortcut.prefix,
                  searchQuery: sText,
                };
              });
              const firstIdx = baseResults.findIndex((r) => r.id === shortcutItem!.id);
              const nextResults = [...baseResults];
              nextResults.splice(firstIdx + 1, 0, ...suggestionItems);
              setResults(nextResults);
            } else {
              const suggestionItems: CommandPaletteResult[] = suggestions.map((sText, i) => ({
                id: `search-suggest-${i}-${sText}`,
                type: 'default-search',
                title: sText,
                subtitle: 'Search suggestion',
                searchQuery: sText,
              }));
              setResults([...baseResults, ...suggestionItems]);
            }
          })
          .catch(() => {});
      }, 120);

      return () => clearTimeout(timer);
    }, [query, appState, tabs, visible]);

    useEffect(() => {
      const activeEl = resultsListRef.current?.children[selectedIndex] as HTMLElement | undefined;
      activeEl?.scrollIntoView({ block: 'nearest' });
    }, [selectedIndex]);

    const executeItem = (chosen?: CommandPaletteResult) => {
      const q = query.trim();
      if (chosen) {
        if (chosen.type === 'search-shortcut' && !chosen.searchQuery && chosen.searchPrefix) {
          setQuery(`${chosen.searchPrefix} `);
          focusInput();
          return;
        }
        externalClose();
        options.onExecute(chosen, q);
      } else if (q.length > 0) {
        externalClose();
        options.onExecute(
          {
            id: `default-search-${q}`,
            type: 'default-search',
            title: q,
            searchQuery: q,
          },
          q
        );
      }
    };

    if (!visible) return null;

    return (
      <div
        class="bark-cp-root"
        onKeyDown={(e) => e.stopPropagation()}
        onKeyUp={(e) => e.stopPropagation()}
        onKeyPress={(e) => e.stopPropagation()}
      >
        <div
          class={`bark-cp-backdrop${options.compact ? ' bark-cp-compact' : ''}`}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) externalClose();
          }}
        >
          <div class="bark-cp-dialog">
            <div class="bark-cp-input-row">
              <span class="bark-cp-arrow-badge">
                <ArrowRightIcon />
              </span>
              <input
                ref={inputRef}
                class="bark-cp-input"
                type="text"
                placeholder="Search tabs, spaces, URLs, or prefixes (e.g. yt, gh)..."
                autocomplete="off"
                spellcheck={false}
                value={query}
                onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
                onKeyDown={(e) => {
                  e.stopPropagation();
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    if (results.length > 0) {
                      setSelectedIndex((selectedIndex + 1) % results.length);
                    }
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    if (results.length > 0) {
                      setSelectedIndex((selectedIndex - 1 + results.length) % results.length);
                    }
                  } else if (e.key === 'Enter') {
                    e.preventDefault();
                    executeItem(results[selectedIndex]);
                  } else if (e.key === 'Escape') {
                    e.preventDefault();
                    externalClose();
                  } else if (e.key === 'Tab') {
                    const chosen = results[selectedIndex];
                    if (
                      chosen &&
                      chosen.type === 'search-shortcut' &&
                      chosen.searchPrefix &&
                      !chosen.searchQuery
                    ) {
                      e.preventDefault();
                      setQuery(`${chosen.searchPrefix} `);
                    }
                  }
                }}
              />
            </div>

            <div ref={resultsListRef} class="bark-cp-results">
              {results.map((item, idx) => {
                const isSelected = idx === selectedIndex;
                const isSpace = item.type === 'space' && !!item.badgeColor;
                const spacePalette = isSpace
                  ? SPACE_COLORS[item.badgeColor!] || SPACE_COLORS.purple
                  : undefined;

                return (
                  <div
                    key={item.id}
                    class={`bark-cp-item${isSelected ? ' selected' : ''}${
                      isSpace ? ' space-highlight' : ''
                    }`}
                    style={
                      spacePalette
                        ? ({ '--space-highlight-bg': spacePalette.pillBg } as Record<
                            string,
                            string
                          >)
                        : undefined
                    }
                    onMouseEnter={() => {
                      if (selectedIndex !== idx) setSelectedIndex(idx);
                    }}
                    onMouseDown={(e) => {
                      if (e.button === 0) {
                        e.preventDefault();
                        setSelectedIndex(idx);
                        executeItem(item);
                      }
                    }}
                  >
                    <span class="bark-cp-item-icon">
                      {item.type === 'space' ? (
                        <span class="bark-cp-arrow-badge">
                          <ArrowRightIcon />
                        </span>
                      ) : item.type === 'default-search' ? (
                        <SearchIcon />
                      ) : item.favIconUrl ? (
                        <Favicon
                          explicitFavIcon={item.favIconUrl}
                          pageUrl={item.url}
                          className="bark-cp-item-favicon"
                        />
                      ) : (
                        <GlobeFallbackIcon />
                      )}
                    </span>

                    <div class="bark-cp-item-main">
                      <span class="bark-cp-item-title">{item.title}</span>
                      {item.type === 'space' && item.badgeText && (
                        <span class="bark-cp-space-pill">
                          {`${item.badgeEmoji || ''} ${item.badgeText}`.trim()}
                        </span>
                      )}
                    </div>

                    {item.subtitle && item.type !== 'space' && item.type !== 'default-search' && (
                      <span class="bark-cp-item-subtitle">{item.subtitle}</span>
                    )}
                  </div>
                );
              })}
            </div>

            <div class="bark-cp-footer">
              <span>
                <span class="bark-cp-kbd">↑</span>
                <span class="bark-cp-kbd">↓</span> Navigate •{' '}
                <span class="bark-cp-kbd">Enter</span> Go •{' '}
                <span class="bark-cp-kbd">Esc</span> Close
              </span>
              <span>Bark Command Bar</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  render(<CommandPaletteView />, mountRoot);

  return {
    open(state, liveTabs, initialQuery = '') {
      externalOpen(state, liveTabs, initialQuery);
    },
    close() {
      externalClose();
    },
    isOpen: () => isVisible,
    updateData(state, liveTabs) {
      externalUpdate(state, liveTabs);
    },
    focusInput() {
      externalFocus();
    },
  };
}
