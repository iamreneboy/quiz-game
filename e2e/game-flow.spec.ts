import { test, expect, type Page } from '@playwright/test';

// Drives a full two-player game with a single tier-1 question so the whole
// countdown -> read -> answer -> reveal -> track -> results loop completes quickly.
test('two players play a full round from lobby to results', async ({ page, browser }) => {
  test.setTimeout(60_000);
  const host = page;
  await host.goto('/host/new');

  // Question mix: exactly one Warm-Up question, minimum timer.
  const minusButtons = host.getByRole('button', { name: '−' });
  const clicksPerTier = [3, 4, 3, 1]; // 4,4,3,1 -> 1,0,0,0
  for (let i = 0; i < clicksPerTier.length; i++) {
    for (let c = 0; c < clicksPerTier[i]; c++) await minusButtons.nth(i).click();
  }
  await expect(host.getByText(/^1 questions/)).toBeVisible();

  const timerSlider = host.locator('input[type=range]');
  await timerSlider.evaluate((el: HTMLInputElement) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, '5');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(host.getByText('Answer timer: 5s')).toBeVisible();

  await host.getByPlaceholder('Your nickname').fill('Hosty');
  await host.getByRole('button', { name: /create room/i }).click();

  await expect(host).toHaveURL(/\/room\/[A-Z0-9]{5}$/);
  const code = host.url().split('/').pop()!;

  await expect(host.getByText('Starting grid')).toBeVisible();
  const startButton = host.getByRole('button', { name: /start the race|need at least 2 players/i });
  await expect(startButton).toBeDisabled();

  // Second player joins from a separate browser context (own localStorage).
  const joinerContext = await browser.newContext();
  const joiner = await joinerContext.newPage();
  await joiner.goto(`/room/${code}`);
  await joiner.getByPlaceholder('Your nickname').fill('Joiner');
  await joiner.getByRole('button', { name: 'Join game' }).click();
  await expect(joiner.getByText('Starting grid')).toBeVisible();

  await expect(host.getByText('Starting grid — 2 joined')).toBeVisible();
  await expect(startButton).toBeEnabled();
  await startButton.click();

  await Promise.all([answerRound(host, 'Hosty'), answerRound(joiner, 'Joiner')]);

  await expect(host.getByText('Race complete')).toBeVisible({ timeout: 20_000 });
  await expect(joiner.getByText('Race complete')).toBeVisible({ timeout: 20_000 });

  await expect(host.getByRole('row', { name: /Hosty/ })).toBeVisible();
  await expect(host.getByRole('row', { name: /Joiner/ })).toBeVisible();

  await joinerContext.close();
});

async function answerRound(p: Page, label: string) {
  // countdown
  await expect(p.getByText(/^[123]$/)).toBeVisible({ timeout: 10_000 });
  // read
  await expect(p.getByText('Get ready…')).toBeVisible({ timeout: 10_000 });
  // answer: lock in the first option
  const firstOption = p.locator('main button').first();
  await expect(firstOption).toBeEnabled({ timeout: 10_000 });
  await firstOption.click();
  await expect(p.getByText('Locked in!')).toBeVisible();
  // reveal
  await expect(p.getByText('Correct answer')).toBeVisible({ timeout: 10_000 });
  // track
  await expect(p.getByText(/The track — after Q1/)).toBeVisible({ timeout: 10_000 });
  void label;
}
