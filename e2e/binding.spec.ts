import { type Page, expect, test } from './test-utils';

async function readSummary(page: Page) {
  const json = await page.locator('[data-test="binding-summary"]').textContent();
  return JSON.parse(json || '{}') as {
    name: string;
    age: string | number;
    subscribed: boolean;
    theme: string;
    focusAreas: string[];
    progress: number;
    fileCount: number;
  };
}

test.describe('binding example', () => {
  test.beforeEach(async ({ examplePage }) => {
    await examplePage('binding');
  });

  test('syncs text, number, and checkbox bindings', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'Binding Example' })).toBeVisible();

    await page.getByLabel('Name').fill('Avery');
    await page.getByLabel('Age').fill('34');
    await page.getByLabel('Subscribe to release notes').check();

    await expect(page.locator('[data-test="binding-signature"]')).toHaveText('Avery · 34');

    const summary = await readSummary(page);
    expect(summary.name).toBe('Avery');
    expect(summary.age).toBe(34);
    expect(summary.subscribed).toBe(true);
  });

  test('syncs select, range, and file bindings', async ({ page, assertNoConsoleErrors }) => {
    await page.getByLabel('Theme').selectOption('night');
    await page.getByLabel('Focus areas').selectOption(['portal', 'hydrate']);
    await page.getByLabel('Progress').fill('82');
    await page.locator('input[type="file"]').setInputFiles([
      { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('notes') },
      { name: 'summary.json', mimeType: 'application/json', buffer: Buffer.from('{"ok":true}') },
    ]);

    const summary = await readSummary(page);
    expect(summary.theme).toBe('night');
    expect(summary.focusAreas).toEqual(['portal', 'hydrate']);
    expect(String(summary.progress)).toBe('82');
    expect(summary.fileCount).toBe(2);

    await assertNoConsoleErrors();
  });
});
