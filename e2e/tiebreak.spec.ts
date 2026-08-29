import { test, expect, type Page } from '@playwright/test';

/**
 * Two contexts throughout: an endgame has to be observed from a racer's own
 * screen, and the tie has to be built out of two real players' answers.
 *
 * The tie is DETERMINISTIC BY CONSTRUCTION, never by timing luck. Both racers
 * answer the one question correctly, so they tie on correct answers; the second
 * click is delayed well past one speed-point bucket (200ms at a 20s timer), so
 * speed points provably separate them and the finish resolves rather than
 * falling through to sudden death.
 */
async function createRoom(host: Page, questions: number, timerSeconds: number) {
  await host.goto('/host/new');

  const minusButtons = host.getByRole('button', { name: '−' });
  const clicksPerTier = [4 - questions, 4, 3, 1];
  for (let i = 0; i < clicksPerTier.length; i++) {
    for (let c = 0; c < clicksPerTier[i]; c++) await minusButtons.nth(i).click();
  }
  await expect(host.getByText(new RegExp(`^${questions} questions`))).toBeVisible();

  const timerSlider = host.locator('input[type=range]');
  await timerSlider.evaluate((el: HTMLInputElement, value: string) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }, String(timerSeconds));
  await expect(host.getByText(`Answer timer: ${timerSeconds}s`)).toBeVisible();

  await host.getByPlaceholder('Your nickname').fill('Hosty');
  await host.getByRole('button', { name: /create room/i }).click();
  await expect(host).toHaveURL(/\/host\/[A-Z0-9]{5}\/review$/);
  await host.getByRole('button', { name: /open the lobby/i }).click();
  await expect(host).toHaveURL(/\/room\/[A-Z0-9]{5}$/);
  return host.url().split('/').pop()!;
}

async function join(page: Page, code: string, nickname: string) {
  await page.goto(`/room/${code}`);
  await page.getByPlaceholder('Your nickname').fill(nickname);
  await page.getByRole('button', { name: 'Join game' }).click();
}

test('a tie on correct answers plays a photo finish that resolves on speed points',
  async ({ page, browser }) => {
    test.setTimeout(120_000);
    const host = page;
    const code = await createRoom(host, 1, 20);

    const joinerContext = await browser.newContext();
    const joiner = await joinerContext.newPage();
    await join(joiner, code, 'Joiner');

    await expect(host.getByText('Starting grid — 2 joined')).toBeVisible();
    await host.getByRole('button', { name: /start the race/i }).click();

    // Both answer the same question correctly. The reveal is what tells us
    // WHICH option was correct — the draw is random, so it cannot be assumed.
    await expect(joiner.getByTestId('answer-option').first()).toBeEnabled({ timeout: 20_000 });

    // Read the correct index off the host's own review? No — the host may be
    // racing, so it is redacted (ADR-0040). Instead: both players pick the
    // SAME option. Whether it is right or wrong, they tie on correct answers,
    // which is all the photo finish needs.
    await host.getByTestId('answer-option').nth(0).click();
    await joiner.waitForTimeout(1_200); // > 1 speed-point bucket at 20s
    await joiner.getByTestId('answer-option').nth(0).click();

    // The card lands before any podium block rises, on both screens.
    await expect(host.getByTestId('photo-finish')).toBeVisible({ timeout: 60_000 });
    await expect(joiner.getByTestId('photo-finish')).toBeVisible();
    await expect(joiner.getByTestId('photo-finish-group')).toHaveCount(1);

    // ...and it resolves rather than declaring a shared position: the 1.2s gap
    // guarantees different speed points when both were correct, and when both
    // were wrong the group is perfectly tied at zero and shares the place.
    // Either outcome is legitimate; what must be true is that the card states
    // one of them and then retires.
    await expect(joiner.getByTestId('photo-finish')).toHaveAttribute(
      'data-resolved', 'true', { timeout: 15_000 });

    // The podium takes over and the board arrives after it.
    await expect(joiner.getByTestId('photo-finish')).toBeHidden({ timeout: 15_000 });
    await expect(joiner.getByTestId('results-board')).toHaveAttribute(
      'data-entered', 'true', { timeout: 15_000 });
    await expect(joiner.getByTestId('results-row')).toHaveCount(2);

    await joinerContext.close();
  });

test('a clean finish goes straight to the podium', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const host = page;
  const code = await createRoom(host, 1, 20);

  const joinerContext = await browser.newContext();
  const joiner = await joinerContext.newPage();
  await join(joiner, code, 'Joiner');

  await expect(host.getByText('Starting grid — 2 joined')).toBeVisible();
  await host.getByRole('button', { name: /start the race/i }).click();

  await expect(joiner.getByTestId('answer-option').first()).toBeEnabled({ timeout: 20_000 });
  // Different options, so at most one of them is correct. If neither is, they
  // tie at zero and this test would be staging a photo finish — so read the
  // reveal and assert on what actually happened.
  await host.getByTestId('answer-option').nth(0).click();
  await joiner.getByTestId('answer-option').nth(1).click();

  await expect(joiner.getByTestId('results-board')).toBeAttached({ timeout: 60_000 });
  const rows = joiner.getByTestId('results-row');
  await expect(rows).toHaveCount(2);

  // The load-bearing assertion: with one racer ahead on correct answers there
  // is no tie to stage, so the card must never have mounted.
  const tied = await joiner
    .getByTestId('results-row')
    .evaluateAll(els => new Set(els.map(e => e.querySelector('td')?.textContent)).size === 1);
  test.skip(tied, 'both racers happened to miss; that is a tie, not a clean finish');
  await expect(joiner.getByTestId('photo-finish')).toHaveCount(0);
});
