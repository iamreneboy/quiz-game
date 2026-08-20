import { test, expect } from '@playwright/test';

test.describe('joining a room', () => {
  test('join button is disabled until a nickname is entered', async ({ page }) => {
    await page.goto('/room/ZZZZZ');
    const join = page.getByRole('button', { name: 'Join game' });
    await expect(join).toBeDisabled();

    await page.getByPlaceholder('Your nickname').fill('Newbie');
    await expect(join).toBeEnabled();
  });

  test('shows an error when the room does not exist', async ({ page }) => {
    await page.goto('/room/ZZZZZ');
    await page.getByPlaceholder('Your nickname').fill('Newbie');
    await page.getByRole('button', { name: 'Join game' }).click();

    await expect(page.getByText(/room not found/i)).toBeVisible();
  });
});
