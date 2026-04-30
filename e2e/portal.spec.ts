import { expect, test } from './test-utils';

test.describe('portal example', () => {
  test.beforeEach(async ({ examplePage }) => {
    await examplePage('portal');
  });

  test('teleports the note into the primary target and keeps it reactive', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Portal Example' })).toBeVisible();
    await expect(page.locator('#primary-target [data-test="portal-card"]')).toBeVisible();
    await expect(page.locator('#origin-panel [data-test="portal-card"]')).toHaveCount(0);

    await page.getByLabel('Note').fill('Review deployment checklist');

    await expect(page.locator('#primary-target [data-test="portal-text"]')).toHaveText(
      'Review deployment checklist',
    );
  });

  test('can render inline when the portal is disabled', async ({ page }) => {
    await page.getByRole('button', { name: 'Render inline' }).click();

    await expect(page.locator('#primary-target [data-test="portal-card"]')).toHaveCount(0);
    await expect(page.locator('#origin-panel [data-test="portal-card"]')).toBeVisible();

    await page.getByRole('button', { name: 'Render off-site' }).click();
    await expect(page.locator('#origin-panel [data-test="portal-card"]')).toHaveCount(0);
    await expect(page.locator('#primary-target [data-test="portal-card"]')).toBeVisible();
  });

  test('switches targets without duplicating the teleported content', async ({
    page,
    assertNoConsoleErrors,
  }) => {
    const countCards = () => page.locator('[data-test="portal-card"]').count();

    expect(await countCards()).toBe(1);

    await page.getByRole('button', { name: 'Move to secondary target' }).click();

    await expect(page.locator('#primary-target [data-test="portal-card"]')).toHaveCount(0);
    await expect(page.locator('#secondary-target [data-test="portal-card"]')).toBeVisible();
    expect(await countCards()).toBe(1);

    await page.getByLabel('Note').fill('Moved to the secondary target');
    await expect(page.locator('#secondary-target [data-test="portal-text"]')).toHaveText(
      'Moved to the secondary target',
    );

    await assertNoConsoleErrors();
  });
});
