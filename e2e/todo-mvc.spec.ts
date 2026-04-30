import { type Locator, type Page, expect, test } from './test-utils';

function escapeRegExp(value: string) {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function todoItems(page: Page) {
  return page.locator('[data-test="todo-item"]');
}

function todoRow(page: Page, text: string): Locator {
  return page
    .locator('[data-test="todo-item"]')
    .filter({
      has: page.locator('[data-test="todo-title"]').filter({
        hasText: new RegExp(`^${escapeRegExp(text)}$`),
      }),
    })
    .first();
}

async function addTodo(page: Page, text: string, submit: 'button' | 'enter' = 'button') {
  await page.locator('[data-test="new-todo"]').fill(text);

  if (submit === 'enter') {
    await page.locator('[data-test="new-todo"]').press('Enter');
    return;
  }

  await page.getByRole('button', { name: 'Add' }).click();
}

test.describe('todo-mvc example', () => {
  test.beforeEach(async ({ examplePage }) => {
    await examplePage('todo-mvc');
  });

  test('adds todos with button and enter while keeping the count in sync', async ({
    page,
    assertNoConsoleErrors,
  }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'TodoMVC Example' })).toBeVisible();
    await expect(todoItems(page)).toHaveCount(0);
    await expect(page.locator('[data-test="remaining-count"]')).toHaveText('0 items left');

    await addTodo(page, 'Write docs');
    await addTodo(page, 'Ship release', 'enter');

    await expect(todoItems(page)).toHaveCount(2);
    await expect(todoRow(page, 'Write docs')).toBeVisible();
    await expect(todoRow(page, 'Ship release')).toBeVisible();
    await expect(page.locator('[data-test="remaining-count"]')).toHaveText('2 items left');

    await assertNoConsoleErrors();
  });

  test('toggles todos and filters all, active, and completed items', async ({
    page,
    assertNoConsoleErrors,
  }) => {
    await addTodo(page, 'First task');
    await addTodo(page, 'Second task');
    await addTodo(page, 'Third task');

    await todoRow(page, 'Second task').locator('[data-test="todo-toggle"]').click();

    await expect(page.locator('[data-test="remaining-count"]')).toHaveText('2 items left');

    await page.locator('[data-test="filter-active"]').click();
    await expect(todoItems(page)).toHaveCount(2);
    await expect(todoRow(page, 'First task')).toBeVisible();
    await expect(todoRow(page, 'Third task')).toBeVisible();
    await expect(todoRow(page, 'Second task')).toHaveCount(0);

    await page.locator('[data-test="filter-completed"]').click();
    await expect(todoItems(page)).toHaveCount(1);
    await expect(todoRow(page, 'Second task')).toBeVisible();

    await page.locator('[data-test="filter-all"]').click();
    await expect(todoItems(page)).toHaveCount(3);

    await assertNoConsoleErrors();
  });

  test('supports edit save and cancel flows', async ({ page, assertNoConsoleErrors }) => {
    await addTodo(page, 'Draft proposal');

    const row = todoRow(page, 'Draft proposal');

    await row.getByRole('button', { name: 'Edit' }).click();
    await expect(page.locator('[data-test="edit-input"]')).toHaveValue('Draft proposal');

    await page.locator('[data-test="edit-input"]').fill('Draft proposal v2');
    await page.locator('[data-test="cancel-edit"]').click();

    await expect(todoRow(page, 'Draft proposal')).toBeVisible();
    await expect(todoRow(page, 'Draft proposal v2')).toHaveCount(0);

    await todoRow(page, 'Draft proposal').getByRole('button', { name: 'Edit' }).click();
    await page.locator('[data-test="edit-input"]').fill('Draft proposal v2');
    await page.locator('[data-test="edit-input"]').press('Enter');

    await expect(todoRow(page, 'Draft proposal v2')).toBeVisible();
    await expect(todoRow(page, 'Draft proposal')).toHaveCount(0);

    await assertNoConsoleErrors();
  });

  test('toggles all, clears completed, and removes a single todo', async ({
    page,
    assertNoConsoleErrors,
  }) => {
    await addTodo(page, 'Alpha');
    await addTodo(page, 'Beta');
    await addTodo(page, 'Gamma');

    await page.locator('[data-test="toggle-all"]').click();
    await expect(page.locator('[data-test="remaining-count"]')).toHaveText('0 items left');

    await page.locator('[data-test="filter-completed"]').click();
    await expect(todoItems(page)).toHaveCount(3);

    await page.getByRole('button', { name: 'Clear completed' }).click();
    await expect(todoItems(page)).toHaveCount(0);
    await expect(page.locator('[data-test="remaining-count"]')).toHaveText('0 items left');

    await page.locator('[data-test="filter-all"]').click();

    await addTodo(page, 'Delta');
    await addTodo(page, 'Echo');

    await todoRow(page, 'Delta').locator('[data-test="todo-delete"]').click();

    await expect(todoItems(page)).toHaveCount(1);
    await expect(todoRow(page, 'Echo')).toBeVisible();

    await assertNoConsoleErrors();
  });
});
