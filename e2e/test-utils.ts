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

/**
 * Assert that a server-rendered node was REUSED by hydration rather than
 * recreated: installs an init script that tags the first match of `selector`
 * with an expando before the client bundle runs. Call `expectHydrated`
 * after navigation to verify the expando survived.
 */
export async function markServerRenderedNode(page: Page, selector: string) {
  await page.addInitScript((sel: string) => {
    const mark = () => {
      const el = document.querySelector(sel);
      if (el) {
        (el as any).__ssr_reused = true;
        return true;
      }
      return false;
    };
    if (!mark()) {
      const observer = new MutationObserver(() => {
        if (mark()) observer.disconnect();
      });
      observer.observe(document, { childList: true, subtree: true });
    }
  }, selector);
}

export async function expectHydrated(page: Page, selector: string) {
  const isReused = await page.evaluate((sel: string) => {
    const el = document.querySelector(sel);
    return el ? (el as any).__ssr_reused === true : false;
  }, selector);
  expect(isReused).toBe(true);
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

    // eslint-disable-next-line require-await
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
