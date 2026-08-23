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

  test('collapses to a strip during the question and reopens at the track', async ({ page, browser }) => {
    test.setTimeout(60_000);
    const host = page;
    await host.goto('/host/new');

    // Question mix: exactly one Warm-Up question, minimum timer (mirrors game-flow.spec.ts).
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

    const joinerContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const joiner = await joinerContext.newPage();
    await joiner.goto(`/room/${code}`);
    await joiner.getByPlaceholder('Your nickname').fill('Joiner');
    await joiner.getByRole('button', { name: 'Join game' }).click();
    await expect(joiner.getByText('Starting grid')).toBeVisible();

    await expect(host.getByText('Starting grid — 2 joined')).toBeVisible();
    await expect(startButton).toBeEnabled();
    await startButton.click();

    const stage = host.locator('[data-testid="pixi-stage"]');

    // read/answer/reveal: the world collapses to the strip band.
    await expect(host.getByText(/^[123]$/)).toBeVisible({ timeout: 10_000 });
    await expect(host.locator('[data-testid="stage-shell"][data-beat="read"]')).toBeVisible({ timeout: 10_000 });

    const firstOption = host.getByTestId('answer-option').first();
    await expect(firstOption).toBeEnabled({ timeout: 10_000 });
    await firstOption.click();
    await expect(firstOption).toHaveAttribute('data-locked', 'true');

    await expect(host.getByText('Correct answer')).toBeVisible({ timeout: 10_000 });
    await expect(stage).toHaveAttribute('data-band', 'strip');

    // track: the world reopens to full height.
    await expect(host.getByText(/The track — after Q1/)).toBeVisible({ timeout: 10_000 });
    await expect(stage).toHaveAttribute('data-band', 'full');

    await joinerContext.close();
  });
});

// The lobby's readable half (spec §7): the Pixi start line carries the
// formation, the HTML strip carries the names.
test.describe('the lobby roster strip', () => {
  test('lists joined players as text over the full-bleed canvas grid', async ({ page, browser }) => {
    const host = page;
    await host.goto('/host/new');
    await host.getByPlaceholder('Your nickname').fill('Hosty');
    await host.getByRole('button', { name: /create room/i }).click();
    await expect(host).toHaveURL(/\/room\/[A-Z0-9]{5}$/);
    const code = host.url().split('/').pop()!;

    await expect(host.getByText('Starting grid')).toBeVisible();

    const joinerContext = await browser.newContext();
    const joiner = await joinerContext.newPage();
    await joiner.goto(`/room/${code}`);
    await joiner.getByPlaceholder('Your nickname').fill('Roster');
    await joiner.getByRole('button', { name: 'Join game' }).click();

    await expect(host.getByText('Starting grid — 2 joined')).toBeVisible();
    await expect(host.getByTestId('lobby-roster')).toContainText('Hosty');
    await expect(host.getByTestId('lobby-roster')).toContainText('Roster');

    // The world is full-bleed in the lobby — the grid is the establishing shot.
    await expect(host.locator('[data-testid="pixi-stage"]')).toHaveAttribute('data-band', 'full');

    await joinerContext.close();
  });
});
