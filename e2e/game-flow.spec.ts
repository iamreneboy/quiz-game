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
  // P0 exit criterion: the (empty) Pixi canvas mounts in the room view.
  await expect(host.locator('[data-testid="pixi-stage"] canvas')).toBeAttached();
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

  const board = host.getByTestId('results-board');
  await expect(board).toBeAttached({ timeout: 20_000 });

  // P5b decision 1 + decision 5: the complete field and the exit are available
  // from the FIRST frame of the ceremony, six seconds before the board enters.
  // Asserted here, immediately after the board attaches, precisely because the
  // beat has not landed yet — `data-entered` is the proof it has not.
  await expect(board).toHaveAttribute('data-entered', 'false', { timeout: 1_000 });
  await expect(board.getByTestId('results-row')).toHaveCount(2);

  const exit = host.getByRole('link', { name: 'Back to home' });
  await exit.focus();
  await expect(exit).toBeFocused();

  // Now let the ceremony reach its board beat.
  await expect(board).toHaveAttribute('data-entered', 'true', { timeout: 15_000 });

  await expect(host.getByText('Race complete')).toBeVisible();
  await expect(joiner.getByText('Race complete')).toBeVisible({ timeout: 20_000 });

  // Six spelled-out columns (spec §7), one row per playing player.
  await expect(host.getByTestId('results-table').locator('thead th')).toHaveCount(6);
  await expect(host.getByRole('row', { name: /Hosty/ })).toBeVisible();
  await expect(host.getByRole('row', { name: /Joiner/ })).toBeVisible();

  // The headline names whoever the table ranks first — which of the two wins is
  // decided by speed points and is not fixed by this test.
  const topName = await board.getByTestId('results-row').first()
    .getByTestId('player-name').innerText();
  await expect(host.getByTestId('winner-card')).toContainText(topName);

  await joinerContext.close();
});

async function answerRound(p: Page, label: string) {
  // countdown
  await expect(p.getByText(/^[123]$/)).toBeVisible({ timeout: 10_000 });
  // read — assert on the stable beat hook, never on copy
  await expect(p.locator('[data-testid="stage-shell"][data-beat="read"]')).toBeVisible({ timeout: 10_000 });
  // answer: lock in the first option
  const firstOption = p.getByTestId('answer-option').first();
  await expect(firstOption).toBeEnabled({ timeout: 10_000 });
  await firstOption.click();
  await expect(firstOption).toHaveAttribute('data-locked', 'true');
  // reveal
  await expect(p.getByText('Correct answer')).toBeVisible({ timeout: 10_000 });
  // track
  await expect(p.getByText(/The track — after Q1/)).toBeVisible({ timeout: 10_000 });
  void label;
}
