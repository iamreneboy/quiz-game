import { test, expect, type Page } from '@playwright/test';

/**
 * Two contexts throughout. A drop is only observable from SOMEBODY ELSE'S
 * browser, which is the one thing a single-context test cannot show.
 *
 * WHAT IS DELIBERATELY NOT HERE: reclaim-by-nickname. Its gate is twenty
 * consecutive host reports at three seconds apiece — a real minute of wall
 * clock — so it is covered at the SQL level in scripts/smoke.mjs, which can
 * call report_presence twenty times in a loop. What IS covered here is the
 * path a real player actually takes: a reload, which keeps localStorage and so
 * never needs reclaim at all.
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

test('a racer who leaves the lobby shows as reconnecting on everybody else’s screen', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const host = page;
  const code = await createRoom(host, 2, 20);

  const joinerContext = await browser.newContext();
  const joiner = await joinerContext.newPage();
  await join(joiner, code, 'Vanisher');

  await expect(host.getByText('Starting grid — 2 joined')).toBeVisible();
  await expect(host.getByTestId('connection-chip')).toHaveCount(0);

  // The tab dies. Presence leaves the channel within the socket's own timeout.
  await joinerContext.close();

  const chip = host.getByTestId('connection-chip');
  await expect(chip).toHaveCount(1, { timeout: 30_000 });
  await expect(chip).toHaveAttribute('data-state', 'reconnecting');
  await expect(chip).toHaveText(/reconnecting/i);
});

test('a mid-game reload keeps the racer, their key and their score', async ({ page, browser }) => {
  test.setTimeout(120_000);
  const host = page;
  const code = await createRoom(host, 2, 20);

  const joinerContext = await browser.newContext();
  const joiner = await joinerContext.newPage();
  await join(joiner, code, 'Reloader');

  await expect(host.getByText('Starting grid — 2 joined')).toBeVisible();
  await host.getByRole('button', { name: /start the race/i }).click();

  const options = joiner.getByTestId('answer-option');
  await expect(options.first()).toBeEnabled({ timeout: 30_000 });
  await options.first().click();
  await expect(options.first()).toHaveAttribute('data-locked', 'true');

  // The tab reloads. localStorage survives, so there is no JoinGate to pass
  // and no reclaim to perform — the session simply still works.
  await joiner.reload();
  await expect(joiner.getByPlaceholder('Your nickname')).toHaveCount(0);
  await expect(joiner.getByTestId('stage-shell')).toBeVisible({ timeout: 30_000 });

  // The lock the server holds is restored, not lost.
  await expect(joiner.getByTestId('answer-option').first())
    .toHaveAttribute('data-locked', 'true', { timeout: 30_000 });

  // And nobody thinks they are gone.
  await expect(host.getByTestId('connection-chip')).toHaveCount(0, { timeout: 30_000 });

  await joinerContext.close();
});

test('a browser arriving at round 2 spectates, then races marked late', async ({ page, browser }) => {
  test.setTimeout(150_000);
  const host = page;
  // Three questions, and an answer window wide enough that a browser opened
  // from scratch is provably still inside ROUND 1's ANSWER when it lands — the
  // spectator copy renders only during that phase, so a short timer makes this
  // a race between a page load and the phase clock rather than a test of the
  // behaviour. Round 2 still arrives ~32s in, well inside the budget below.
  const code = await createRoom(host, 3, 20);

  const earlyContext = await browser.newContext();
  const early = await earlyContext.newPage();
  await join(early, code, 'Early');

  await expect(host.getByText('Starting grid — 2 joined')).toBeVisible();
  await host.getByRole('button', { name: /start the race/i }).click();

  // Wait for a live question so the room is provably past the lobby.
  await expect(early.getByTestId('answer-option').first()).toBeEnabled({ timeout: 30_000 });

  const lateContext = await browser.newContext();
  const late = await lateContext.newPage();
  await join(late, code, 'Tardy');

  // A late joiner is a spectator: the options never become enabled for them,
  // and the surface says why.
  await expect(late.getByText(/in from the next question/i)).toBeVisible({ timeout: 30_000 });

  // ...and by the next round they are racing.
  await expect(late.getByTestId('answer-option').first()).toBeEnabled({ timeout: 60_000 });
  await expect(late.getByText('Q2/3')).toBeVisible();

  // The mark survives, on the readable layer, on somebody else's screen.
  await expect(host.getByTestId('late-badge').first()).toBeVisible({ timeout: 60_000 });

  await lateContext.close();
  await earlyContext.close();
});
