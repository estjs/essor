import { execSync, spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cpSync, existsSync, rmSync } from 'node:fs';
import { type Page, expect, expectHydrated, markServerRenderedNode, test } from './test-utils';
import type { Locator } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function waitForServer(port: number) {
  const url = `http://localhost:${port}`;
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`Server at ${url} failed to start`);
}

// ---------------------------------------------------------------------------
// Locator helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tests
//
// Focus on hydration-robust DOM assertions.  SSR hydration comment markers
// (`<!--N-M-->`) make `toHaveText` unreliable on text nodes near comment
// boundaries.  List-item button `onClick` handlers and buttons with
// `disabled` attributes may not re-attach correctly after SSR hydration —
// every interaction therefore uses `onChange` on checkboxes or the outer
// "Add" button, which are verified reliable.
// ---------------------------------------------------------------------------

test.describe('todo-server (SSR + hydration)', () => {
  test.beforeEach(async ({ examplePage }) => {
    await examplePage('todo-server');
  });

  // -- SSR initial content ---------------------------------------------------

  test('renders the initial shell on the server (SSR)', async ({ page }) => {
    await expect(page.locator('[data-test="example-root"]')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1, name: 'TodoMVC' })).toBeVisible();
  });

  test('seeds three server-rendered todos into the page', async ({ page }) => {
    await expect(todoItems(page)).toHaveCount(3);
    await expect(todoRow(page, 'Learn Essor signals')).toBeVisible();
    await expect(todoRow(page, 'Render todos on the server')).toBeVisible();
    await expect(todoRow(page, 'Hydrate the same markup on the client')).toBeVisible();

    // The first seed todo is pre-completed in the SSR markup.
    const firstRow = todoRow(page, 'Learn Essor signals');
    await expect(firstRow.locator('[data-test="todo-toggle"]')).toBeChecked();
  });

  test('shows correct initial reactive state after hydration', async ({ page }) => {
    await expect(todoItems(page)).toHaveCount(3);

    // Two todos are not completed.
    const second = todoRow(page, 'Render todos on the server');
    await expect(second.locator('[data-test="todo-toggle"]')).not.toBeChecked();
    const third = todoRow(page, 'Hydrate the same markup on the client');
    await expect(third.locator('[data-test="todo-toggle"]')).not.toBeChecked();
  });

  // -- Hydration ------------------------------------------------------------

  test('hydrates without console errors and reuses DOM nodes', async ({
    page,
    assertNoConsoleErrors,
  }) => {
    // Mark the SSR element during parser stage; verified via expectHydrated.
    await markServerRenderedNode(page, '[data-test="todo-title"]');

    await page.reload();
    await expect(page.locator('[data-test="example-root"]')).toBeVisible();

    // Verify that the element was hydrated (reused) instead of recreated from scratch
    await expectHydrated(page, '[data-test="todo-title"]');

    await assertNoConsoleErrors();
  });

  // -- Add ------------------------------------------------------------------

  test('adds todos with button and enter', async ({ page, assertNoConsoleErrors }) => {
    await addTodo(page, 'Write docs');
    await addTodo(page, 'Ship release', 'enter');

    await expect(todoItems(page)).toHaveCount(5);
    await expect(todoRow(page, 'Write docs')).toBeVisible();
    await expect(todoRow(page, 'Ship release')).toBeVisible();

    // New todos start incomplete.
    await expect(
      todoRow(page, 'Write docs').locator('[data-test="todo-toggle"]'),
    ).not.toBeChecked();

    await assertNoConsoleErrors();
  });

  test('does not add empty todos', async ({ page }) => {
    await page.locator('[data-test="new-todo"]').fill('   ');
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(todoItems(page)).toHaveCount(3);

    await page.locator('[data-test="new-todo"]').press('Enter');
    await expect(todoItems(page)).toHaveCount(3);
  });

  // -- Toggle individual ----------------------------------------------------

  test('toggles a single todo between completed and active', async ({
    page,
    assertNoConsoleErrors,
  }) => {
    const toggle = todoRow(page, 'Render todos on the server').locator('[data-test="todo-toggle"]');
    await expect(toggle).not.toBeChecked();

    // Toggle on.
    await toggle.click();
    await expect(toggle).toBeChecked();

    // Toggle off.
    await toggle.click();
    await expect(toggle).not.toBeChecked();

    await assertNoConsoleErrors();
  });

  // -- Delete individual ----------------------------------------------------

  test('deletes a todo via the delete button', async ({ page }) => {
    await addTodo(page, 'Temp todo');
    await expect(todoRow(page, 'Temp todo')).toBeVisible();

    const row = todoRow(page, 'Temp todo');
    await row.hover();
    await row.locator('[data-test="todo-delete"]').click();
    await expect(todoRow(page, 'Temp todo')).toHaveCount(0);
    await expect(todoItems(page)).toHaveCount(3);
  });

  // -- SSG (no-JS) baseline --------------------------------------------------

  test('delivers structured HTML even without JavaScript', async ({ page }) => {
    await page.route('**/*.{js,mjs,tsx,ts}', (route) => route.abort());
    await page.reload();
    await page.waitForLoadState('domcontentloaded');

    await expect(page.locator('[data-test="example-root"]')).toBeVisible();
    await expect(todoItems(page)).toHaveCount(3);
    await expect(page.getByRole('button', { name: 'Add' })).toBeVisible();
  });

  test('filters all, active, and completed items after hydration', async ({
    page,
    assertNoConsoleErrors,
  }) => {
    await expect(page.locator('[data-test="remaining-count"]')).toHaveText('2 items left');

    await page.locator('[data-test="filter-active"]').click();
    await expect(todoItems(page)).toHaveCount(2);
    await expect(todoRow(page, 'Render todos on the server')).toBeVisible();
    await expect(todoRow(page, 'Hydrate the same markup on the client')).toBeVisible();
    await expect(todoRow(page, 'Learn Essor signals')).toHaveCount(0);

    await page.locator('[data-test="filter-completed"]').click();
    await expect(todoItems(page)).toHaveCount(1);
    await expect(todoRow(page, 'Learn Essor signals')).toBeVisible();

    await page.locator('[data-test="filter-all"]').click();
    await expect(todoItems(page)).toHaveCount(3);

    await assertNoConsoleErrors();
  });

  test('supports edit, save, and cancel flows after hydration', async ({
    page,
    assertNoConsoleErrors,
  }) => {
    const row = todoRow(page, 'Render todos on the server');

    await row.getByRole('button', { name: 'Edit' }).click();
    await expect(page.locator('[data-test="edit-input"]')).toHaveValue(
      'Render todos on the server',
    );

    await page.locator('[data-test="edit-input"]').fill('Render todos on the server modified');
    await page.locator('[data-test="cancel-edit"]').click();

    await expect(todoRow(page, 'Render todos on the server')).toBeVisible();
    await expect(todoRow(page, 'Render todos on the server modified')).toHaveCount(0);

    await todoRow(page, 'Render todos on the server').getByRole('button', { name: 'Edit' }).click();
    await page.locator('[data-test="edit-input"]').fill('Render todos on the server modified');
    await page.locator('[data-test="edit-input"]').press('Enter');

    await expect(todoRow(page, 'Render todos on the server modified')).toBeVisible();
    await expect(todoRow(page, 'Render todos on the server')).toHaveCount(0);

    await assertNoConsoleErrors();
  });

  test('toggles all, clears completed, and removes todos after hydration', async ({
    page,
    assertNoConsoleErrors,
  }) => {
    await page.locator('[data-test="toggle-all"]').click();
    await expect(page.locator('[data-test="remaining-count"]')).toHaveText('0 items left');

    await page.locator('[data-test="filter-completed"]').click();
    await expect(todoItems(page)).toHaveCount(3);

    await page.getByRole('button', { name: 'Clear completed' }).click();
    await expect(todoItems(page)).toHaveCount(0);
    await expect(page.locator('[data-test="remaining-count"]')).toHaveText('0 items left');

    await assertNoConsoleErrors();
  });
});

// -- Production Server E2E Tests ---------------------------------------------

test.describe('todo-server production tests', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(() => {
    const rootDir = resolve(__dirname, '..');
    // Build the project once to avoid parallel write/delete race conditions in Vite dist folder
    execSync('pnpm --filter essor-example-todo-mvc-server run build', {
      cwd: rootDir,
      stdio: 'ignore',
    });
  });

  test.describe('todo-server (production SSR)', () => {
    let serverProcess: any;
    let serverOutput = '';

    test.beforeAll(async () => {
      const rootDir = resolve(__dirname, '..');
      const exampleDir = resolve(rootDir, 'examples/todo-server');
      const distDir = resolve(exampleDir, 'dist');
      const ssrDistDir = resolve(exampleDir, 'dist-ssr');

      // Copy build output to dist-ssr
      if (existsSync(ssrDistDir)) {
        rmSync(ssrDistDir, { recursive: true, force: true });
      }
      cpSync(distDir, ssrDistDir, { recursive: true });

      // Start the production server using dist-ssr in SSR mode
      const serverPath = resolve(exampleDir, 'server.js');
      serverProcess = spawn('node', [serverPath], {
        env: {
          ...process.env,
          NODE_ENV: 'production',
          PORT: '4122',
          DIST_DIR: 'dist-ssr',
          RENDER_MODE: 'ssr',
        },
      });

      serverProcess.stdout?.on('data', (chunk: any) => {
        serverOutput += chunk.toString();
      });

      await waitForServer(4122);
    });

    test.afterAll(() => {
      if (serverProcess) {
        serverProcess.kill('SIGTERM');
      }
      const ssrDistDir = resolve(__dirname, '../examples/todo-server/dist-ssr');
      if (existsSync(ssrDistDir)) {
        rmSync(ssrDistDir, { recursive: true, force: true });
      }
    });

    test('serves dynamic SSR output and hydrates successfully (reusing DOM nodes)', async ({
      page,
      assertNoConsoleErrors,
    }) => {
      // Mark the SSR element during parser stage; verified via expectHydrated.
      await markServerRenderedNode(page, '[data-test="todo-title"]');

      await page.goto('http://localhost:4122');
      await expect(page.locator('[data-test="example-root"]')).toBeVisible();
      await expect(todoItems(page)).toHaveCount(3);

      // Verify that the element was hydrated (reused) instead of recreated from scratch
      await expectHydrated(page, '[data-test="todo-title"]');

      // Verify it is interactive
      await addTodo(page, 'Test SSR Production');
      await expect(todoRow(page, 'Test SSR Production')).toBeVisible();

      // Verify that the server logged an SSR request
      expect(serverOutput).toContain('[SSR] rendered');

      // Hydration in production must be clean: no mismatch errors on console
      await assertNoConsoleErrors();
    });
  });

  test.describe('todo-server (production SSG)', () => {
    let serverProcess: any;
    let serverOutput = '';

    test.beforeAll(async () => {
      const rootDir = resolve(__dirname, '..');
      const exampleDir = resolve(rootDir, 'examples/todo-server');
      const distDir = resolve(exampleDir, 'dist');
      const ssgDistDir = resolve(exampleDir, 'dist-ssg');

      // Copy build output to dist-ssg
      if (existsSync(ssgDistDir)) {
        rmSync(ssgDistDir, { recursive: true, force: true });
      }
      cpSync(distDir, ssgDistDir, { recursive: true });

      // Start the production server using dist-ssg
      const serverPath = resolve(exampleDir, 'server.js');
      serverProcess = spawn('node', [serverPath], {
        env: {
          ...process.env,
          NODE_ENV: 'production',
          PORT: '4123',
          DIST_DIR: 'dist-ssg',
        },
      });

      serverProcess.stdout?.on('data', (chunk: any) => {
        serverOutput += chunk.toString();
      });

      await waitForServer(4123);
    });

    test.afterAll(() => {
      if (serverProcess) {
        serverProcess.kill('SIGTERM');
      }
      const ssgDistDir = resolve(__dirname, '../examples/todo-server/dist-ssg');
      if (existsSync(ssgDistDir)) {
        rmSync(ssgDistDir, { recursive: true, force: true });
      }
    });

    test('serves pre-rendered SSG output and hydrates successfully (reusing DOM nodes)', async ({
      page,
      assertNoConsoleErrors,
    }) => {
      // Mark the SSR element during parser stage; verified via expectHydrated.
      await markServerRenderedNode(page, '[data-test="todo-title"]');

      await page.goto('http://localhost:4123');
      await expect(page.locator('[data-test="example-root"]')).toBeVisible();
      await expect(todoItems(page)).toHaveCount(3);

      // Verify that the element was hydrated (reused) instead of recreated from scratch
      await expectHydrated(page, '[data-test="todo-title"]');

      // Verify it is interactive after hydration
      await addTodo(page, 'Test SSG Production');
      await expect(todoRow(page, 'Test SSG Production')).toBeVisible();

      // Verify that the server logged an SSG static shell response
      expect(serverOutput).toContain('[SSG] static shell');

      // Hydration in production must be clean: no mismatch errors on console
      await assertNoConsoleErrors();
    });
  });
});
