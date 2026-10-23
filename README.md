# Bark

Arc-inspired Chrome Extension featuring:
- **Command Palette** (`Alt+T` on Windows/Linux, `Ctrl+T` on macOS) for switching open/pinned tabs, focusing Spaces, navigating to URLs, and searching with custom search engine prefixes (e.g., `osrs`).
- **Arc-style Sidebar** (`chrome.sidePanel`) with Global Favorites grid, Spaces synced two-way with Chrome Tab Groups, Workspace Pinned Tabs with nested collapsible folders, live vs. reduced pinned tab states, "Back to Pinned URL" detection, drag-and-drop everywhere, rich context menus, and one-click "Clear" for unpinned tabs.
- **Bark Hub** (Archive, Downloads, Spaces Navigator, & Search/Archive Settings).

## Development

```bash
npm install
npm run build
```

Load the `dist/` folder as an unpacked extension in `chrome://extensions/`.
