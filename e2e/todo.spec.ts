import { expect, test } from '@playwright/test';
import { getExampleUrl } from './test-utils';

test('should work with basic router navigation', async ({ page }) => {
  await page.goto(getExampleUrl('todo'));

  const input = await page.$('input');

  await page.fill('input', 'todo-1');
  await page.getByText('Add').click();
  const inner = await page.textContent('ul > li:first-child span');
  expect(inner?.trim()).toBe('todo-1');
  expect(await input?.inputValue()).toBe('');

  await page.fill('input', 'todo-2');
  await page.getByText('Add').click();
  const inner2 = await page.textContent('ul > li:last-child span');
  expect(inner2?.trim()).toBe('todo-2');
  expect(await input?.inputValue()).toBe('');

  await page.getByText('del-1').click();
  const inner3 = await page.textContent('ul > li:first-child span');
  expect(inner3?.trim()).toBe('todo-1');
  const inner4 = await page.textContent('ul > li:last-child span');
  expect(inner4?.trim()).toBe('todo-1');
});
