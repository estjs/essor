import { type ConsoleMessage, type Page, test as base, expect } from '@playwright/test';
import { type ExampleName, getExamplePort, getExampleUrl } from './example-registry';

type ConsoleAssertionOptions = {
  ignorePatterns?: RegExp[];
};

type TestFixtures = {
  examplePage: (name: ExampleName, path?: string) => Promise<void>;
  assertNoConsoleErrors: (options?: ConsoleAssertionOptions) => Promise<void>;
};

function formatConsoleMessage(message: ConsoleMessage) {
  return `[console:${message.type()}] ${message.text()}`;
}

export async function waitForPageReady(page: Page) {
  await page.waitForLoadState('domcontentloaded');
  await expect(page.locator('[data-test="example-root"]')).toBeVisible();
}

export const test = base.extend<TestFixtures>({
  examplePage: async ({ page }, use) => {
    await use(async (name, path = '') => {
      await page.goto(`${getExampleUrl(name)}${path}`);
      await waitForPageReady(page);
    });
  },

  assertNoConsoleErrors: async ({ page }, use) => {
    const issues: string[] = [];

    const onConsole = (message: ConsoleMessage) => {
      if (message.type() === 'error') {
        issues.push(formatConsoleMessage(message));
      }
    };

    const onPageError = (error: Error) => {
      issues.push(`[pageerror] ${error.message}`);
    };

    page.on('console', onConsole);
    page.on('pageerror', onPageError);

    await use(async ({ ignorePatterns = [] } = {}) => {
      const unexpected = issues.filter(
        (issue) => !ignorePatterns.some((pattern) => pattern.test(issue)),
      );
      expect(unexpected).toEqual([]);
    });

    page.off('console', onConsole);
    page.off('pageerror', onPageError);
  },
});

export { expect, getExamplePort, getExampleUrl, type Page };
