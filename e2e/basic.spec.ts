import { expect, test } from '@playwright/test';

test('should work with basic router navigation', async ({ page }) => {
  await page.goto('http://localhost:3001');
  const inner = await page.textContent('p');
  await expect(inner?.trim()).toBe('1');
  const test = 'test';
  await page.fill('input', test);
  const inner2 = await page.textContent('p');
  await expect(inner2?.trim()).toBe('test');
});
