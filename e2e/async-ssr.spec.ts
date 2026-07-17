import { expect, getExampleUrl, test } from './test-utils';

// ---------------------------------------------------------------------------
// async-ssr — renderToStringAsync end-to-end
//
// The example's server entry awaits a fake data source (~120ms) inside an
// async root component under renderToStringAsync, provides the data after
// the await, and serializes it into the document for client hydration.
// ---------------------------------------------------------------------------

test.describe('async-ssr (renderToStringAsync + hydration)', () => {
  test('raw SSR HTML contains resolved data and never the Suspense fallback', async ({ page }) => {
    const response = await page.request.get(getExampleUrl('async-ssr'));
    expect(response.ok()).toBe(true);

    const html = await response.text();

    // Data resolved on the server before serialization — all todos shipped.
    expect(html).toContain('Fetch data on the server');
    expect(html).toContain('Provide it after an await');
    expect(html).toContain('Hydrate the same markup on the client');
    expect(html).toContain('data-test="ssr-item"');

    // renderToStringAsync awaits the tree first, so the fallback never ships.
    expect(html).not.toContain('Loading…');
    expect(html).not.toContain('data-test="fallback"');

    // Serialized page data for client-side provide().
    expect(html).toContain('window.__ASYNC_SSR_DATA__');
  });

  test('hydrates and stays interactive: increment updates the counter', async ({
    page,
    examplePage,
  }) => {
    await examplePage('async-ssr');

    await expect(page.locator('[data-test="ssr-item"]')).toHaveCount(3);
    await expect(page.locator('[data-test="counter"]')).toHaveText('0');

    await page.locator('[data-test="increment"]').click();
    await expect(page.locator('[data-test="counter"]')).toHaveText('1');

    await page.locator('[data-test="increment"]').click();
    await expect(page.locator('[data-test="counter"]')).toHaveText('2');
  });

  test('hydrates without console errors', async ({ page, examplePage, assertNoConsoleErrors }) => {
    await examplePage('async-ssr');

    await expect(page.locator('[data-test="ssr-item"]')).toHaveCount(3);
    // Interact once so hydration-driven handlers actually run before asserting.
    await page.locator('[data-test="increment"]').click();
    await expect(page.locator('[data-test="counter"]')).toHaveText('1');

    await assertNoConsoleErrors();
  });
});
