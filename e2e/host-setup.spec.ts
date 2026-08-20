import { test, expect } from '@playwright/test';

test.describe('host setup validation', () => {
  test('create room is disabled until nickname is entered', async ({ page }) => {
    await page.goto('/host/new');
    const create = page.getByRole('button', { name: /create room/i });
    await expect(create).toBeDisabled();

    await page.getByPlaceholder('Your nickname').fill('Boss');
    await expect(create).toBeEnabled();
  });

  test('create room is disabled when the question mix is empty', async ({ page }) => {
    await page.goto('/host/new');
    await page.getByPlaceholder('Your nickname').fill('Boss');
    const create = page.getByRole('button', { name: /create room/i });
    await expect(create).toBeEnabled();

    // Drive every tier count down to zero.
    const minusButtons = page.getByRole('button', { name: '−' });
    const count = await minusButtons.count();
    for (let i = 0; i < count; i++) {
      const btn = minusButtons.nth(i);
      for (let click = 0; click < 10; click++) await btn.click();
    }

    await expect(page.getByText(/0 questions/)).toBeVisible();
    await expect(create).toBeDisabled();
  });

  test('create room is disabled when no category is selected', async ({ page }) => {
    await page.goto('/host/new');
    await page.getByPlaceholder('Your nickname').fill('Boss');
    const create = page.getByRole('button', { name: /create room/i });

    await page.getByRole('button', { name: /Screen Break/ }).click();
    await page.getByRole('button', { name: /AI & Tech/ }).click();
    await page.getByRole('button', { name: /Corporate Survival/ }).click();
    await page.getByRole('button', { name: /Rewind/ }).click();
    await page.getByRole('button', { name: /Extremely Online/ }).click();
    await page.getByRole('button', { name: /Fuel/ }).click();

    await expect(create).toBeDisabled();
  });

  test('question mix total updates as counts change', async ({ page }) => {
    await page.goto('/host/new');
    await expect(page.getByText(/12 questions/)).toBeVisible();

    const plusButtons = page.getByRole('button', { name: '+' });
    await plusButtons.first().click();
    await expect(page.getByText(/13 questions/)).toBeVisible();
  });
});
