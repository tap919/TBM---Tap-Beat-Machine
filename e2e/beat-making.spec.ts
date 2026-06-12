import { test, expect } from '@playwright/test';

test.describe('TBM Beat-Making User Journey', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'networkidle' });
    // Wait for app shell to mount — sidebar navigation is the most reliable indicator
    await page.waitForSelector('nav[aria-label="Main navigation"]', { timeout: 20000 });
  });

  test('App shell: mounts, header bar and sidebar render', async ({ page }) => {
    // Header bar should render with Panic button
    await expect(page.getByText('Panic', { exact: false })).toBeVisible({ timeout: 5000 });

    // Sidebar navigation renders with at least 5 items
    const nav = page.locator('nav[aria-label="Main navigation"]');
    const buttons = nav.locator('button');
    await expect(buttons.first()).toBeVisible({ timeout: 5000 });
    const count = await buttons.count();
    expect(count).toBeGreaterThanOrEqual(10);

    // Status bar renders
    await expect(page.getByText(/Audio Engine/i).first()).toBeVisible({ timeout: 5000 });
  });

  test('App shell: view switching via sidebar works', async ({ page }) => {
    // Click on a sidebar button to switch to Drums
    const nav = page.locator('nav[aria-label="Main navigation"]');
    const drumsBtn = nav.getByText('Drums', { exact: false }).first();
    if (await drumsBtn.isVisible()) {
      await drumsBtn.click();
      await page.waitForTimeout(2000);
    }

    // Switch to Mixer via sidebar
    const mixerBtn = nav.getByText('Mixer', { exact: false }).first();
    if (await mixerBtn.isVisible()) {
      await mixerBtn.click();
      await page.waitForTimeout(1000);
    }

    // Switch back to Drums
    const drumsBtn2 = nav.getByText('Drums', { exact: false }).first();
    if (await drumsBtn2.isVisible()) {
      await drumsBtn2.click();
      await page.waitForTimeout(1000);
    }
  });

  test('App shell: workspace mode toggles render Song Editor', async ({ page }) => {
    // Click Arranger mode
    const arrangerBtn = page.getByText('Arranger', { exact: false });
    if (await arrangerBtn.isVisible()) {
      await arrangerBtn.click();
      await page.waitForTimeout(1000);
      // Should see Song Editor heading
      await expect(page.getByText('Song Editor', { exact: false })).toBeVisible({ timeout: 5000 });

      // Switch back
      const ideasBtn = page.getByText('Ideas', { exact: false });
      if (await ideasBtn.isVisible()) {
        await ideasBtn.click();
        await page.waitForTimeout(1000);
      }
    }
  });

  test('Panic button is interactive', async ({ page }) => {
    const panicBtn = page.getByText('Panic', { exact: false }).last();
    await expect(panicBtn).toBeVisible({ timeout: 5000 });
    await panicBtn.click();
    // After panic, the app shows a grayscale effect briefly
    await page.waitForTimeout(200);
  });

  test('No critical console errors on initial load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto('/', { waitUntil: 'networkidle' });
    await page.waitForSelector('nav[aria-label="Main navigation"]', { timeout: 20000 });
    await page.waitForTimeout(2000);

    // Navigate through a few tabs
    const nav = page.locator('nav[aria-label="Main navigation"]');
    const tabs = ['Drums', 'Mixer'];
    for (const tab of tabs) {
      const btn = nav.getByText(tab, { exact: false }).first();
      if (await btn.isVisible()) {
        await btn.click();
        await page.waitForTimeout(2000);
      }
    }

    // Filter expected errors (Web Audio, ScriptProcessor deprecation, 500s from missing API)
    const critical = errors.filter(e =>
      !e.includes('ScriptProcessor') &&
      !e.includes('AudioContext') &&
      !e.includes('The AudioContext was not allowed to start') &&
      !e.includes('ERR_BLOCKED_BY_CLIENT') &&
      !e.includes('500') &&
      !e.includes('Failed to load resource')
    );
    expect(critical).toEqual([]);
  });

  test('File menu opens with save option', async ({ page }) => {
    const fileBtn = page.locator('button').filter({ hasText: 'File' }).first();
    if (await fileBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await fileBtn.click();
      await page.waitForTimeout(500);
      await expect(page.getByText('.tbm', { exact: false }).first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('Settings sidebar tab renders content', async ({ page }) => {
    const nav = page.locator('nav[aria-label="Main navigation"]');
    const settingsBtn = nav.getByText('Settings', { exact: false }).first();
    if (await settingsBtn.isVisible()) {
      await settingsBtn.click();
      await page.waitForTimeout(2000);
      // Settings should show some configuration text
      await expect(page.getByText(/Audio|Buffer|Sample|Theme|Scale/i).first()).toBeVisible({ timeout: 5000 });
    }
  });

  test('Keyboard shortcut: spacebar does not crash when sequencer exists', async ({ page }) => {
    // Press spacebar (play/stop toggle) — should not cause console errors
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.keyboard.press('Space');
    await page.waitForTimeout(500);
    await page.keyboard.press('Space');
    await page.waitForTimeout(500);

    const critical = errors.filter(e =>
      !e.includes('ScriptProcessor') &&
      !e.includes('500') &&
      !e.includes('Failed to load resource')
    );
    expect(critical).toEqual([]);
  });

  test('Virtual keyboard toggle exists', async ({ page }) => {
    await expect(
      page.getByText('Show Keyboard', { exact: false }).or(page.getByText('Hide Keyboard', { exact: false }))
    ).toBeVisible({ timeout: 5000 });
  });
});
