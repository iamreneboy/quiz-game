import { test, expect } from '@playwright/test';

test.describe('performance profile settings', () => {
  // Deliberately does not assert 'high': hardwareConcurrency / deviceMemory vary by
  // machine, and the two override tests below carry the semantics.
  test('publishes an effective profile to CSS on hydration', async ({ page }) => {
    await page.goto('/room/ZZZZZ');
    await expect(page.locator('html')).toHaveAttribute('data-profile', /^(high|reduced)$/);
  });

  test('choosing reduced motion applies immediately and survives a reload', async ({ page }) => {
    await page.goto('/room/ZZZZZ');
    await page.getByRole('button', { name: 'Display settings' }).click();
    await page.getByLabel('Motion').selectOption('reduced');
    await expect(page.locator('html')).toHaveAttribute('data-profile', 'reduced');

    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-profile', 'reduced');

    await page.getByRole('button', { name: 'Display settings' }).click();
    await expect(page.getByLabel('Motion')).toHaveValue('reduced');
  });

  test('the popover closes with Escape', async ({ page }) => {
    await page.goto('/room/ZZZZZ');
    await page.getByRole('button', { name: 'Display settings' }).click();
    await expect(page.getByLabel('Motion')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByLabel('Motion')).toBeHidden();
  });
});

test.describe('with prefers-reduced-motion', () => {
  // The `reducedMotion` context-option fixture does not reliably take effect
  // in this environment (verified independent of app code, even on
  // about:blank); page.emulateMedia() before navigation is the equivalent,
  // reliable escape hatch — see https://playwright.dev/docs/api/class-page#page-emulate-media.
  test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  test('auto resolves to reduced, and an explicit full-motion override wins', async ({ page }) => {
    await page.goto('/room/ZZZZZ');
    await expect(page.locator('html')).toHaveAttribute('data-profile', 'reduced');

    await page.getByRole('button', { name: 'Display settings' }).click();
    await page.getByLabel('Motion').selectOption('high');
    await expect(page.locator('html')).toHaveAttribute('data-profile', 'high');
  });
});
