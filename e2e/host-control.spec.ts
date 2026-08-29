import { test, expect, type Page } from '@playwright/test';

/**
 * Two contexts throughout: the host's command has to be observed on somebody
 * else's screen, which is the one thing a single-context test cannot show.
 */
async function createRoom(host: Page, questions: number, timerSeconds: number) {
  await host.goto('/host/new');

  // The four tier steppers start at 4,4,3,1. Walk them down to the count asked
  // for, all in tier 1, so the game is short and the draw is deterministic.
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

test('a pause freezes every surface at the same beat, and a resume continues it', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const host = page;
  // 20s answers so there is room to pause mid-ANSWER and read the frozen ring.
  const code = await createRoom(host, 2, 20);

  const joinerContext = await browser.newContext();
  const joiner = await joinerContext.newPage();
  await joiner.goto(`/room/${code}`);
  await joiner.getByPlaceholder('Your nickname').fill('Joiner');
  await joiner.getByRole('button', { name: 'Join game' }).click();

  const stageContext = await browser.newContext();
  const stage = await stageContext.newPage();
  await stage.goto(`/stage/${code}`);

  await expect(host.getByText('Starting grid — 2 joined')).toBeVisible();
  await host.getByRole('button', { name: /start the race/i }).click();

  // Get into ANSWER on the joiner, which is where the freeze has to be visible.
  const options = joiner.getByTestId('answer-option');
  await expect(options.first()).toBeEnabled({ timeout: 20_000 });

  const ringBefore = await joiner.getByRole('timer').innerText();
  await host.getByTestId('host-pause').click();

  // The card lands on all three surfaces.
  await expect(joiner.getByTestId('pause-card')).toBeVisible({ timeout: 10_000 });
  await expect(host.getByTestId('pause-card')).toBeVisible();
  await expect(stage.getByTestId('pause-card')).toBeVisible({ timeout: 10_000 });

  // FROZEN, not settled: the ring still shows a number, and the same one two
  // seconds later. A settled beat would blank it (secondsLeft null) instead.
  const ringAtPause = await joiner.getByRole('timer').innerText();
  expect(Number(ringAtPause)).toBeGreaterThan(0);
  expect(Number(ringAtPause)).toBeLessThanOrEqual(Number(ringBefore));
  await joiner.waitForTimeout(2_000);
  await expect(joiner.getByRole('timer')).toHaveText(ringAtPause);

  // Answers are refused while paused — including the window-level 1-4 shortcut.
  await expect(options.first()).toBeDisabled();
  await joiner.keyboard.press('2');
  await expect(options.nth(1)).not.toHaveAttribute('data-locked', 'true');

  // Resume continues from the frozen remainder; no beat replays.
  await host.getByTestId('host-resume').click();
  await expect(joiner.getByTestId('pause-card')).toBeHidden({ timeout: 10_000 });
  await expect(stage.getByTestId('pause-card')).toBeHidden();
  await expect(options.first()).toBeEnabled();
  await expect(joiner.locator('[data-testid="stage-shell"][data-beat="answer"]')).toBeVisible();

  await options.first().click();
  await expect(options.first()).toHaveAttribute('data-locked', 'true');

  await stageContext.close();
  await joinerContext.close();
});

test('skipping a question shortens the track for everyone', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const host = page;
  const code = await createRoom(host, 3, 20);

  const joinerContext = await browser.newContext();
  const joiner = await joinerContext.newPage();
  await joiner.goto(`/room/${code}`);
  await joiner.getByPlaceholder('Your nickname').fill('Joiner');
  await joiner.getByRole('button', { name: 'Join game' }).click();

  await expect(host.getByText('Starting grid — 2 joined')).toBeVisible();
  await host.getByRole('button', { name: /start the race/i }).click();

  // Wait for a live question, then read the prompt so the swap is provable.
  await expect(joiner.getByTestId('answer-option').first()).toBeEnabled({ timeout: 20_000 });
  await expect(joiner.getByText('Q1/3')).toBeVisible();
  const before = await joiner.getByTestId('question-prompt').innerText();

  await host.getByTestId('host-skip').click();

  // The load-bearing assertion: the round NUMBER is reused and the denominator
  // drops, which is exactly ADR-0038's shortening. QuestionCard's badge row is
  // mounted for the whole of READ/ANSWER/REVEAL, so this cannot false-pass on a
  // detached element the way a `not.toHaveText` on the prompt can — the prompt
  // itself is absent for the first 460ms of the READ stagger.
  await expect(joiner.getByText('Q1/2')).toBeVisible({ timeout: 10_000 });

  // ...and the question really was replaced, not just relabelled. Filtered by
  // the OLD text rather than located as a single element: AnimatePresence
  // briefly overlaps the exiting and entering <h2>, both carrying this same
  // data-testid, so a bare getByTestId here is a strict-mode race.
  const prompt = joiner.getByTestId('question-prompt').filter({ hasNotText: before });
  await expect(prompt).toBeVisible({ timeout: 10_000 });

  await joinerContext.close();
});

test('ending the race takes every surface to the ceremony', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const host = page;
  const code = await createRoom(host, 3, 20);

  const joinerContext = await browser.newContext();
  const joiner = await joinerContext.newPage();
  await joiner.goto(`/room/${code}`);
  await joiner.getByPlaceholder('Your nickname').fill('Joiner');
  await joiner.getByRole('button', { name: 'Join game' }).click();

  await expect(host.getByText('Starting grid — 2 joined')).toBeVisible();
  await host.getByRole('button', { name: /start the race/i }).click();

  await expect(joiner.getByTestId('answer-option').first()).toBeEnabled({ timeout: 20_000 });
  await joiner.getByTestId('answer-option').first().click();

  // The confirmation is a real gate: the first click ends nothing.
  await host.getByTestId('host-end').click();
  await expect(host.getByTestId('host-end-confirm')).toBeVisible();
  await host.getByTestId('host-end-cancel').click();
  await expect(host.getByTestId('host-end-confirm')).toBeHidden();
  await expect(joiner.getByTestId('results-board')).toHaveCount(0);

  await host.getByTestId('host-end').click();
  await host.getByTestId('host-end-confirm').click();

  await expect(host.getByTestId('results-board')).toBeAttached({ timeout: 20_000 });
  await expect(joiner.getByTestId('results-board')).toBeAttached({ timeout: 20_000 });
  await expect(joiner.getByTestId('results-row')).toHaveCount(2);
  // The strip retires with the race.
  await expect(host.getByTestId('host-strip')).toHaveCount(0);

  await joinerContext.close();
});
