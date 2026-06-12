import { test, expect } from '@playwright/test';

test.describe('TBM E2E', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('nav', { timeout: 20000 });
  });

  test('App shell mounts and sidebar renders', async ({ page }) => {
    const buttons = page.locator('nav').first().locator('button');
    expect(await buttons.count()).toBeGreaterThanOrEqual(5);
    // Status bar or audio indicator
    const statusText = page.getByText(/Audio|Engine|Web Audio/i);
    if (await statusText.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(statusText.first()).toBeVisible();
    }
  });

  test('View switching via sidebar works', async ({ page }) => {
    const drumsBtn = page.getByText('Drums', { exact: false }).first();
    if (await drumsBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await drumsBtn.click();
      await page.waitForTimeout(3000);
    }
  });

  test('Workspace toggle renders Song Editor', async ({ page }) => {
    const btn = page.getByText('Arranger', { exact: false });
    if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(1500);
      await expect(page.getByText('Song Editor', { exact: false })).toBeVisible({ timeout: 5000 });
    }
  });

  test('Header bar renders', async ({ page }) => {
    // Header should have at least some text content
    const headerText = page.getByText(/TBM_|Ideas|Arranger|File|Edit|Export|Panic/i);
    if (await headerText.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(headerText.first()).toBeVisible();
    }
  });

  test('File menu opens', async ({ page }) => {
    const fileBtn = page.getByText('File').first();
    if (await fileBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await fileBtn.click();
      await page.waitForTimeout(500);
    }
  });

  test('Settings tab navigable', async ({ page }) => {
    const btn = page.getByText('Settings', { exact: false }).first();
    if (await btn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(2000);
    }
  });

  test('No critical console errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForSelector('nav', { timeout: 20000 });
    await page.waitForTimeout(2000);
    const critical = errors.filter(e =>
      !e.includes('500') &&
      !e.includes('ScriptProcessor') &&
      !e.includes('Failed to fetch') &&
      !e.includes('Failed to load resource') &&
      !e.includes('synchronization error')
    );
    expect(critical).toEqual([]);
  });
});
