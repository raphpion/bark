import { COMMAND_PALETTE_CSS, createCommandPaletteUI } from '../shared/commandPaletteUI';
import { getDefaultSettings } from '../shared/constants';
import { BarkState, LiveTabInfo } from '../shared/types';
import { matchesShortcut } from '../shared/utils';

const mount = document.getElementById('palette-mount')!;
const shadow = mount.attachShadow({ mode: 'open' });

const style = document.createElement('style');
style.textContent =
  COMMAND_PALETTE_CSS +
  `
  .bark-cp-backdrop {
    padding: 0 !important;
    background: #232327 !important;
    align-items: stretch !important;
    justify-content: stretch !important;
  }
  .bark-cp-dialog {
    width: 100vw !important;
    height: 100vh !important;
    max-width: none !important;
    border-radius: 0 !important;
    border: none !important;
    box-shadow: none !important;
  }
  .bark-cp-results {
    flex: 1 !important;
    max-height: none !important;
  }
`;
shadow.appendChild(style);

const params = new URLSearchParams(window.location.search);
const initialQuery = params.get('q') || '';

const controller = createCommandPaletteUI(shadow, {
  onExecute(item, rawQuery) {
    chrome.runtime
      .sendMessage({
        type: 'EXECUTE_PALETTE_ACTION',
        item,
        query: rawQuery,
      })
      .finally(() => {
        window.close();
      });
  },
  onClose() {
    window.close();
  },
});

let cachedShortcut = getDefaultSettings().customShortcut;

chrome.runtime.sendMessage({ type: 'GET_STATE' }).then((res: unknown) => {
  const data = res as { state?: BarkState; liveTabs?: LiveTabInfo[] } | undefined;
  if (data?.state) {
    if (data.state.settings?.customShortcut) {
      cachedShortcut = data.state.settings.customShortcut;
    }
    controller.open(data.state, data.liveTabs || [], initialQuery);
  }
});

// Listen for live state updates and toggle shortcut inside the popup window
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'STATE_UPDATED' && msg.state) {
    if (msg.state.settings?.customShortcut) {
      cachedShortcut = msg.state.settings.customShortcut;
    }
    controller.updateData(msg.state, msg.liveTabs || []);
  }
});

window.addEventListener(
  'keydown',
  (e) => {
    if (matchesShortcut(e, cachedShortcut)) {
      e.preventDefault();
      window.close();
    }
  },
  true
);

// Close popup window when user clicks outside it
window.addEventListener('blur', () => {
  setTimeout(() => {
    if (!document.hasFocus()) {
      window.close();
    }
  }, 120);
});
