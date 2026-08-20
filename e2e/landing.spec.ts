import { test, expect } from '@playwright/test';

test('shows the landing page with host and join controls', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /circuit break/i })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Host a game' })).toBeVisible();
});

test('navigates to host setup', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Host a game' }).click();
  await expect(page).toHaveURL(/\/host\/new$/);
  await expect(page.getByRole('heading', { name: 'New game' })).toBeVisible();
});

test('join button stays disabled until a 5-character code is entered', async ({ page }) => {
  await page.goto('/');
  const joinButton = page.getByRole('button', { name: 'Join' });
  await expect(joinButton).toBeDisabled();

  await page.getByPlaceholder('ROOM CODE').fill('ab1');
  await expect(joinButton).toBeDisabled();

  await page.getByPlaceholder('ROOM CODE').fill('ab1cd');
  await expect(joinButton).toBeEnabled();
  await joinButton.click();
  await expect(page).toHaveURL(/\/room\/AB1CD$/);
});
