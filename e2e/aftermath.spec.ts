import { test, expect, type Page } from '@playwright/test';

/**
 * More than one context throughout: a rematch is a thing the host does TO
 * everybody else's screen, and awards have to be legible from a racer's own
 * device, not just the host's.
 *
 * The awards test fields FOUR racers who between them pick all four options.
 * The draw is random and the seed spreads `correct_index` across every option,
 * so "click the first one" scores about a third of the time — and a race
 * nobody scored in hands out nothing at all (migration 0008), which would make
 * this test flaky by construction rather than by timing. Covering the grid
 * makes exactly one answer correct, so all three awards a one-round race can
 * hand out go to one known racer, with no tie and no tiebreak. Late Surge is
 * absent either way: one round has no halves to compare.
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

/**
 * Answer the one round and land on the ceremony.
 *
 * Which option is correct is unknowable before the reveal, and this helper's
 * callers do not care: the rematch test needs a finished race, not a scored
 * one.
 */
async function playOneRound(winner: Page) {
  const options = winner.getByTestId('answer-option');
  await expect(options.first()).toBeEnabled({ timeout: 30_000 });
  await options.first().click();
  await expect(winner.getByTestId('results-board')).toBeVisible({ timeout: 60_000 });
}

test('the awards land on every screen and name the right racer', async ({ page, browser }) => {
  test.setTimeout(180_000);
  const host = page;
  const code = await createRoom(host, 1, 20);

  const names = ['One', 'Two', 'Three'];
  const contexts = [];
  const joiners: Page[] = [];
  for (const name of names) {
    const ctx = await browser.newContext();
    const joiner = await ctx.newPage();
    await join(joiner, code, name);
    contexts.push(ctx);
    joiners.push(joiner);
  }

  const stageContext = await browser.newContext();
  const stage = await stageContext.newPage();
  await stage.goto(`/stage/${code}`);

  await expect(host.getByText('Starting grid — 4 joined')).toBeVisible({ timeout: 30_000 });
  await host.getByRole('button', { name: /start the race/i }).click();

  // One racer per option. Exactly one of them is right, so every award this
  // race can hand out has a single, known winner.
  const racers = [host, ...joiners];
  for (const racer of racers) {
    await expect(racer.getByTestId('answer-option').first()).toBeEnabled({ timeout: 30_000 });
  }
  await Promise.all(racers.map((racer, i) => racer.getByTestId('answer-option').nth(i).click()));

  // The ceremony. The board arrives first; the awards are the coda behind it.
  const witness = joiners[0];
  await expect(witness.getByTestId('results-board')).toBeVisible({ timeout: 60_000 });
  await expect(witness.getByTestId('awards')).toHaveAttribute('data-entered', 'true', {
    timeout: 30_000,
  });
  await expect(host.getByTestId('awards')).toBeVisible();
  await expect(stage.getByTestId('awards')).toBeVisible({ timeout: 30_000 });

  // A one-round race can hand out at most three: Late Surge has no halves.
  await expect(witness.getByTestId('award')).not.toHaveCount(0);
  await expect(witness.locator('[data-award="late-surge"]')).toHaveCount(0);

  // Every award names a racer who is actually in this room, and — because
  // exactly one answer was correct — the same one every time.
  const winners = await witness.getByTestId('award-winner').allInnerTexts();
  expect(winners.length).toBeGreaterThan(0);
  for (const name of winners) expect(['Hosty', ...names]).toContain(name);
  expect(new Set(winners).size).toBe(1);

  // Nothing is shared, so the tie copy must not appear.
  await expect(witness.getByTestId('awards')).not.toContainText('shared');

  // A reload lands on the settled card, with no entrance to replay.
  await witness.reload();
  await expect(witness.getByTestId('awards')).toHaveAttribute('data-entered', 'true', {
    timeout: 30_000,
  });

  for (const ctx of contexts) await ctx.close();
  await stageContext.close();
});

test('a rematch returns the same players to a fresh lobby with a new question',
  async ({ page, browser }) => {
    test.setTimeout(180_000);
    const host = page;
    const code = await createRoom(host, 1, 8);

    const joinerContext = await browser.newContext();
    const joiner = await joinerContext.newPage();
    await join(joiner, code, 'Joiner');

    await expect(host.getByText('Starting grid — 2 joined')).toBeVisible();
    await host.getByRole('button', { name: /start the race/i }).click();

    await expect(joiner.getByTestId('question-prompt')).toBeVisible({ timeout: 30_000 });
    const firstPrompt = await joiner.getByTestId('question-prompt').innerText();
    await playOneRound(joiner);

    // The host runs it back, with a tweaked timer.
    await host.getByTestId('rematch').click();
    const slider = host.getByTestId('rematch-timer');
    await slider.evaluate((el: HTMLInputElement) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
      setter.call(el, '15');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await expect(host.getByText('Answer timer: 15s')).toBeVisible();
    await host.getByTestId('rematch-confirm').click();

    // BOTH screens land back on the starting grid — this is the assertion a
    // single context cannot make.
    await expect(host.getByText('Starting grid — 2 joined')).toBeVisible({ timeout: 30_000 });
    await expect(joiner.getByText('Starting grid — 2 joined')).toBeVisible({ timeout: 30_000 });
    await expect(joiner.getByText('Waiting for the host to start…')).toBeVisible();
    // Nobody re-joined: the join gate never came back.
    await expect(joiner.getByPlaceholder('Your nickname')).toHaveCount(0);
    // And the last race is off the screen, not merely covered by the lobby.
    await expect(joiner.getByTestId('results-board')).toHaveCount(0);
    await expect(joiner.getByTestId('awards')).toHaveCount(0);

    // Race 2, on a question the room has not been asked.
    await host.getByRole('button', { name: /start the race/i }).click();
    await expect(joiner.getByTestId('question-prompt')).toBeVisible({ timeout: 30_000 });
    await expect(joiner.getByTestId('question-prompt')).not.toHaveText(firstPrompt);

    await joinerContext.close();
  });
