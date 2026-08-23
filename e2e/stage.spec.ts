import { test, expect, type Page } from '@playwright/test';

/**
 * Create a one-question room and return its code. Mirrors the preamble in
 * e2e/staging.spec.ts — one question keeps a full game inside the timeout.
 */
async function createRoom(host: Page, nickname: string): Promise<string> {
  await host.goto('/host/new');

  const minusButtons = host.getByRole('button', { name: '−' });
  const clicksPerTier = [3, 4, 3, 1]; // 4,4,3,1 -> 1,0,0,0
  for (let i = 0; i < clicksPerTier.length; i++) {
    for (let c = 0; c < clicksPerTier[i]; c++) await minusButtons.nth(i).click();
  }
  await expect(host.getByText(/^1 questions/)).toBeVisible();

  await host.getByPlaceholder('Your nickname').fill(nickname);
  await host.getByRole('button', { name: /create room/i }).click();
  await expect(host).toHaveURL(/\/room\/[A-Z0-9]{5}$/);
  return host.url().split('/').pop()!;
}

test('the stage view follows a live game without a session', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const host = page;
  const code = await createRoom(host, 'Hosty');

  const joinerContext = await browser.newContext();
  const joiner = await joinerContext.newPage();
  await joiner.goto(`/room/${code}`);
  await joiner.getByPlaceholder('Your nickname').fill('Joiner');
  await joiner.getByRole('button', { name: 'Join game' }).click();
  await expect(host.getByText('Starting grid — 2 joined')).toBeVisible();

  // A THIRD context with no session at all: the stage view must never ask it
  // to join.
  const stageContext = await browser.newContext();
  const stage = await stageContext.newPage();
  await stage.goto(`/stage/${code}`);

  await expect(stage.getByPlaceholder('Your nickname')).toHaveCount(0);
  await expect(stage.getByTestId('stage-gate')).toBeVisible();
  await stage.getByTestId('stage-gate').click();
  await expect(stage.getByTestId('stage-gate')).toHaveCount(0);

  // Lobby: the TV is the join surface.
  await expect(stage.getByTestId('stage-join')).toBeVisible();
  await expect(stage.getByTestId('stage-join')).toContainText(code);

  await host.getByRole('button', { name: /start the race/i }).click();

  const broadcast = stage.getByTestId('stage-broadcast');
  await expect(broadcast).toHaveAttribute('data-beat', 'read', { timeout: 20_000 });
  await expect(stage.getByTestId('stage-question')).toBeVisible();

  // ANSWER: four option tiles, none of them a control.
  await expect(broadcast).toHaveAttribute('data-beat', 'answer', { timeout: 20_000 });
  await expect(stage.getByTestId('stage-option')).toHaveCount(4);
  await expect(stage.getByTestId('stage-band').getByRole('button')).toHaveCount(0);
  await expect(stage.getByTestId('stage-band').getByRole('link')).toHaveCount(0);

  await joiner.getByTestId('answer-option').first().click();

  // REVEAL: the options grid becomes the distribution in place.
  await expect(broadcast).toHaveAttribute('data-beat', 'reveal', { timeout: 20_000 });
  await expect(stage.locator('[data-testid="stage-option"][data-correct="true"]')).toHaveCount(1);

  // TRACK, then the ceremony.
  await expect(broadcast).toHaveAttribute('data-beat', 'track', { timeout: 20_000 });
  await expect(broadcast).toHaveAttribute('data-beat', 'results', { timeout: 30_000 });
  await expect(stage.getByTestId('stage-results')).toBeVisible();

  // A reload past the settled ceremony lands entered, never animating in.
  await stage.reload();
  await stage.getByTestId('stage-gate').click();
  await expect(stage.getByTestId('stage-results')).toHaveAttribute('data-entered', 'true', {
    timeout: 20_000,
  });

  await stageContext.close();
  await joinerContext.close();
});

test('the stage view ignores a session for the room it is watching', async ({ page }) => {
  test.setTimeout(60_000);
  const host = page;
  const code = await createRoom(host, 'Hosty');

  // Same context, same storage: the host's own session for this room is
  // present. Opening the stage link here must still produce a broadcast, not
  // a second player view (spec decision 1).
  await host.goto(`/stage/${code}`);

  await expect(host.getByTestId('stage-gate')).toBeVisible();
  await host.getByTestId('stage-gate').click();

  await expect(host.getByTestId('stage-join')).toBeVisible();
  // No player affordances leak in: no join form, no start button, no answers.
  await expect(host.getByPlaceholder('Your nickname')).toHaveCount(0);
  await expect(host.getByRole('button', { name: /start the race/i })).toHaveCount(0);
  await expect(host.getByTestId('answer-option')).toHaveCount(0);
});

test('an unknown room code reads as a typo, not as a hang', async ({ page }) => {
  await page.goto('/stage/ZZZZZ');
  await expect(page.getByTestId('stage-missing')).toBeVisible({ timeout: 20_000 });
  await expect(page.getByTestId('stage-missing')).toContainText('ZZZZZ');
});

test('the host can reach the stage view from the lobby', async ({ page }) => {
  test.setTimeout(60_000);
  const host = page;
  const code = await createRoom(host, 'Hosty');

  const link = host.getByTestId('stage-link');
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', `/stage/${code}`);
});
