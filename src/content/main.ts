import { getDefaultSettings, STORAGE_KEY } from '../shared/constants';
import { BarkSettings, BarkState, ShortcutConfig } from '../shared/types';
import { cleanShareUrl, isEditableTarget, matchesShortcut } from '../shared/utils';
import { showToast } from './toast';

(() => {
  if ((window as unknown as { __barkContentLoaded?: boolean }).__barkContentLoaded) {
    return;
  }
  (window as unknown as { __barkContentLoaded?: boolean }).__barkContentLoaded = true;

  const defaults = getDefaultSettings();
  let paletteShortcut: ShortcutConfig = defaults.customShortcut;
  let copyUrlShortcut: ShortcutConfig | null = defaults.copyUrlShortcut;

  // Read only the shortcut settings from storage rather than requesting full tab/workspace state
  const applySettings = (settings?: Partial<BarkSettings>) => {
    if (!settings) return;
    if (settings.customShortcut) paletteShortcut = settings.customShortcut;
    // `null` means the user disabled the copy shortcut; `undefined` means older stored state.
    if (settings.copyUrlShortcut !== undefined) copyUrlShortcut = settings.copyUrlShortcut;
  };

  chrome.storage.local
    .get(STORAGE_KEY)
    .then((stored) => {
      applySettings((stored?.[STORAGE_KEY] as BarkState | undefined)?.settings);
    })
    .catch(() => {});

  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName === 'local' && changes[STORAGE_KEY]?.newValue) {
      applySettings((changes[STORAGE_KEY].newValue as BarkState)?.settings);
    }
  });

  async function writeClipboard(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Async Clipboard API is unavailable on insecure (http:) pages or when blocked by
      // Permissions-Policy; fall back to execCommand inside the keydown user gesture.
    }
    const previousFocus = document.activeElement as HTMLElement | null;
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
    (document.body || document.documentElement).appendChild(ta);
    try {
      ta.select();
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      ta.remove();
      previousFocus?.focus?.({ preventScroll: true });
    }
  }

  async function copyCurrentUrl() {
    // Content script is injected into the top frame only (no all_frames), so this is the tab URL.
    const cleaned = cleanShareUrl(location.href);
    if (!cleaned) {
      showToast("Couldn't copy URL", 'error');
      return;
    }
    const ok = await writeClipboard(cleaned);
    showToast(ok ? 'Copied current URL!' : "Couldn't copy URL", ok ? 'success' : 'error');
  }

  window.addEventListener(
    'keydown',
    (e) => {
      // Open the Command Palette mini-window
      if (matchesShortcut(e, paletteShortcut)) {
        e.preventDefault();
        e.stopImmediatePropagation();
        chrome.runtime.sendMessage({ type: 'TOGGLE_COMMAND_PALETTE' }).catch(() => {});
        return;
      }

      // Copy the cleaned-up page URL. Skipped while typing so Ctrl+C / Alt+C still reach
      // text fields and web terminals.
      if (
        copyUrlShortcut &&
        !e.repeat &&
        matchesShortcut(e, copyUrlShortcut) &&
        !isEditableTarget((e.composedPath()[0] as HTMLElement | undefined) ?? null)
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        void copyCurrentUrl();
      }
    },
    true
  );
})();
