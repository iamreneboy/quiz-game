import { test, expect } from '@playwright/test';

test('the answer lock is keyboard-operable and survives a reload', async ({ page, browser }) => {
  test.setTimeout(60_000);
  const host = page;
  await host.goto('/host/new');

  const minusButtons = host.getByRole('button', { name: '−' });
  const clicksPerTier = [3, 4, 3, 1]; // 4,4,3,1 -> 1,0,0,0
  for (let i = 0; i < clicksPerTier.length; i++) {
    for (let c = 0; c < clicksPerTier[i]; c++) await minusButtons.nth(i).click();
  }
  await expect(host.getByText(/^1 questions/)).toBeVisible();

  // The slider's range is [5, 20] (app/host/new/page.tsx) -- 30 clamps silently.
  const timerSlider = host.locator('input[type=range]');
  await timerSlider.evaluate((el: HTMLInputElement) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, '20');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(host.getByText('Answer timer: 20s')).toBeVisible();

  await host.getByPlaceholder('Your nickname').fill('Hosty');
  await host.getByRole('button', { name: /create room/i }).click();
  await expect(host).toHaveURL(/\/room\/[A-Z0-9]{5}$/);
  const code = host.url().split('/').pop()!;

  const joinerContext = await browser.newContext();
  const joiner = await joinerContext.newPage();
  await joiner.goto(`/room/${code}`);
  await joiner.getByPlaceholder('Your nickname').fill('Joiner');
  await joiner.getByRole('button', { name: 'Join game' }).click();
  await expect(joiner.getByText('Starting grid')).toBeVisible();

  await expect(host.getByText('Starting grid — 2 joined')).toBeVisible();
  await host.getByRole('button', { name: /start the race/i }).click();

  // READ shows the options but refuses input — the server phase is the only
  // interaction authority (spec decision 1).
  const options = joiner.getByTestId('answer-option');
  await expect(joiner.locator('[data-testid="stage-shell"][data-beat="read"]')).toBeVisible({ timeout: 15_000 });
  await expect(options.first()).toBeDisabled();

  // ANSWER: the 1-4 shortcut locks the matching option.
  await expect(options.first()).toBeEnabled({ timeout: 15_000 });
  await joiner.keyboard.press('2');
  await expect(options.nth(1)).toHaveAttribute('data-locked', 'true');

  // The other three go disabled, and the lock is announced.
  await expect(options.nth(0)).toBeDisabled();
  await expect(options.nth(2)).toBeDisabled();
  await expect(joiner.getByTestId('stage-announcer')).toContainText('Locked in:');

  // The lock survives a reload — no re-enabled buttons, no 'already answered'.
  await joiner.reload();
  const afterReload = joiner.getByTestId('answer-option');
  await expect(afterReload.nth(1)).toHaveAttribute('data-locked', 'true', { timeout: 15_000 });
  await expect(afterReload.nth(0)).toBeDisabled();

  await joinerContext.close();
});

test('a full round stages the reveal distribution and the track rail', async ({ page, browser }) => {
  test.setTimeout(60_000);
  const host = page;
  await host.goto('/host/new');

  const minusButtons = host.getByRole('button', { name: '−' });
  const clicksPerTier = [3, 4, 3, 1]; // 4,4,3,1 -> 1,0,0,0
  for (let i = 0; i < clicksPerTier.length; i++) {
    for (let c = 0; c < clicksPerTier[i]; c++) await minusButtons.nth(i).click();
  }
  await expect(host.getByText(/^1 questions/)).toBeVisible();

  // Minimum timer: this test waits straight through to REVEAL and TRACK in
  // one assertion each (unlike the reload test above), so it needs the beats
  // to close quickly rather than the long window a lock-survives-reload check wants.
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

  const joinerContext = await browser.newContext();
  const joiner = await joinerContext.newPage();
  await joiner.goto(`/room/${code}`);
  await joiner.getByPlaceholder('Your nickname').fill('Joiner');
  await joiner.getByRole('button', { name: 'Join game' }).click();
  await expect(joiner.getByText('Starting grid')).toBeVisible();

  await expect(host.getByText('Starting grid — 2 joined')).toBeVisible();
  await host.getByRole('button', { name: /start the race/i }).click();

  // REVEAL: the options became result rows in place, and the correct one is
  // marked. The buttons are the same nodes -- they never unmounted.
  // Unlike the chained per-beat waits elsewhere in this file, this single
  // assertion covers the full countdown+read+answer run (3+3+5s), so it
  // needs a wider budget than one beat's worth.
  await expect(joiner.getByText('Correct answer')).toBeVisible({ timeout: 25_000 });
  await expect(joiner.getByTestId('answer-option')).toHaveCount(4);
  await expect(joiner.getByText('correct', { exact: true })).toBeVisible();

  // TRACK: the shell keeps the beat, the rail carries every player as text.
  await expect(
    joiner.locator('[data-testid="stage-shell"][data-beat="track"]'),
  ).toBeVisible({ timeout: 15_000 });
  await expect(joiner.getByTestId('rail-entry')).toHaveCount(2);
  await expect(joiner.getByText(/The track — after Q1/)).toBeVisible();

  await joinerContext.close();
});
