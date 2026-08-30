import { test, expect, type Page } from '@playwright/test';

/**
 * The host's own context is created explicitly rather than taken from the
 * `page` fixture, because this spec has to KILL the host's tab and then bring
 * it back with its localStorage intact — the session is what makes it the host,
 * so a fresh context would come back as a stranger.
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

test('losing the host pauses every other surface, and getting them back resumes it', async ({ browser }) => {
  test.setTimeout(180_000);

  const hostContext = await browser.newContext();
  let host = await hostContext.newPage();
  // 20s answers so the freeze has a visible remainder to hold.
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

  const options = joiner.getByTestId('answer-option');
  await expect(options.first()).toBeEnabled({ timeout: 30_000 });
  const ringBefore = Number(await joiner.getByRole('timer').innerText());
  expect(ringBefore).toBeGreaterThan(0);

  // The host's tab dies. Its heartbeat stops; the joiner is the only remaining
  // player, so it is the elected sweeper.
  await host.close();

  // The pause lands on every remaining surface, and says WHICH pause it is.
  const joinerCard = joiner.getByTestId('pause-card');
  await expect(joinerCard).toBeVisible({ timeout: 40_000 });
  await expect(joinerCard).toHaveAttribute('data-reason', 'absence');
  await expect(joinerCard).toContainText(/host disconnected/i);

  const stageCard = stage.getByTestId('pause-card');
  await expect(stageCard).toBeVisible({ timeout: 40_000 });
  await expect(stageCard).toHaveAttribute('data-reason', 'absence');

  // FROZEN, not settled: the ring still shows a number, and the same one two
  // seconds later. Answers are refused.
  const ringAtPause = await joiner.getByRole('timer').innerText();
  expect(Number(ringAtPause)).toBeGreaterThan(0);
  await joiner.waitForTimeout(2_000);
  await expect(joiner.getByRole('timer')).toHaveText(ringAtPause);
  await expect(options.first()).toBeDisabled();

  // The host comes back, in the SAME context, so the session is intact.
  host = await hostContext.newPage();
  await host.goto(`/room/${code}`);

  // Its first heartbeat clears host_absent; the resume rides straight behind.
  await expect(joinerCard).toBeHidden({ timeout: 40_000 });
  await expect(stageCard).toBeHidden({ timeout: 20_000 });
  await expect(options.first()).toBeEnabled({ timeout: 20_000 });

  // The beat CONTINUED — it did not replay. The ring picks up at or below where
  // it froze, never back at the top.
  const ringAfter = Number(await joiner.getByRole('timer').innerText());
  expect(ringAfter).toBeLessThanOrEqual(Number(ringAtPause));

  // ...and the round is still the one it was.
  await expect(joiner.getByText('Q1/2')).toBeVisible();

  // The race still finishes normally from here.
  await options.first().click();
  await expect(options.first()).toHaveAttribute('data-locked', 'true');

  await stageContext.close();
  await joinerContext.close();
  await hostContext.close();
});

test('a deliberate pause is never auto-resumed out from under the host', async ({ browser }) => {
  test.setTimeout(120_000);

  const hostContext = await browser.newContext();
  const host = await hostContext.newPage();
  const code = await createRoom(host, 2, 20);

  const joinerContext = await browser.newContext();
  const joiner = await joinerContext.newPage();
  await joiner.goto(`/room/${code}`);
  await joiner.getByPlaceholder('Your nickname').fill('Joiner');
  await joiner.getByRole('button', { name: 'Join game' }).click();

  await expect(host.getByText('Starting grid — 2 joined')).toBeVisible();
  await host.getByRole('button', { name: /start the race/i }).click();
  await expect(joiner.getByTestId('answer-option').first()).toBeEnabled({ timeout: 30_000 });

  await host.getByTestId('host-pause').click();

  const card = joiner.getByTestId('pause-card');
  await expect(card).toBeVisible({ timeout: 20_000 });
  await expect(card).toHaveAttribute('data-reason', 'host');
  await expect(card).toContainText(/paused/i);

  // Four heartbeats and four sweep ticks later it is still paused, because the
  // host is right there.
  await joiner.waitForTimeout(15_000);
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('data-reason', 'host');

  await host.getByTestId('host-resume').click();
  await expect(card).toBeHidden({ timeout: 20_000 });

  await joinerContext.close();
  await hostContext.close();
});
