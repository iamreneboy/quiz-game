import { test, expect, type Page } from '@playwright/test';

/**
 * Walk the wizard down to `questions` tier-1 questions and stop on the review
 * step. `playing` is the ⚠️ conflict's switch (ADR-0040): it decides whether
 * the server puts answers in the payload at all.
 */
async function createAndReview(host: Page, questions: number, playing: boolean) {
  await host.goto('/host/new');

  const minusButtons = host.getByRole('button', { name: '−' });
  const clicksPerTier = [4 - questions, 4, 3, 1]; // 4,4,3,1 -> questions,0,0,0
  for (let i = 0; i < clicksPerTier.length; i++) {
    for (let c = 0; c < clicksPerTier[i]; c++) await minusButtons.nth(i).click();
  }
  await expect(host.getByText(new RegExp(`^${questions} questions`))).toBeVisible();

  const timerSlider = host.locator('input[type=range]');
  await timerSlider.evaluate((el: HTMLInputElement) => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    setter.call(el, '5');
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(host.getByText('Answer timer: 5s')).toBeVisible();

  await host.getByPlaceholder('Your nickname').fill('Hosty');
  if (!playing) await host.getByLabel(/I'm playing too/).uncheck();
  await host.getByRole('button', { name: /create room/i }).click();

  await expect(host).toHaveURL(/\/host\/[A-Z0-9]{5}\/review$/);
  return host.url().split('/')[4];
}

test('a racing host reviews the draw and never receives an answer', async ({ page }) => {
  const code = await createAndReview(page, 3, true);

  await expect(page.getByTestId('draw-card')).toHaveCount(3);
  await expect(page.getByTestId('draw-total')).toContainText('3 questions');
  await expect(page.getByTestId('draw-answers-hidden')).toBeVisible();

  // Design Pillar 2 as the host actually experiences it: not one card marks an
  // answer, and not one carries a fun-fact (which gives the answer away). The
  // stronger claim — that `correct_index` is not in the PAYLOAD at all — is
  // asserted in scripts/smoke.mjs, where the JSON is in hand; a DOM check here
  // could not fail even if the key arrived.
  await expect(page.getByTestId('draw-correct')).toHaveCount(0);
  await expect(page.getByTestId('draw-fun-fact')).toHaveCount(0);

  // The QR encodes the join link (PRD §5.1 step 1).
  await expect(page.getByTestId('join-qr'))
    .toHaveAttribute('aria-label', new RegExp(`/room/${code}$`));

  // Veto is swap: the prompt changes, the difficulty does not.
  const first = page.getByTestId('draw-card').first();
  const before = await first.getByTestId('draw-prompt').innerText();
  await first.getByTestId('draw-swap').click();
  await expect(first.getByTestId('draw-prompt')).not.toHaveText(before);
  await expect(page.getByTestId('draw-card')).toHaveCount(3);

  // Keyboard operability is an acceptance criterion, not a later pass.
  const openLobby = page.getByTestId('draw-open-lobby');
  await openLobby.focus();
  await expect(openLobby).toBeFocused();
  await openLobby.press('Enter');
  await expect(page).toHaveURL(new RegExp(`/room/${code}$`));
  await expect(page.getByText('Starting grid')).toBeVisible();
  await expect(page.getByTestId('join-qr')).toBeVisible();
  await expect(page.getByTestId('lobby-review-link')).toBeVisible();
});

test('an MC-only host is trusted with the answers and the fun facts', async ({ page }) => {
  await createAndReview(page, 3, false);

  await expect(page.getByTestId('draw-card')).toHaveCount(3);
  await expect(page.getByTestId('draw-answers-hidden')).toHaveCount(0);
  // Exactly one marked answer per card, and the fun-facts the MC reads aloud.
  await expect(page.getByTestId('draw-correct')).toHaveCount(3);
  await expect(page.getByTestId('draw-fun-fact')).toHaveCount(3);
});

test('a custom question is added, replaces the draw, and plays', async ({ page, browser }) => {
  test.setTimeout(90_000);
  const host = page;
  const code = await createAndReview(host, 1, true);

  await host.getByTestId('draw-add-toggle').click();
  await expect(host.getByTestId('draw-add-form')).toBeVisible();

  // Submitting an incomplete draft is answered locally, with no round trip.
  await host.getByTestId('draw-add-submit').click();
  await expect(host.getByTestId('draw-add-error')).toHaveText(/write the question/i);

  await host.getByLabel('The question').fill('Which mug on the third shelf is haunted?');
  // exact: true — "Option A" is otherwise a substring match of the sibling
  // radio's "Option A is correct" label, a strict-mode violation.
  await host.getByLabel('Option A', { exact: true }).fill('The chipped one');
  await host.getByLabel('Option B', { exact: true }).fill('The tall one');
  await host.getByLabel('Option C', { exact: true }).fill('The novelty one');
  await host.getByLabel('Option D', { exact: true }).fill('None of them');
  await host.getByLabel('Option C is correct').check();
  await host.getByTestId('draw-add-submit').click();

  await expect(host.getByTestId('draw-card')).toHaveCount(2);
  await expect(host.getByTestId('draw-total')).toContainText('2 questions');
  await expect(host.getByTestId('draw-custom-badge')).toHaveCount(1);

  // Remove the bank question so the custom one is the whole race.
  const bank = host.getByTestId('draw-card').filter({ hasNot: host.getByTestId('draw-custom-badge') });
  await bank.getByTestId('draw-remove').click();
  await expect(host.getByTestId('draw-card')).toHaveCount(1);
  await expect(host.getByTestId('draw-total')).toContainText('1 question ·');
  await expect(host.getByTestId('draw-custom-badge')).toHaveCount(1);

  await host.getByTestId('draw-open-lobby').click();
  await expect(host.getByText('Starting grid')).toBeVisible();

  const joinerContext = await browser.newContext();
  const joiner = await joinerContext.newPage();
  await joiner.goto(`/room/${code}`);
  await joiner.getByPlaceholder('Your nickname').fill('Joiner');
  await joiner.getByRole('button', { name: 'Join game' }).click();
  await expect(host.getByText('Starting grid — 2 joined')).toBeVisible();

  await host.getByRole('button', { name: /start the race/i }).click();

  // The host's own question is the one the room is asked (PRD §7: merged into
  // the draw, not kept beside it).
  await expect(joiner.getByTestId('question-prompt'))
    .toHaveText('Which mug on the third shelf is haunted?', { timeout: 20_000 });

  await joinerContext.close();
});
