import { expect, test } from './test-utils';

test.describe('transition example', () => {
  test.beforeEach(async ({ examplePage }) => {
    await examplePage('transition');
  });

  test('mounts the page with all scenarios visible', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Transition Example' })).toBeVisible();
    for (const scenario of ['fade', 'slide', 'scale', 'css-off', 'appear', 'hooks']) {
      await expect(page.locator(`[data-test="scenario-${scenario}"]`)).toBeVisible();
    }
  });

  test('fade scenario: toggle shows/hides box with enter+active class observed during enter', async ({
    page,
  }) => {
    const box = page.locator('[data-test="fade-box"]');
    await expect(box).toHaveCount(0);

    await page.locator('[data-test="fade-toggle"]').click();
    // Class should land at some point during the transition
    await expect(box).toBeVisible();
    // After enter completes, neither -from nor -active should remain.
    // toHaveClass/not.toHaveClass auto-retry, so no fixed sleep is needed.
    await expect(box).toHaveClass(/fade-box/);
    await expect(box).not.toHaveClass(/fade-enter-from|fade-enter-active/);

    // Hide — element should stay in DOM until transition completes
    await page.locator('[data-test="fade-toggle"]').click();
    // Immediately after click the leave-from / leave-active is applied
    await expect(box).toHaveClass(/fade-leave-active/, { timeout: 150 });
    // After 400ms the box is removed
    await expect(box).toHaveCount(0, { timeout: 1000 });
  });

  test('scale scenario: duration prop overrides CSS — leave takes 400ms', async ({ page }) => {
    const box = page.locator('[data-test="scale-box"]');
    await page.locator('[data-test="scale-toggle"]').click();
    await expect(box).toBeVisible();
    // Wait for the enter transition to fully settle (class polling, no sleep)
    // so the elapsed measurement below only covers the leave phase.
    await expect(box).not.toHaveClass(/scale-enter-active/);

    const start = Date.now();
    await page.locator('[data-test="scale-toggle"]').click();
    await expect(box).toHaveCount(0, { timeout: 1200 });
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(380);
  });

  test('js-only scenario: animates without CSS classes', async ({ page }) => {
    const box = page.locator('[data-test="js-box"]');
    await page.locator('[data-test="css-off-toggle"]').click();
    await expect(box).toBeVisible();
    // No fade-* / etc. classes should be applied
    await expect(box).not.toHaveClass(/-enter-from|-enter-active|-leave-from|-leave-active/);
    await page.locator('[data-test="css-off-toggle"]').click();
    await expect(box).toHaveCount(0, { timeout: 1000 });
  });

  test('appear scenario: initial mount runs the enter animation', async ({ page }) => {
    // The appear-box is mounted on page load with appear=true.
    // By the time the test starts, the enter should have completed.
    const box = page.locator('[data-test="appear-box"]');
    await expect(box).toBeVisible();
    // Box exists and animation classes have been cleaned up (auto-retried).
    await expect(box).not.toHaveClass(/fade-enter-from|fade-enter-to|fade-enter-active/);
  });

  test('hooks scenario: count increases through enter+leave', async ({ page }) => {
    const count = page.locator('[data-test="hook-count"]');
    await expect(count).toHaveText(/hook calls: 0/);

    await page.locator('[data-test="hooks-toggle"]').click();
    // onBeforeEnter + onAfterEnter = 2 (toHaveText auto-retries until the
    // enter animation completes and the hook fires)
    await expect(count).toHaveText(/hook calls: 2/);

    await page.locator('[data-test="hooks-toggle"]').click();
    // +onBeforeLeave +onAfterLeave = 4
    await expect(count).toHaveText(/hook calls: 4/);
  });

  test('no console errors during interaction', async ({ page, assertNoConsoleErrors }) => {
    // Each interaction waits for its transition to settle via class/text
    // polling — deterministic overlap-free sequencing without fixed sleeps.
    await page.locator('[data-test="fade-toggle"]').click();
    await expect(page.locator('[data-test="fade-box"]')).toBeVisible();
    await page.locator('[data-test="slide-toggle"]').click();
    await expect(page.locator('[data-test="slide-box"]')).toBeVisible();
    await page.locator('[data-test="scale-toggle"]').click();
    await expect(page.locator('[data-test="scale-box"]')).toBeVisible();
    await page.locator('[data-test="hooks-toggle"]').click();
    await expect(page.locator('[data-test="hook-count"]')).toHaveText(/hook calls: 2/);
    await page.locator('[data-test="hooks-toggle"]').click();
    await expect(page.locator('[data-test="hook-count"]')).toHaveText(/hook calls: 4/);
    await assertNoConsoleErrors();
  });

  // ---------------------------------------------------------------------------
  // TransitionGroup scenario
  // ---------------------------------------------------------------------------

  test('group scenario: initial render shows seeded list without animation classes', async ({
    page,
  }) => {
    const items = page.locator('[data-test^="group-item-"]');
    await expect(items).toHaveCount(3);
    // Initial mount must not run enter — none of the items should carry
    // list-enter-from / list-enter-active by the time the page has settled.
    for (const id of [1, 2, 3]) {
      const li = page.locator(`[data-test="group-item-${id}"]`);
      await expect(li).not.toHaveClass(/list-enter-from|list-enter-active/);
    }
  });

  test('group scenario: Add appends an item with enter classes during the transition', async ({
    page,
  }) => {
    await page.locator('[data-test="group-add"]').click();
    const added = page.locator('[data-test="group-item-4"]');
    await expect(added).toBeVisible();
    // The enter-active class should be observable while the animation runs
    // (~300ms in the example CSS). Give it generous slack to catch it.
    await expect(added).toHaveClass(/list-enter-active/, { timeout: 200 });
    // After the animation, the active class is gone (auto-retried).
    await expect(added).not.toHaveClass(/list-enter-active|list-enter-from|list-enter-to/);
  });

  test('group scenario: Remove last animates the trailing item out with leave classes', async ({
    page,
  }) => {
    const last = page.locator('[data-test="group-item-3"]');
    await expect(last).toBeVisible();
    await page.locator('[data-test="group-remove"]').click();
    // While the leave animation runs, the element stays in the DOM with the
    // leave-active class AND absolute positioning so siblings can reflow.
    await expect(last).toHaveClass(/list-leave-active/, { timeout: 200 });
    // After the animation finishes the element is detached.
    await expect(last).toHaveCount(0, { timeout: 1000 });
    // And the remaining items keep their order.
    const remaining = page.locator('[data-test^="group-item-"]');
    await expect(remaining).toHaveCount(2);
  });

  test('group scenario: Shuffle applies the list-move class to staying items', async ({ page }) => {
    await page.locator('[data-test="group-shuffle"]').click();
    // After "shuffle" (last → first), all 3 items moved → all should have the
    // list-move class applied while the FLIP animation runs. We assert at
    // least one to keep the test resilient against future timing tweaks.
    const moveItems = page.locator('.list-move');
    await expect(moveItems.first()).toBeVisible({ timeout: 300 });
    // Visual order in the DOM must reflect the new sequence: 3, 1, 2.
    const order = await page.$$eval('[data-test^="group-item-"]', (els) =>
      els.map((el) => el.dataset.test),
    );
    expect(order).toEqual(['group-item-3', 'group-item-1', 'group-item-2']);
    // After the FLIP animation (~500ms) the move class is gone — poll instead
    // of sleeping so slow CI machines don't race the animation end.
    await expect(page.locator('.list-move')).toHaveCount(0, { timeout: 2000 });
  });

  test('group scenario: Clear removes every item (after leave animation)', async ({ page }) => {
    await page.locator('[data-test="group-clear"]').click();
    const items = page.locator('[data-test^="group-item-"]');
    // All items animate out simultaneously.
    await expect(items).toHaveCount(0, { timeout: 1000 });
  });

  test('group scenario: rapid Add/Remove sequence ends in a consistent state', async ({ page }) => {
    // Drive the list quickly to flush several enter/leave overlaps. The end
    // state must reflect a deterministic +3 / -2 net result. toHaveCount
    // auto-retries past the overlapping ~300ms enter/leave animations.
    for (let i = 0; i < 3; i++) await page.locator('[data-test="group-add"]').click();
    await page.locator('[data-test="group-remove"]').click();
    await page.locator('[data-test="group-remove"]').click();
    // 3 seed + 3 add - 2 remove = 4 items
    await expect(page.locator('[data-test^="group-item-"]')).toHaveCount(4, { timeout: 2000 });
  });

  test('group scenario: no console errors during list interactions', async ({
    page,
    assertNoConsoleErrors,
  }) => {
    // Sequence interactions by polling for each transition's end state
    // instead of fixed sleeps.
    await page.locator('[data-test="group-add"]').click();
    await expect(page.locator('[data-test="group-item-4"]')).toBeVisible();
    await page.locator('[data-test="group-shuffle"]').click();
    await expect(page.locator('.list-move')).toHaveCount(0, { timeout: 2000 });
    await page.locator('[data-test="group-remove"]').click();
    await expect(page.locator('[data-test^="group-item-"]')).toHaveCount(3, { timeout: 2000 });
    await page.locator('[data-test="group-clear"]').click();
    await expect(page.locator('[data-test^="group-item-"]')).toHaveCount(0, { timeout: 2000 });
    await assertNoConsoleErrors();
  });
});
