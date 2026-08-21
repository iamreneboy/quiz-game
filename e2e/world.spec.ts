import { test, expect } from '@playwright/test';

// The portrait band (spec §7): a compact strip while a question is on screen,
// full height at the track moment. Driven directly against a lobby room so the
// test stays fast — the band derives from phase, not from any game outcome.
test.describe('the world band in portrait', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('is full height before a question is on screen', async ({ page }) => {
    await page.goto('/host/new');
    await page.getByPlaceholder('Your nickname').fill('Bandy');
    await page.getByRole('button', { name: /create room/i }).click();
    await expect(page).toHaveURL(/\/room\/[A-Z0-9]{5}$/);

    const stage = page.locator('[data-testid="pixi-stage"]');
    await expect(stage).toHaveAttribute('data-band', 'full');
    await expect(stage.locator('canvas')).toBeAttached();

    const box = await stage.boundingBox();
    expect(box!.height).toBeGreaterThan(700);
  });
});
