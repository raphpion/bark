import { chromium } from '@playwright/test';
import { existsSync, mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = process.cwd();
const extPath = resolve(root, 'dist');
const outDir = resolve(root, 'store-assets');

if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
}

async function generateScreenshots() {
  console.log('🎬 Generating 5 Chrome Web Store screenshots (1280x800, JPEG 24-bit)...');

  const userDataDir = mkdtempSync(join(tmpdir(), 'bark-shots-'));
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: 'chrome',
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: [
      '--headless=new',
      '--enable-unsafe-extension-debugging',
      '--no-first-run',
      '--no-default-browser-check',
    ],
    ignoreDefaultArgs: ['--disable-extensions'],
  });

  let helperPage;
  try {
    const cdp = await context.browser().newBrowserCDPSession();
    const { id: extId } = await cdp.send('Extensions.loadUnpacked', {
      path: extPath,
    });
    console.log(`   Extension active: ${extId}`);

    // Seed realistic data via background runtime messages
    helperPage = await context.newPage();
    await helperPage.goto(`chrome-extension://${extId}/sidepanel.html`);

    const { spaceId } = await helperPage.evaluate(async () => {
      // 1. Create Spaces
      const s1 = await chrome.runtime.sendMessage({
        type: 'CREATE_SPACE',
        name: 'Engineering',
        emoji: '🚀',
        color: 'purple',
      });
      const s2 = await chrome.runtime.sendMessage({
        type: 'CREATE_SPACE',
        name: 'Design & UI',
        emoji: '🎨',
        color: 'pink',
      });
      const s3 = await chrome.runtime.sendMessage({
        type: 'CREATE_SPACE',
        name: 'Analytics',
        emoji: '📈',
        color: 'cyan',
      });
      const s4 = await chrome.runtime.sendMessage({
        type: 'CREATE_SPACE',
        name: 'Personal',
        emoji: '🏠',
        color: 'green',
      });
      await chrome.runtime.sendMessage({ type: 'SWITCH_SPACE', spaceId: s1.space.id });

      // 2. Global Favorites
      await chrome.runtime.sendMessage({
        type: 'ADD_FAVORITE',
        title: 'GitHub · Pull Requests',
        url: 'https://github.com/raphpion/bark',
      });
      await chrome.runtime.sendMessage({
        type: 'ADD_FAVORITE',
        title: 'Linear · Sprint Roadmap',
        url: 'https://linear.app',
      });
      await chrome.runtime.sendMessage({
        type: 'ADD_FAVORITE',
        title: 'Figma · Design System',
        url: 'https://figma.com',
      });
      await chrome.runtime.sendMessage({
        type: 'ADD_FAVORITE',
        title: 'Docs · Chrome Extensions',
        url: 'https://developer.chrome.com',
      });

      // 3. Pinned Folders in Engineering Space
      const f1 = await chrome.runtime.sendMessage({
        type: 'CREATE_FOLDER',
        spaceId: s1.space.id,
        title: 'Architecture & RFCs',
      });
      await chrome.runtime.sendMessage({
        type: 'CREATE_FOLDER',
        spaceId: s1.space.id,
        title: 'Design System Tokens',
      });

      // 4. Custom Search Shortcuts
      await chrome.runtime.sendMessage({
        type: 'SAVE_SEARCH_SHORTCUT',
        shortcut: {
          prefix: 'yt',
          name: 'YouTube',
          urlTemplate: 'https://www.youtube.com/results?search_query=%s',
        },
      });
      await chrome.runtime.sendMessage({
        type: 'SAVE_SEARCH_SHORTCUT',
        shortcut: {
          prefix: 'gh',
          name: 'GitHub',
          urlTemplate: 'https://github.com/search?q=%s',
        },
      });

      return { spaceId: s1.space.id, folderId: f1.folder.id };
    });

    await helperPage.waitForTimeout(400);

    // -------------------------------------------------------------
    // Screenshot 1: Docked Sidebar with Spaces, Pinned Tree, & Favorites
    // -------------------------------------------------------------
    console.log('1/5 Capturing: screenshot-1-workspaces-sidebar.jpg (1280x800)...');
    const shot1Page = await context.newPage();
    await shot1Page.setViewportSize({ width: 1280, height: 800 });
    await shot1Page.goto(`chrome-extension://${extId}/sidepanel.html`);
    await shot1Page.waitForSelector('#bark-sidebar-app');

    // Layout the sidebar inside an authentic 1280x800 browser canvas
    await shot1Page.evaluate(() => {
      document.body.style.display = 'flex';
      document.body.style.flexDirection = 'row';
      document.body.style.width = '1280px';
      document.body.style.height = '800px';
      document.body.style.background = '#090a0f';
      document.body.style.margin = '0';
      document.body.style.overflow = 'hidden';

      const sidebar = document.getElementById('bark-sidebar-app');
      if (sidebar) {
        sidebar.style.width = '380px';
        sidebar.style.height = '100%';
        sidebar.style.borderRight = '1px solid rgba(255, 255, 255, 0.08)';
        sidebar.style.flexShrink = '0';
      }

      const canvas = document.createElement('div');
      canvas.id = 'demo-canvas';
      canvas.style.cssText = `
        flex: 1;
        display: flex;
        flex-direction: column;
        background: #0d1117;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      `;
      canvas.innerHTML = `
        <div style="height: 52px; background: #161b22; border-bottom: 1px solid #30363d; display: flex; align-items: center; padding: 0 20px; gap: 14px;">
          <div style="display: flex; gap: 8px;">
            <div style="width: 12px; height: 12px; border-radius: 50%; background: #ff5f56;"></div>
            <div style="width: 12px; height: 12px; border-radius: 50%; background: #ffbd2e;"></div>
            <div style="width: 12px; height: 12px; border-radius: 50%; background: #27c93f;"></div>
          </div>
          <div style="flex: 1; max-width: 540px; height: 32px; background: #0d1117; border: 1px solid #30363d; border-radius: 8px; display: flex; align-items: center; padding: 0 12px; font-size: 13px; color: #8b949e; gap: 8px;">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#58a6ff" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
            github.com/raphpion/bark
          </div>
        </div>
        <div style="flex: 1; padding: 48px; display: flex; flex-direction: column; gap: 24px; color: #f0f6fc;">
          <div style="background: #161b22; border: 1px solid #30363d; border-radius: 14px; padding: 32px;">
            <div style="display: inline-flex; align-items: center; gap: 8px; padding: 4px 12px; border-radius: 999px; background: rgba(124, 58, 237, 0.18); color: #c4b5fd; font-size: 12.5px; font-weight: 600; margin-bottom: 16px;">
              <span>✦</span> Arc-Style Sidebar in Google Chrome
            </div>
            <h1 style="font-size: 30px; font-weight: 700; color: #f0f6fc; margin: 0 0 12px 0;">Workspaces, Spaces & Pinned Folders</h1>
            <p style="font-size: 15px; color: #8b949e; line-height: 1.6; margin: 0 0 24px 0; max-width: 620px;">
              Keep your tabs organized by context. Switch between Spaces with one click, pin nested folder hierarchies, and keep your daily web apps accessible in top favorites.
            </p>
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px;">
              <div style="background: #0d1117; border: 1px solid #21262d; border-radius: 10px; padding: 18px;">
                <div style="font-size: 22px; font-weight: 700; color: #a78bfa;">4 Spaces</div>
                <div style="font-size: 12.5px; color: #8b949e; margin-top: 4px;">Clean Context Isolation</div>
              </div>
              <div style="background: #0d1117; border: 1px solid #21262d; border-radius: 10px; padding: 18px;">
                <div style="font-size: 22px; font-weight: 700; color: #38bdf8;">Tree Folders</div>
                <div style="font-size: 12.5px; color: #8b949e; margin-top: 4px;">Drag & Drop Hierarchy</div>
              </div>
              <div style="background: #0d1117; border: 1px solid #21262d; border-radius: 10px; padding: 18px;">
                <div style="font-size: 22px; font-weight: 700; color: #4ade80;">Alt + C</div>
                <div style="font-size: 12.5px; color: #8b949e; margin-top: 4px;">Clean URL Sharing</div>
              </div>
            </div>
          </div>
        </div>
      `;
      document.body.appendChild(canvas);
    });

    await shot1Page.waitForTimeout(500);
    await shot1Page.screenshot({
      path: resolve(outDir, 'screenshot-1-workspaces-sidebar.jpg'),
      type: 'jpeg',
      quality: 95,
    });
    await shot1Page.close();

    // -------------------------------------------------------------
    // Screenshot 2: Command Palette with Bang Shortcuts & Search
    // -------------------------------------------------------------
    console.log('2/5 Capturing: screenshot-2-command-palette.jpg (1280x800)...');
    const shot2Page = await context.newPage();
    await shot2Page.setViewportSize({ width: 1280, height: 800 });
    await shot2Page.goto(`chrome-extension://${extId}/palette.html?q=yt`);
    await shot2Page.waitForTimeout(500);
    await shot2Page.screenshot({
      path: resolve(outDir, 'screenshot-2-command-palette.jpg'),
      type: 'jpeg',
      quality: 95,
    });
    await shot2Page.close();

    // -------------------------------------------------------------
    // Screenshot 3: Full-Page Hub Spaces Board
    // -------------------------------------------------------------
    console.log('3/5 Capturing: screenshot-3-spaces-board.jpg (1280x800)...');
    const shot3Page = await context.newPage();
    await shot3Page.setViewportSize({ width: 1280, height: 800 });
    await shot3Page.goto(`chrome-extension://${extId}/hub.html#spaces`);
    await shot3Page.waitForTimeout(500);
    await shot3Page.screenshot({
      path: resolve(outDir, 'screenshot-3-spaces-board.jpg'),
      type: 'jpeg',
      quality: 95,
    });
    await shot3Page.close();

    // -------------------------------------------------------------
    // Screenshot 4: Full-Page Hub Tab Archive & Auto-Cleanup
    // -------------------------------------------------------------
    console.log('4/5 Capturing: screenshot-4-tab-archive.jpg (1280x800)...');
    const shot4Page = await context.newPage();
    await shot4Page.setViewportSize({ width: 1280, height: 800 });

    // Seed sample archived tabs into storage for rich screenshot view
    await shot4Page.goto(`chrome-extension://${extId}/hub.html#archive`);
    await shot4Page.evaluate((sId) => {
      return chrome.storage.local.get('bark_state_v2').then((stored) => {
        const s = stored?.bark_state_v2;
        if (!s) return;
        s.archivedTabs = [
          {
            id: 'arc-1',
            title: 'Vite 6 Configuration & Build Guide',
            url: 'https://vite.dev/config/',
            spaceId: sId,
            spaceName: 'Engineering',
            spaceEmoji: '🚀',
            archivedAt: Date.now() - 3600_000 * 2,
          },
          {
            id: 'arc-2',
            title: 'Preact 10 Signals & TSX Component State',
            url: 'https://preactjs.com/guide/v10/signals',
            spaceId: sId,
            spaceName: 'Engineering',
            spaceEmoji: '🚀',
            archivedAt: Date.now() - 3600_000 * 5,
          },
          {
            id: 'arc-3',
            title: 'Chrome Web Store Publish API Reference',
            url: 'https://developer.chrome.com/docs/webstore/api',
            spaceId: sId,
            spaceName: 'Engineering',
            spaceEmoji: '🚀',
            archivedAt: Date.now() - 3600_000 * 14,
          },
          {
            id: 'arc-4',
            title: 'Playwright Browser Automation Fixtures',
            url: 'https://playwright.dev/docs/test-fixtures',
            spaceId: sId,
            spaceName: 'Engineering',
            spaceEmoji: '🚀',
            archivedAt: Date.now() - 3600_000 * 22,
          },
        ];
        return chrome.storage.local.set({ bark_state_v2: s });
      });
    }, spaceId);

    await shot4Page.reload();
    await shot4Page.waitForTimeout(500);
    await shot4Page.screenshot({
      path: resolve(outDir, 'screenshot-4-tab-archive.jpg'),
      type: 'jpeg',
      quality: 95,
    });
    await shot4Page.close();

    // -------------------------------------------------------------
    // Screenshot 5: Settings & Copy Current URL Shortcuts
    // -------------------------------------------------------------
    console.log('5/5 Capturing: screenshot-5-settings.jpg (1280x800)...');
    const shot5Page = await context.newPage();
    await shot5Page.setViewportSize({ width: 1280, height: 800 });
    await shot5Page.goto(`chrome-extension://${extId}/hub.html#settings`);
    await shot5Page.waitForTimeout(500);
    await shot5Page.screenshot({
      path: resolve(outDir, 'screenshot-5-settings.jpg'),
      type: 'jpeg',
      quality: 95,
    });
    await shot5Page.close();

    console.log('\n🎉 Successfully generated all 5 screenshots in store-assets/!');
  } finally {
    await helperPage.close();
    await context.close();
    try {
      rmSync(userDataDir, { recursive: true, force: true });
    } catch {}
  }
}

generateScreenshots().catch((err) => {
  console.error('❌ Failed to generate screenshots:', err);
  process.exit(1);
});
