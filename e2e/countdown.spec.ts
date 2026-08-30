import { test, expect, type Browser, type Page } from '@playwright/test';

/**
 * A two-question room with a host and one joiner, sitting in the lobby.
 *
 * The stepper walk mirrors e2e/host-control.spec.ts: the four tiers start at
 * 4,4,3,1 and are walked down to 2,0,0,0 so a whole game fits in the timeout.
 */
async function twoPlayerLobby(browser: Browser): Promise<{ host: Page; joiner: Page; code: string }> {
  const host = await (await browser.newContext()).newPage();
  await host.goto('/host/new');

  const minus = host.getByRole('button', { name: '−' });
  const clicksPerTier = [2, 4, 3, 1]; // 4,4,3,1 -> 2,0,0,0
  for (let i = 0; i < clicksPerTier.length; i++) {
    for (let c = 0; c < clicksPerTier[i]; c++) await minus.nth(i).click();
  }
  await expect(host.getByText(/^2 questions/)).toBeVisible();

  await host.getByPlaceholder('Your nickname').fill('Hosty');
  await host.getByRole('button', { name: /create room/i }).click();
  await expect(host).toHaveURL(/\/host\/[A-Z0-9]{5}\/review$/);
  await host.getByRole('button', { name: /open the lobby/i }).click();
  await expect(host).toHaveURL(/\/room\/[A-Z0-9]{5}$/);
  const code = host.url().split('/').pop()!;

  const joiner = await (await browser.newContext()).newPage();
  await joiner.goto(`/room/${code}`);
  await joiner.getByPlaceholder('Your nickname').fill('Joiner');
  await joiner.getByRole('button', { name: 'Join game' }).click();

  return { host, joiner, code };
}

test('the countdown counts down on the player surface', async ({ browser }) => {
  test.setTimeout(90_000);
  const { host, joiner } = await twoPlayerLobby(browser);

  await expect(host.getByText('Starting grid — 2 joined')).toBeVisible();
  await host.getByRole('button', { name: /start the race/i }).click();

  const numeral = joiner.getByTestId('countdown');
  await expect(numeral).toBeVisible({ timeout: 10_000 });
  await expect(numeral).toHaveAttribute('data-count', /^[123]$/);
  // It has to actually descend, not sit on one number.
  await expect(numeral).toHaveAttribute('data-count', '1', { timeout: 5_000 });
  // ...and then hand over to the question.
  await expect(joiner.getByTestId('stage-shell')).toBeVisible({ timeout: 10_000 });
});

test('a stage view opening mid-countdown joins it rather than restarting it', async ({ browser }) => {
  test.setTimeout(90_000);
  const { host, code } = await twoPlayerLobby(browser);
  await host.getByRole('button', { name: /start the race/i }).click();

  const tv = await (await browser.newContext()).newPage();
  await tv.goto(`/stage/${code}`);
  // components/stage/StageGate.tsx: the whole opaque overlay IS the button,
  // and it must be dismissed before anything behind it can be asserted on.
  const gate = tv.getByTestId('stage-gate');
  if (await gate.isVisible().catch(() => false)) await gate.click();

  const numeral = tv.getByTestId('countdown');
  await expect(numeral).toBeVisible({ timeout: 10_000 });
  // Never 3: it opened after the countdown had already begun.
  await expect(numeral).not.toHaveAttribute('data-count', '3');
});
