import { test, expect, type Browser, type Page } from '@playwright/test';

/**
 * A two-question room with a host and one joiner, sitting in the lobby.
 *
 * Copied verbatim from e2e/countdown.spec.ts (M3 P5a) — every spec in this
 * suite carries its own preamble rather than sharing one, which is the house
 * pattern.
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

/** Every focusable control must have a non-empty accessible name. */
async function unnamedControls(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const out: string[] = [];
    const selector = 'button, a[href], input:not([type="hidden"]), select, textarea, [tabindex]:not([tabindex="-1"])';
    for (const el of Array.from(document.querySelectorAll(selector))) {
      if ((el as HTMLElement).offsetParent === null) continue; // not rendered
      const name =
        el.getAttribute('aria-label') ??
        el.getAttribute('title') ??
        (el as HTMLElement).innerText ??
        '';
      if (name.trim() === '') out.push(el.outerHTML.slice(0, 120));
    }
    return out;
  });
}

test('the landing page is operable and named', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('main')).toHaveCount(1);
  expect(await unnamedControls(page)).toEqual([]);

  // Tab reaches every control in visual order. If the first stop turns out to
  // be something else (a browser-inserted stop, a control this plan did not
  // know about), that is a finding to RECORD, not a reason to add tabindex.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: /host a game/i })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(page.getByLabel('Room code')).toBeFocused();

  // Join is `disabled` until a 5-character code exists (app/page.tsx's
  // `ready`), so a browser correctly removes it from the tab order — the same
  // restriction a mouse user faces, not a keyboard gap. Type a code first,
  // the same way filling the field precedes a click for anyone.
  await page.keyboard.type('ABCDE');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('button', { name: /^join$/i })).toBeFocused();
});

test('a player can join and answer without a pointer', async ({ browser }) => {
  const { host, joiner } = await twoPlayerLobby(browser);
  await host.getByRole('button', { name: /start the race/i }).click();

  const option = joiner.getByTestId('answer-option').first();
  await expect(option).toBeEnabled({ timeout: 30_000 });

  // The documented 1-4 shortcut (components/AnswerButtons.tsx).
  await joiner.keyboard.press('2');
  await expect(joiner.getByTestId('answer-option').nth(1)).toHaveAttribute('data-locked', 'true');
});

test('the readable layer survives 200% text without a horizontal scrollbar', async ({ browser }) => {
  const { host, joiner } = await twoPlayerLobby(browser);
  await joiner.setViewportSize({ width: 390, height: 844 }); // a small phone
  await joiner.addStyleTag({ content: 'html { font-size: 32px !important; }' });

  await host.getByRole('button', { name: /start the race/i }).click();
  await expect(joiner.getByTestId('answer-option').first()).toBeVisible({ timeout: 30_000 });

  const overflow = await joiner.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
});

test('prefers-reduced-motion selects the reduced profile', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce' });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-profile', 'reduced');
});

test('the canvas is hidden from assistive technology on both surfaces', async ({ browser }) => {
  const { joiner, code } = await twoPlayerLobby(browser);
  await expect(joiner.getByTestId('pixi-stage')).toHaveAttribute('aria-hidden', 'true');

  const tv = await (await browser.newContext()).newPage();
  await tv.goto(`/stage/${code}`);
  await expect(tv.getByTestId('pixi-stage')).toHaveAttribute('aria-hidden', 'true');
  // The broadcast surface deliberately has no <main>: the player surface owns
  // the landmark (components/StageShell.tsx).
  await expect(tv.locator('main')).toHaveCount(0);
});
