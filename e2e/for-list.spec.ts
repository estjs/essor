import { expect, test } from './test-utils';

test.describe('for-list example', () => {
  test.beforeEach(async ({ examplePage }) => {
    await examplePage('for-list');
  });

  test('renders both lists with the seeded rows', async ({ page, assertNoConsoleErrors }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'For List Example' })).toBeVisible();
    await expect(page.locator('[data-test="for-row"]')).toHaveCount(4);
    await expect(page.locator('[data-test="map-row"]')).toHaveCount(4);
    // Same content in both lists.
    await expect(page.locator('[data-test="for-row"]').first()).toHaveText('Alpha');
    await expect(page.locator('[data-test="map-row"]').first()).toHaveText('Alpha');
    await assertNoConsoleErrors();
  });

  test('add / prepend / remove keep both lists in sync', async ({ page }) => {
    await page.locator('[data-test="add"]').click();
    await expect(page.locator('[data-test="for-row"]')).toHaveCount(5);
    await expect(page.locator('[data-test="map-row"]')).toHaveCount(5);
    await expect(page.locator('[data-test="for-row"]').last()).toHaveText('Item 5');

    await page.locator('[data-test="prepend"]').click();
    await expect(page.locator('[data-test="for-row"]')).toHaveCount(6);
    await expect(page.locator('[data-test="for-row"]').first()).toHaveText('Item 6');
    await expect(page.locator('[data-test="map-row"]').first()).toHaveText('Item 6');

    await page.locator('[data-test="remove"]').click();
    await expect(page.locator('[data-test="for-row"]')).toHaveCount(5);
    await expect(page.locator('[data-test="map-row"]')).toHaveCount(5);
  });

  test('shuffle reuses <For> DOM nodes (stamps survive) and reorders content', async ({ page }) => {
    const collectFor = () =>
      page.$$eval('[data-test="for-row"]', (els) =>
        els.map((el) => ({
          label: el.textContent ?? '',
          stamp: el.dataset.mountedAt,
        })),
      );

    const before = await collectFor();
    const stampByLabel = new Map(before.map((r) => [r.label, r.stamp]));

    await page.locator('[data-test="shuffle"]').click();
    // Order must change (the example retries Fisher–Yates until it does).
    await expect
      .poll(async () => (await collectFor()).map((r) => r.label).join(','))
      .not.toBe(before.map((r) => r.label).join(','));

    // Every row's DOM node was REUSED: its creation stamp is unchanged.
    const after = await collectFor();
    for (const row of after) {
      expect(row.stamp).toBe(stampByLabel.get(row.label));
    }
  });

  test('refreshing item identity re-renders rows in both lists (documented semantics)', async ({
    page,
  }) => {
    // "Refresh labels" swaps every array entry for a NEW object (same id).
    // <For> matches by key but ALSO checks Object.is(item) — same-key/new-
    // identity rows are deliberately re-rendered so their row scope sees the
    // new data. Fresh stamps in BOTH lists prove that semantic; the node-
    // REUSE guarantee (shuffle test above) applies to same-identity moves.
    const collectStamps = (sel: string) =>
      page.$$eval(sel, (els) => els.map((el) => Number(el.dataset.mountedAt)));

    const maxStampBefore = Math.max(
      ...(await collectStamps('[data-test="for-row"]')),
      ...(await collectStamps('[data-test="map-row"]')),
    );

    await page.locator('[data-test="refresh"]').click();
    await expect(page.locator('[data-test="for-row"]').first()).toHaveText('Alpha*');
    await expect(page.locator('[data-test="map-row"]').first()).toHaveText('Alpha*');

    for (const stamp of await collectStamps('[data-test="for-row"]')) {
      expect(stamp).toBeGreaterThan(maxStampBefore);
    }
    for (const stamp of await collectStamps('[data-test="map-row"]')) {
      expect(stamp).toBeGreaterThan(maxStampBefore);
    }
  });

  test('emptying the list shows the <For> fallback', async ({ page, assertNoConsoleErrors }) => {
    for (let i = 0; i < 4; i++) {
      await page.locator('[data-test="remove"]').click();
    }
    await expect(page.locator('[data-test="for-row"]')).toHaveCount(0);
    await expect(page.locator('[data-test="for-empty"]')).toBeVisible();

    // Adding again replaces the fallback with rows.
    await page.locator('[data-test="add"]').click();
    await expect(page.locator('[data-test="for-empty"]')).toHaveCount(0);
    await expect(page.locator('[data-test="for-row"]')).toHaveCount(1);

    await assertNoConsoleErrors();
  });
});
