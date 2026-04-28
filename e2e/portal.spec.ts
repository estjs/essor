import { expect, test } from '@playwright/test';
import { getExampleUrl } from './test-utils';

test.describe('Portal example', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(getExampleUrl('portal'));
    // Wait until the portal has mounted children somewhere on the page.
    await page.waitForSelector('[data-test="portal-content"]');
  });

  test('teleports children into the primary target on mount', async ({ page }) => {
    await expect(page.locator('#portal-target [data-test="portal-content"]')).toHaveText(
      'Hello, World!',
    );
    // Origin section contains only the marker, not the portal content.
    await expect(page.locator('#origin [data-test="portal-content"]')).toHaveCount(0);
  });

  test('updates teleported content reactively when input changes', async ({ page }) => {
    await page.fill('[data-test="value-input"]', 'reactive update');
    await expect(page.locator('#portal-target [data-test="portal-content"]')).toHaveText(
      'reactive update',
    );
  });

  test('disabled toggle moves children inline next to the origin', async ({ page }) => {
    await page.click('[data-test="toggle-disabled"]');
    // Inline render: portal-target loses the content, origin gains it.
    await expect(page.locator('#portal-target [data-test="portal-content"]')).toHaveCount(0);
    await expect(page.locator('#origin [data-test="portal-content"]')).toHaveText('Hello, World!');

    // Toggle back: returns to the target.
    await page.click('[data-test="toggle-disabled"]');
    await expect(page.locator('#origin [data-test="portal-content"]')).toHaveCount(0);
    await expect(page.locator('#portal-target [data-test="portal-content"]')).toHaveText(
      'Hello, World!',
    );
  });

  test('switching target re-mounts into the new element', async ({ page }) => {
    await page.click('[data-test="toggle-target"]');

    await expect(page.locator('#portal-target [data-test="portal-content"]')).toHaveCount(0);
    await expect(page.locator('#alt-target [data-test="portal-content"]')).toHaveText(
      'Hello, World!',
    );

    // Reactive content still updates after re-mount.
    await page.fill('[data-test="value-input"]', 'after switch');
    await expect(page.locator('#alt-target [data-test="portal-content"]')).toHaveText(
      'after switch',
    );
  });

  test('only one Portal copy of the content exists at any time', async ({ page }) => {
    // Sanity invariant covering all routes: across CSR mount, target switch,
    // and disabled toggle, we must never have >1 [data-test="portal-content"]
    // node anywhere in the document. This catches any regression that would
    // duplicate DOM (e.g. forgetting to detach before re-mounting, or
    // hydration adopting the wrong block).
    const countAll = () => page.locator('[data-test="portal-content"]').count();

    expect(await countAll()).toBe(1);

    await page.click('[data-test="toggle-target"]');
    expect(await countAll()).toBe(1);

    await page.click('[data-test="toggle-disabled"]');
    expect(await countAll()).toBe(1);

    await page.click('[data-test="toggle-disabled"]');
    expect(await countAll()).toBe(1);

    await page.click('[data-test="toggle-target"]');
    expect(await countAll()).toBe(1);
  });
});
