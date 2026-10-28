import { test as base, chromium, expect, type BrowserContext } from '@playwright/test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const EXT_PATH = resolve(process.cwd(), 'dist');

export const test = base.extend<{
  context: BrowserContext;
  extensionId: string;
}>({
  // eslint-disable-next-line no-empty-pattern
  context: async ({}, use) => {
    const userDataDir = mkdtempSync(join(tmpdir(), 'bark-pw-test-'));
    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chrome',
      headless: true,
      args: [
        '--headless=new',
        '--enable-unsafe-extension-debugging',
        '--no-first-run',
        '--no-default-browser-check',
      ],
      ignoreDefaultArgs: ['--disable-extensions'],
    });
    try {
      await use(context);
    } finally {
      await context.close();
      try {
        rmSync(userDataDir, { recursive: true, force: true });
      } catch {}
    }
  },
  extensionId: async ({ context }, use) => {
    const browser = context.browser();
    if (!browser) {
      throw new Error('Browser instance unavailable on persistent context');
    }
    const cdp = await browser.newBrowserCDPSession();
    const { id } = (await cdp.send('Extensions.loadUnpacked', {
      path: EXT_PATH,
    })) as { id: string };
    await cdp.detach();
    await use(id);
  },
});

test.describe('Bark Chrome Extension E2E', () => {
  test('renders Sidebar, escapes Space titles, supports context-menu Folder creation & inline rename, and validates URLs', async ({
    context,
    extensionId,
  }) => {
    const sidePage = await context.newPage();
    await sidePage.goto(`chrome-extension://${extensionId}/sidepanel.html`);

    await expect(sidePage.locator('#bark-sidebar-app')).toBeVisible();

    // 1. Create a Space with HTML characters to verify Preact JSX escaping
    const createRes = await sidePage.evaluate(() =>
      chrome.runtime.sendMessage({
        type: 'CREATE_SPACE',
        name: 'Engineering <script>alert(1)</script>',
        emoji: '🚀',
        color: 'blue',
      })
    );
    expect(createRes).toMatchObject({ ok: true });
    await expect(sidePage.locator('.bark-space-name')).toHaveText(
      'Engineering <script>alert(1)</script>'
    );

    // 2. Right-click Space Header to open Context Menu -> New Folder -> Inline Rename
    await sidePage.locator('#space-header').click({ button: 'right' });
    const newFolderItem = sidePage
      .locator('.bark-ctx-menu .bark-ctx-item')
      .filter({ hasText: 'New Folder' });
    await expect(newFolderItem).toBeVisible();
    await newFolderItem.click();

    const renameInput = sidePage.locator('input.bark-inline-rename-input');
    await expect(renameInput).toBeFocused();
    await renameInput.fill('Architecture Docs');
    await renameInput.press('Enter');

    await expect(
      sidePage.locator('.bark-row.folder-row .bark-row-title')
    ).toHaveText('Architecture Docs');

    // 3. Verify URL scheme validation (reject javascript:, accept https:)
    const badFav = await sidePage.evaluate(() =>
      chrome.runtime.sendMessage({
        type: 'ADD_FAVORITE',
        title: 'XSS Fav',
        url: 'javascript:alert(1)',
      })
    );
    expect(badFav).toMatchObject({ ok: false });

    const goodFav = await sidePage.evaluate(() =>
      chrome.runtime.sendMessage({
        type: 'ADD_FAVORITE',
        title: 'GitHub',
        url: 'https://github.com',
      })
    );
    expect(goodFav).toMatchObject({ ok: true });
    await expect(sidePage.locator('.bark-fav-tile')).toHaveCount(1);
  });

  test('synchronizes state live between Hub (hub.html) and Sidebar (sidepanel.html)', async ({
    context,
    extensionId,
  }) => {
    const sidePage = await context.newPage();
    await sidePage.goto(`chrome-extension://${extensionId}/sidepanel.html`);
    await expect(sidePage.locator('#bark-sidebar-app')).toBeVisible();

    const hubPage = await context.newPage();
    await hubPage.goto(`chrome-extension://${extensionId}/hub.html#spaces`);
    await expect(hubPage.locator('.bark-add-space-circle')).toBeVisible();

    // Create a new Space from the Hub modal UI and verify Sidebar updates automatically
    await hubPage.locator('.bark-add-space-circle').click();
    const modalInput = hubPage.locator('.bark-modal .bark-text-input').first();
    await expect(modalInput).toBeVisible();
    await modalInput.fill('Design System');
    await modalInput.press('Enter');

    await expect(sidePage.locator('.bark-space-name')).toHaveText('Design System');
    await expect(hubPage.locator('.bark-space-card-name').last()).toHaveText(
      'Design System'
    );

    // Navigate Hub to #settings and verify Settings view renders
    await hubPage.goto(`chrome-extension://${extensionId}/hub.html#settings`);
    await expect(hubPage.locator('.bark-page-title')).toHaveText('Settings');
  });

  test('copies a cleaned-up page URL with the copy shortcut, skips text fields, and honors Disable', async ({
    context,
    extensionId,
  }) => {
    const origin = 'https://bark-e2e.test';
    await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin });
    await context.route(`${origin}/**`, (route) =>
      route.fulfill({
        contentType: 'text/html',
        body: '<!doctype html><title>Article</title><h1>Article</h1><input id="field" />',
      })
    );

    // Make sure the extension (and its stored default settings) is initialized first
    const hubPage = await context.newPage();
    await hubPage.goto(`chrome-extension://${extensionId}/hub.html#settings`);
    await expect(hubPage.locator('#record-copy-url-shortcut-btn')).toContainText('Alt + C');

    const page = await context.newPage();
    await page.goto(`${origin}/article?id=42&utm_source=twitter&fbclid=abc#section-2`);
    const readClipboard = () => page.evaluate(() => navigator.clipboard.readText());
    await page.evaluate(() => navigator.clipboard.writeText('sentinel'));

    // Content script is injected at document_idle, so retry until the toast host appears
    await expect(async () => {
      await page.locator('h1').click();
      await page.keyboard.press('Alt+c');
      await expect(page.locator('#bark-toast-host')).toBeAttached({ timeout: 500 });
    }).toPass({ timeout: 10_000 });
    expect(await readClipboard()).toBe('https://bark-e2e.test/article?id=42#section-2');

    // Shortcut is ignored while typing in a text field
    await page.evaluate(() => navigator.clipboard.writeText('sentinel'));
    await page.locator('#field').focus();
    await page.keyboard.press('Alt+c');
    await page.waitForTimeout(300);
    expect(await readClipboard()).toBe('sentinel');

    // Disabling the shortcut in Settings stops it from firing
    await hubPage.bringToFront();
    await hubPage.locator('#disable-copy-url-shortcut-btn').click();
    await expect(hubPage.locator('#record-copy-url-shortcut-btn')).toContainText('Disabled');

    await page.bringToFront();
    await page.locator('h1').click();
    await page.keyboard.press('Alt+c');
    await page.waitForTimeout(300);
    expect(await readClipboard()).toBe('sentinel');
  });

  test('renders Command Palette inside Shadow DOM with bang shortcut expansion and keyboard navigation', async ({
    context,
    extensionId,
  }) => {
    const palettePage = await context.newPage();
    await palettePage.goto(`chrome-extension://${extensionId}/palette.html`);

    // Register a "yt" search shortcut (default state ships with none), then reload
    const saveRes = await palettePage.evaluate(() =>
      chrome.runtime.sendMessage({
        type: 'SAVE_SEARCH_SHORTCUT',
        shortcut: {
          prefix: 'yt',
          name: 'YouTube',
          urlTemplate: 'https://www.youtube.com/results?search_query=%s',
        },
      })
    );
    expect(saveRes).toMatchObject({ ok: true });
    await palettePage.reload();

    // Verify ShadowRoot isolation on #palette-mount
    const hasShadowRoot = await palettePage.evaluate(
      () => !!document.getElementById('palette-mount')?.shadowRoot
    );
    expect(hasShadowRoot).toBe(true);

    const input = palettePage.locator('.bark-cp-input');
    await expect(input).toBeVisible();

    // Type "yt" search shortcut prefix and press Tab to expand to "yt "
    await input.fill('yt');
    await expect(palettePage.locator('.bark-cp-item-title').first()).toHaveText(
      'YouTube (yt)'
    );
    await input.press('Tab');
    await expect(input).toHaveValue('yt ');

    // Type query after prefix and verify formatted search shortcut execution item
    await input.fill('yt preact');
    await expect(palettePage.locator('.bark-cp-item-title').first()).toHaveText(
      'Search YouTube for "preact"'
    );

    // Verify ArrowDown keyboard navigation across results
    const items = palettePage.locator('.bark-cp-item');
    await expect(items.nth(0)).toHaveClass(/selected/);
    await input.press('ArrowDown');
    await expect(items.nth(1)).toHaveClass(/selected/);
  });
});
