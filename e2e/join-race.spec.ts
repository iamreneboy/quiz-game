import { test, expect } from '@playwright/test';

/**
 * The lobby roster is built from ONE fire-and-forget client broadcast: the
 * joiner announces itself on `player_joined`, and nothing else ever tells the
 * host a player arrived. That announcement is issued from a click handler,
 * which closes over the room channel at the render that created it — so if the
 * joiner's realtime subscription has not completed by the time the button is
 * clicked, the handler captures a null channel and the announcement is dropped
 * for good, however ready the channel becomes a moment later.
 *
 * Against the local stack the websocket handshake is ~10ms and always wins, so
 * this is invisible; against a remote project it is a round trip and the click
 * wins routinely. That is why the whole cross-client suite failed against the
 * cloud project while passing locally (M3 P2a tech debt).
 *
 * The latency here is what makes that ordering deterministic rather than
 * lucky: the joiner's click needs no round trip, the subscription needs one.
 */
test('a joiner whose channel is still connecting still reaches the lobby roster',
  async ({ page, browser }) => {
    test.setTimeout(60_000);
    const host = page;
    await host.goto('/host/new');
    await host.getByPlaceholder('Your nickname').fill('Hosty');
    await host.getByRole('button', { name: /create room/i }).click();
    await expect(host).toHaveURL(/\/host\/[A-Z0-9]{5}\/review$/);
    await host.getByRole('button', { name: /open the lobby/i }).click();
    await expect(host).toHaveURL(/\/room\/[A-Z0-9]{5}$/);
    const code = host.url().split('/').pop()!;
    await expect(host.getByText('Starting grid')).toBeVisible();

    const joinerContext = await browser.newContext();
    const joiner = await joinerContext.newPage();

    // Push the realtime handshake behind the click: the button is clickable as
    // soon as the page hydrates, but the subscription needs a round trip.
    const cdp = await joinerContext.newCDPSession(joiner);
    await cdp.send('Network.enable');
    await cdp.send('Network.emulateNetworkConditions', {
      offline: false,
      downloadThroughput: -1,
      uploadThroughput: -1,
      latency: 600,
    });

    await joiner.goto(`/room/${code}`);
    await joiner.getByPlaceholder('Your nickname').fill('Joiner');
    await joiner.getByRole('button', { name: 'Join game' }).click();

    await expect(host.getByText('Starting grid — 2 joined')).toBeVisible({ timeout: 20_000 });
    await expect(host.getByTestId('lobby-roster')).toContainText('Joiner');

    await joinerContext.close();
  });
