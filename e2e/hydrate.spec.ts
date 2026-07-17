import { getExampleUrl } from './example-registry';
import { expect, expectHydrated, markServerRenderedNode, test } from './test-utils';

test.describe('hydrate example', () => {
  test.beforeEach(async ({ examplePage }) => {
    await examplePage('hydrate');
  });

  test('hydrates the shell and applies preset note actions', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Hydrate Example' })).toBeVisible();
    await expect(page.locator('[data-test="hydration-status"]')).toHaveText('hydrated client');
    await expect(page.locator('[data-test="draft-preview"]')).toHaveText('No draft yet');

    await page.getByRole('button', { name: 'Load note' }).click();
    await expect(page.locator('[data-test="draft-preview"]')).toContainText(
      'Ship the client bundle',
    );
  });

  test('signal changes after hydration keep syncing the same DOM', async ({
    page,
    assertNoConsoleErrors,
  }) => {
    // Repeated state flips must keep updating the DOM — regression guard for
    // hydration leaving bindings inert after the first run.
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: 'Load note' }).click();
      await expect(page.locator('[data-test="draft-preview"]')).toContainText(
        'Ship the client bundle',
      );
      await page.getByRole('button', { name: 'Clear note' }).click();
      await expect(page.locator('[data-test="draft-preview"]')).toHaveText('No draft yet');
    }
    // aria-pressed reflects reactive state on the hydrated buttons too.
    await page.getByRole('button', { name: 'Show logs' }).click();
    await expect(page.getByRole('button', { name: 'Show logs' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByRole('button', { name: 'Show overview' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await assertNoConsoleErrors();
  });

  test('hydration reuses the server-rendered nodes instead of recreating them', async ({
    page,
    assertNoConsoleErrors,
  }) => {
    // Tag the server-shell heading BEFORE the client bundle runs; if
    // hydration replaced the node, the expando would be lost.
    await markServerRenderedNode(page, 'h1');

    await page.goto(getExampleUrl('hydrate'));
    await expect(page.locator('[data-test="hydration-status"]')).toHaveText('hydrated client');

    await expectHydrated(page, 'h1');

    await assertNoConsoleErrors();
  });

  test('switches panels without losing the shell', async ({ page, assertNoConsoleErrors }) => {
    await page.getByRole('button', { name: 'Show logs' }).click();
    await expect(page.locator('[data-test="logs-view"]')).toBeVisible();

    await page.getByRole('button', { name: 'Show overview' }).click();
    await expect(page.locator('[data-test="overview-view"]')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'Hydrate Example' })).toBeVisible();

    await assertNoConsoleErrors();
  });
});
