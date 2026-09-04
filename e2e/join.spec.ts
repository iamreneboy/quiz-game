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

  // The other half of the same story: a browser that already HOLDS a session
  // has no join form to be told through, and used to sit on "Connecting…" for
  // as long as the page stayed open.
  test('a session for a room that is gone reads as a typo, not as a hang', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('cb:ZZZZZ', JSON.stringify({
        roomId: '00000000-0000-0000-0000-000000000000',
        playerId: '00000000-0000-0000-0000-000000000001',
        playerKey: 'not-a-key',
      }));
    });
    await page.goto('/room/ZZZZZ');

    await expect(page.getByTestId('room-missing')).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId('room-missing')).toContainText('ZZZZZ');

    await page.getByRole('button', { name: /back to the start/i }).click();
    await expect(page.getByRole('button', { name: /host a game/i })).toBeVisible();
  });
});
