# Bark Extension — Architecture & Engineering Principles (`AGENTS.md`)

This document defines the architecture, security boundaries, and coding standards for **Bark**. All human and AI contributors must follow these rules when modifying or extending the codebase.

---

## 1. Architecture Overview

Bark is a Manifest V3 Chrome Extension composed of 4 isolated execution contexts and a shared module layer:

| Entrypoint | Context | Bundle Format | Responsibility |
| :--- | :--- | :--- | :--- |
| `src/background/main.ts` | Extension Service Worker | ESM (`dist/background.js`) | Single source of truth for `BarkState`, Chrome Tabs / TabGroups / Alarms synchronization, and privileged command execution. |
| `src/sidepanel/main.tsx` | Extension Page (`sidepanel.html`) | Vite ESM (Preact) | Arc-style sidebar UI (Global Favorites, Space Header, Pinned Tree, Normal Tabs, Context Menus). |
| `src/hub/main.tsx` | Extension Page (`hub.html`) | Vite ESM (Preact) | Full-page manager for Spaces board, Archived Tabs, Downloads, and Settings. |
| `src/palette/main.tsx` | Extension Popup (`palette.html`) | Vite ESM (Preact) | Standalone Command Palette window (`type: 'popup'`) with Shadow DOM isolation. |
| `src/content/main.ts` | Web Page Content Script (`<all_urls>`) | IIFE (`dist/content.js`) | Minimal keydown listener: triggers `TOGGLE_COMMAND_PALETTE` on the palette shortcut, and copies the cleaned-up page URL (`cleanShareUrl()`) on the copy-URL shortcut, confirmed by a closed-Shadow-DOM toast (`src/content/toast.ts`). |
| `src/shared/*` | Shared Library | Imported by above | Types (`types.ts`), constants (`constants.ts`), pure utilities (`utils.ts`), Preact UI/Icon components (`uiHelpers.tsx`), modals (`spaceModal.tsx`), context menus (`contextMenu.tsx`), Command Palette UI (`commandPaletteUI.tsx`), and shared styles (`commonStyles.css`). |

---

## 2. Security & Privacy Hardening Rules

### 2.1 Zero Trust for Content Scripts & Web Pages
- **`src/content/main.ts` runs inside untrusted web pages.** Keep it strictly minimal:
  - Never request or broadcast full `BarkState` (open tabs, archived tabs, spaces) to content scripts. Read only the shortcut settings (`settings.customShortcut`, `settings.copyUrlShortcut`) from `chrome.storage.local`.
  - Content-script features that act on the page itself (like Copy Current URL) must run locally in the content script, not via new privileged background messages. Page shortcuts that could collide with typing must be skipped when `isEditableTarget()` is true.
  - In `src/background/main.ts`, `chrome.runtime.onMessage` **must** validate `sender`:
    ```ts
    const isExtensionOrigin =
      sender.id === chrome.runtime.id &&
      (!sender.tab || sender.url?.startsWith(chrome.runtime.getURL('')));
    ```
    Senders where `!isExtensionOrigin` (i.e. content scripts in web tabs) may only send `TOGGLE_COMMAND_PALETTE`. All state-mutating or state-reading messages must be rejected.

### 2.2 Preact JSX Rendering & Zero `.innerHTML`
- Extension pages (`sidepanel.html`, `hub.html`, `palette.html`) have access to privileged `chrome.*` APIs. Additionally, `space.name` and tab titles are synced from external web pages and Chrome Tab Groups.
- All UI rendering **must** use Preact JSX (`.tsx`), which escapes all text expressions (`{space.name}`, `{tab.title}`, `{item.url}`) by default and performs keyed in-place DOM diffing.
- **Never** use `.innerHTML` or `dangerouslySetInnerHTML` anywhere in `src/`. SVG icons must be defined as Preact functional components in `src/shared/uiHelpers.tsx`.
- This rule is enforced automatically on every build by `scripts/verify-hardening.mjs`.

### 2.3 Strict URL Scheme Validation
- User-configurable URLs (Favorites, Pinned Tabs, Search Shortcut templates, Command Palette direct URLs) must be validated with `isSafeNavigationUrl()` / `sanitizeUserUrl()` in `src/shared/utils.ts` (allowing only `http:` and `https:`).
- Never allow `javascript:`, `data:`, `file:`, or `chrome:` URLs to be saved or executed from user-supplied URL fields.
- Always wrap `new URL(...)` calls in `try / catch` when parsing user-configured templates or tab URLs.

### 2.4 Manifest Least Privilege
- Do not add unused permissions (such as `"scripting"`) to `public/manifest.json`.
- **Never** expose `"_favicon/*"` in `web_accessible_resources` to `<all_urls>`, as doing so allows arbitrary websites to probe cached favicons and fingerprint browsing history.

---

## 3. Manifest V3 Service Worker Resilience

1. **Ephemeral Worker Memory**: Chrome terminates the MV3 background service worker after ~30 seconds of inactivity.
   - Never assume module-level variables (`state`, `palettePopupWindowId`, `liveTabSnapshot`) survive across events without fallback initialization.
   - Always call `await loadState()` at the start of event listeners (`loadState()` reconciles open tabs and populates `liveTabSnapshot`).
   - When toggling `palette.html`, use `findExistingPalettePopupWindow()` to query existing popup windows if `palettePopupWindowId` was reset by a service worker restart.
2. **Window Targeting**: Never call `chrome.tabs.query({ currentWindow: true })` from the background service worker, because `currentWindow` may be the `palette.html` popup window rather than the user's normal browser window. Always use `getNormalWindowTabs()` and `getTargetNormalWindowId()`.
3. **Debounced Broadcasts**: `chrome.tabs.onUpdated` fires multiple times per navigation. Always use `scheduleBroadcastState()` rather than firing unthrottled `chrome.runtime.sendMessage` calls on every intermediate tab event.

---

## 4. Code Simplicity & Deduplication (DRY)

1. **Single Source for Shared UI & Logic**:
   - **Row Styles**: Shared styles for `.bark-row` (Sidebar) and `.bark-hub-item-row` (Hub) live in `src/shared/commonStyles.css`. Do not duplicate row layout, folder flap animation, or action button CSS between `src/sidepanel/styles.css` and `src/hub/styles.css`.
   - **Preact Components & Icons**: Shared SVG icon components (`<FolderAnimatedIcon />`, `<MinusIcon />`, `<CloseIcon />`, `<BackResetIcon />`, etc.), `<Favicon />`, `<InlineRenameInput />`, and `animateRowExit` live in `src/shared/uiHelpers.tsx`.
   - **Pure Utilities**: Shortcut matching (`matchesShortcut`), shortcut formatting (`formatShortcutLabel`), URL normalization (`normalizeUrlForComparison`), and pinned tab ID collection (`getPinnedTabIds`) live in `src/shared/utils.ts`.
2. **Keyed Declarative Rendering**:
   - Always provide stable `key={item.id}` props on Preact list items so Preact's Virtual DOM preserves DOM nodes, focus states, and CSS transitions (`paddingLeft`, hover states) across `STATE_UPDATED` broadcasts without manual DOM scraping.

---

## 5. Testing

| Layer | Tool | Location | Command |
| :--- | :--- | :--- | :--- |
| Unit (pure logic in `src/shared/utils.ts`, etc.) | Vitest | `tests/unit/**/*.test.ts` | `npm test` |
| E2E (real Chrome + unpacked `dist/`) | Playwright | `tests/e2e/**/*.spec.ts` | `npm run test:e2e` |

- Put pure, `chrome.*`-free logic in `src/shared/utils.ts` so it can be unit tested in Vitest's Node environment.
- E2E tests run on installed Google Chrome (`channel: 'chrome'`). Chrome 137+ ignores `--load-extension`, so the fixture launches with `--enable-unsafe-extension-debugging` and loads `dist/` via CDP `Extensions.loadUnpacked`. Don't go back to `--load-extension`.
- Playwright locators pierce the Command Palette's open Shadow DOM, so you don't need manual `shadowRoot` queries.
- Default state has **no** search shortcuts. Tests that need one must register it with `SAVE_SEARCH_SHORTCUT`.

---

## 6. Pre-Commit Verification

Before completing any change, always run:

```bash
npm run check
npm test
npm run build
```

Run `npm run test:e2e` when you change UI, background messaging, or the manifest.

`npm run build` automatically runs `scripts/verify-hardening.mjs` to enforce manifest least-privilege, content-script isolation, zero `.innerHTML` / `dangerouslySetInnerHTML` usage, and background sender verification.

---

## 7. Versioning & Chrome Web Store Automated Release

Bark uses **Google Release Please** and GitHub Actions for continuous delivery to the Chrome Web Store:

1. **Conventional Commits**: Every commit or pull request to `main` must follow Conventional Commits (e.g. `feat:`, `fix:`, `perf:`, `refactor:`).
2. **Release PR**: Release Please automatically maintains an open Release PR titled `chore(main): release x.y.z`, bumping versions in both `package.json` and `public/manifest.json`, and updating `CHANGELOG.md`.
3. **Automated Publishing**: Merging the Release PR tags the commit (`vX.Y.Z`), creates a GitHub Release, runs `.github/workflows/release.yml`, packages `bark-extension.zip` (`npm run pack`), and uploads & submits the extension for review on the Chrome Web Store.
4. **Required Secrets**:
   - `CHROME_EXTENSION_ID`: Chrome Web Store item ID.
   - `CHROME_CLIENT_ID`: Google Cloud OAuth2 Client ID.
   - `CHROME_CLIENT_SECRET`: Google Cloud OAuth2 Client Secret.
   - `CHROME_REFRESH_TOKEN`: OAuth2 Refresh Token (generated using `npm run token:cws`).

---

## 8. Pull Request & Patch Note Standards for Agents & Contributors

All contributors and AI agents creating pull requests must follow these rules:

1. **Exactly One Type Label**: Every PR must have exactly one type label applied (`feature`, `fix`, `breaking`, or `chore`). Missing or conflicting labels will fail the CI `validate-pr` job and block merging.
2. **Mandatory User-Facing Patch Notes**:
   - For `feature`, `fix`, or `breaking` PRs, the PR description **must** include the `## Patch Notes` section with bullet points written for Bark users (e.g. *"Added Alt+C shortcut to copy shareable links without tracking tags"*).
   - Do not write developer-only jargon in the patch notes (use the `## Technical Details` section for that).
   - For `chore` PRs (internal tooling, docs, refactoring with zero behavior change), patch notes may be omitted.
3. **Local PR Metadata Check**:
   - Run `npm run check:pr` or `npm test` before submitting to ensure PR metadata validation passes.
   - The `.github/pull_request_template.md` is automatically pre-filled on new PRs.
