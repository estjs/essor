import { expect, test } from '@playwright/test';
import { getExampleUrl } from './test-utils';

test('should work with basic router navigation', async ({ page }) => {
  await page.goto(getExampleUrl('basic'));
  const inner = await page.textContent('p');
  await expect(inner?.trim()).toBe('Hello, World!');
  const test = 'test';
  await page.fill('input', test);
  const inner2 = await page.textContent('p');
  await expect(inner2?.trim()).toBe('test');
});
