import { type ChildProcess, spawn } from 'node:child_process';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { expect, test } from './test-utils';
import type { Page } from './test-utils';

const repoRoot = process.cwd();
const hmrExampleRoot = path.join(repoRoot, 'examples/hmr');
const hmrSourceRoot = path.join(hmrExampleRoot, 'src');
const hmrTempRoot = path.join(hmrExampleRoot, 'temp');

type HmrFixturePaths = {
  main: string;
  config: string;
  unmountedSentinel: string;
  unknownComponent: string;
};

type HmrFixture = {
  url: string;
  dir: string;
  child: ChildProcess;
  paths: HmrFixturePaths;
};

type ConfigPatch = {
  version?: string;
  note?: string;
  incrementLabel?: string;
  incrementStep?: number;
  moduleLabel?: string;
  moduleBadge?: string;
};

function quoteString(value: string) {
  return `'${value.replaceAll('\\', '\\\\').replaceAll("'", "\\'")}'`;
}

function replaceRequired(source: string, pattern: RegExp, replacement: string) {
  if (!pattern.test(source)) {
    throw new Error(`HMR fixture source replacement failed for ${pattern}`);
  }
  return source.replace(pattern, replacement);
}

function replaceExportedStringConstant(source: string, name: string, value: string) {
  return replaceRequired(
    source,
    new RegExp(`export const ${name} = ['"][^'"]*['"];`),
    `export const ${name} = ${quoteString(value)};`,
  );
}

function replaceExportedNumberConstant(source: string, name: string, value: number) {
  return replaceRequired(
    source,
    new RegExp(`export const ${name} = [^;]+;`),
    `export const ${name} = ${value};`,
  );
}

async function patchFile(filePath: string, transform: (source: string) => string) {
  const source = await readFile(filePath, 'utf8');
  await writeFile(filePath, transform(source));
}

async function patchConfig(paths: HmrFixturePaths, patch: ConfigPatch) {
  await patchFile(paths.config, (source) => {
    let next = source;

    if (patch.version !== undefined) {
      next = replaceExportedStringConstant(next, 'DEMO_VERSION', patch.version);
    }
    if (patch.note !== undefined) {
      next = replaceExportedStringConstant(next, 'NOTE_COPY', patch.note);
    }
    if (patch.incrementLabel !== undefined) {
      next = replaceExportedStringConstant(next, 'INCREMENT_LABEL', patch.incrementLabel);
    }
    if (patch.incrementStep !== undefined) {
      next = replaceExportedNumberConstant(next, 'INCREMENT_STEP', patch.incrementStep);
    }
    if (patch.moduleLabel !== undefined) {
      next = replaceExportedStringConstant(next, 'MODULE_LABEL', patch.moduleLabel);
    }
    if (patch.moduleBadge !== undefined) {
      next = replaceExportedStringConstant(next, 'MODULE_BADGE', patch.moduleBadge);
    }

    return next;
  });
}

async function patchUnmountedSentinel(paths: HmrFixturePaths, value: string) {
  await patchFile(paths.unmountedSentinel, (source) =>
    replaceExportedStringConstant(source, 'UNMOUNTED_SENTINEL', value),
  );
}

function createUnknownComponentSource(version: string) {
  return [
    `const UNKNOWN_VERSION = ${quoteString(version)};`,
    '',
    '(globalThis as { __essorHmrUnknownVersion?: string }).__essorHmrUnknownVersion =',
    '  UNKNOWN_VERSION;',
    '',
    'export function UnknownComponent() {',
    '  return <span data-test="hmr-unknown-component">{UNKNOWN_VERSION}</span>;',
    '}',
    '',
  ].join('\n');
}

async function installUnknownComponent(paths: HmrFixturePaths, version: string) {
  await writeFile(paths.unknownComponent, createUnknownComponentSource(version));
  await patchFile(paths.main, (source) => {
    if (source.includes("import './unknown-component';")) return source;
    return source.replace(
      "import { App } from './App';",
      "import { App } from './App';\nimport './unknown-component';",
    );
  });
}

function createFixturePaths(sourceDir: string): HmrFixturePaths {
  return {
    main: path.join(sourceDir, 'main.tsx'),
    config: path.join(sourceDir, 'config.ts'),
    unmountedSentinel: path.join(sourceDir, 'components/UnmountedSentinel.tsx'),
    unknownComponent: path.join(sourceDir, 'unknown-component.tsx'),
  };
}

async function getFreePort() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
  return port;
}

async function waitForUrl(url: string, timeoutMs = 30_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Vite is still starting.
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForExit(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;

  await new Promise<void>((resolve) => {
    child.once('exit', () => resolve());
  });
}

async function terminateChild(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;

  child.kill('SIGTERM');

  let timeout: ReturnType<typeof setTimeout> | undefined;
  const result = await Promise.race([
    waitForExit(child).then(() => 'exit' as const),
    new Promise<'timeout'>((resolve) => {
      timeout = setTimeout(() => resolve('timeout'), 5_000);
    }),
  ]);

  if (timeout) {
    clearTimeout(timeout);
  }

  if (result === 'timeout' && child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await waitForExit(child);
  }
}

async function startHmrFixture(
  testId: string,
  setup?: (paths: HmrFixturePaths) => Promise<void>,
): Promise<HmrFixture> {
  const id = testId.replaceAll(/[^\w-]/g, '-');
  const port = await getFreePort();
  const dir = path.join(hmrTempRoot, `${id}-${port}`);
  const sourceDir = path.join(dir, 'src');
  const paths = createFixturePaths(sourceDir);
  const url = `http://127.0.0.1:${port}/temp/${path.basename(dir)}/index.html`;

  await mkdir(dir, { recursive: true });
  await cp(hmrSourceRoot, sourceDir, { recursive: true });
  await setup?.(paths);
  await writeFile(
    path.join(dir, 'index.html'),
    [
      '<!doctype html>',
      '<html lang="en">',
      '  <head><meta charset="UTF-8" /><title>Essor HMR E2E</title></head>',
      '  <body>',
      '    <div id="app"></div>',
      '    <script type="module" src="./src/main.tsx"></script>',
      '  </body>',
      '</html>',
      '',
    ].join('\n'),
  );

  const env = { ...process.env };
  delete env.E2E;

  const child = spawn(
    'pnpm',
    ['exec', 'vite', '--host', '127.0.0.1', '--port', String(port), '--strictPort'],
    {
      cwd: hmrExampleRoot,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  const logs: string[] = [];
  child.stdout?.on('data', (chunk) => logs.push(String(chunk)));
  child.stderr?.on('data', (chunk) => logs.push(String(chunk)));

  try {
    await waitForUrl(url);
  } catch (error) {
    await terminateChild(child);
    await rm(dir, { recursive: true, force: true });
    throw new Error(`${String(error)}\n\nVite logs:\n${logs.join('')}`);
  }

  return { url, dir, child, paths };
}

async function stopHmrFixture(fixture: HmrFixture) {
  await terminateChild(fixture.child);
  await rm(fixture.dir, { recursive: true, force: true });
}

async function setPageToken(page: Page) {
  const token = `token-${Date.now()}-${Math.random()}`;
  await page.evaluate((value: string) => {
    (window as any).__essorHmrE2eToken = value;
  }, token);
  return token;
}

async function expectPageToken(page: Page, token: string) {
  await expect.poll(() => page.evaluate(() => (window as any).__essorHmrE2eToken)).toBe(token);
}

async function gotoHmrFixture(page: Page, fixture: HmrFixture) {
  await page.goto(fixture.url);
  await expect(page.locator('[data-test="example-root"]')).toBeVisible();
  await expect(page.locator('[data-test="example-root"]')).toHaveCount(1);
}

async function expectNoReloadedDuplicateRoot(page: Page, token: string) {
  await expectPageToken(page, token);
  await expect(page.locator('[data-test="example-root"]')).toHaveCount(1);
}

test.describe('hmr example', () => {
  test.beforeEach(async ({ examplePage }) => {
    await examplePage('hmr');
  });

  test('renders the hot refresh workbench', async ({ page, assertNoConsoleErrors }) => {
    await expect(page.getByRole('heading', { level: 1, name: 'HMR Example' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Stateful Counter' })).toBeVisible();
    await expect(page.getByRole('heading', { level: 2, name: 'Module Inspector' })).toBeVisible();
    await expect(page.locator('[data-test="hmr-note"]')).toHaveText(
      'State survives hot updates while module content refreshes.',
    );
    await expect(page.locator('[data-test="hmr-count"]')).toHaveText('0');
    await expect(page.locator('[data-test="hmr-double"]')).toHaveText('0');
    await expect(page.locator('[data-test="hmr-parity"]')).toHaveText('even');
    await expect(page.locator('[data-test="hmr-last-action"]')).toHaveText('Ready');
    await expect(page.locator('[data-test="hmr-version"]')).toHaveText('Version: 2026.04');
    await expect(page.locator('[data-test="hmr-module-label"]')).toHaveText(
      'Module: Component module',
    );
    await expect(page.locator('[data-test="hmr-module-badge"]')).toHaveText('Badge: interactive');
    await expect(page.locator('[data-test="hmr-module-summary"]')).toHaveText(
      'Summary: Component module · interactive · idle',
    );
    await expect(page.locator('[data-test="hmr-update-count"]')).toHaveText('Hot updates: 0');
    await assertNoConsoleErrors();
  });

  test('keeps the counter interactive and shows derived state', async ({
    page,
    assertNoConsoleErrors,
  }) => {
    await page.getByRole('button', { name: 'Increment' }).click();
    await page.getByRole('button', { name: 'Increment' }).click();

    await expect(page.locator('[data-test="hmr-count"]')).toHaveText('2');
    await expect(page.locator('[data-test="hmr-double"]')).toHaveText('4');
    await expect(page.locator('[data-test="hmr-parity"]')).toHaveText('even');
    await expect(page.locator('[data-test="hmr-last-action"]')).toHaveText('Increment +1');

    await page.getByRole('button', { name: 'Decrement' }).click();
    await expect(page.locator('[data-test="hmr-count"]')).toHaveText('1');
    await expect(page.locator('[data-test="hmr-parity"]')).toHaveText('odd');
    await expect(page.locator('[data-test="hmr-last-action"]')).toHaveText('Decrement -1');

    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(page.locator('[data-test="hmr-count"]')).toHaveText('0');
    await expect(page.locator('[data-test="hmr-last-action"]')).toHaveText('Reset');
    await assertNoConsoleErrors();
  });
});

test.describe('hmr example real Vite updates', () => {
  test('hot-swaps module text and constants without a full page reload', async ({
    page,
    assertNoConsoleErrors,
  }, testInfo) => {
    const fixture = await startHmrFixture(testInfo.testId, (paths) =>
      patchConfig(paths, {
        version: '2026.04-a',
        moduleLabel: 'Module A',
        moduleBadge: 'stable',
      }),
    );

    try {
      await gotoHmrFixture(page, fixture);
      const token = await setPageToken(page);

      await expect(page.locator('[data-test="hmr-version"]')).toHaveText('Version: 2026.04-a');
      await expect(page.locator('[data-test="hmr-module-summary"]')).toHaveText(
        'Summary: Module A · stable · idle',
      );

      await patchConfig(fixture.paths, {
        version: '2026.04-b',
        note: 'Hot update applied without a browser reload.',
        moduleLabel: 'Module B',
        moduleBadge: 'updated',
      });

      await expect(page.locator('[data-test="hmr-version"]')).toHaveText('Version: 2026.04-b');
      await expect(page.locator('[data-test="hmr-note"]')).toHaveText(
        'Hot update applied without a browser reload.',
      );
      await expect(page.locator('[data-test="hmr-module-label"]')).toHaveText('Module: Module B');
      await expect(page.locator('[data-test="hmr-module-badge"]')).toHaveText('Badge: updated');
      await expect(page.locator('[data-test="hmr-module-summary"]')).toHaveText(
        'Summary: Module B · updated · idle',
      );
      await expect(page.locator('[data-test="hmr-update-count"]')).toHaveText('Hot updates: 1');
      await expect(page.locator('[data-test="hmr-last-action"]')).toHaveText('Hot update applied');
      await expectNoReloadedDuplicateRoot(page, token);
      await assertNoConsoleErrors();
    } finally {
      await stopHmrFixture(fixture);
    }
  });

  test('preserves interactive state during a hot update', async ({
    page,
    assertNoConsoleErrors,
  }, testInfo) => {
    const fixture = await startHmrFixture(testInfo.testId, (paths) =>
      patchConfig(paths, { version: 'state-a' }),
    );

    try {
      await gotoHmrFixture(page, fixture);
      const token = await setPageToken(page);

      await page.getByRole('button', { name: 'Increment' }).click();
      await page.getByRole('button', { name: 'Increment' }).click();
      await page.getByRole('button', { name: 'Decrement' }).click();
      await expect(page.locator('[data-test="hmr-count"]')).toHaveText('1');
      await expect(page.locator('[data-test="hmr-double"]')).toHaveText('2');
      await expect(page.locator('[data-test="hmr-parity"]')).toHaveText('odd');

      await patchConfig(fixture.paths, {
        version: 'state-b',
        note: 'Counter state survived this hot update.',
      });

      await expect(page.locator('[data-test="hmr-version"]')).toHaveText('Version: state-b');
      await expect(page.locator('[data-test="hmr-count"]')).toHaveText('1');
      await expect(page.locator('[data-test="hmr-double"]')).toHaveText('2');
      await expect(page.locator('[data-test="hmr-parity"]')).toHaveText('odd');
      await expect(page.locator('[data-test="hmr-update-count"]')).toHaveText('Hot updates: 1');
      await expect(page.locator('[data-test="hmr-note"]')).toHaveText(
        'Counter state survived this hot update.',
      );
      await expectNoReloadedDuplicateRoot(page, token);
      await assertNoConsoleErrors();
    } finally {
      await stopHmrFixture(fixture);
    }
  });

  test('continues accepting consecutive hot updates', async ({
    page,
    assertNoConsoleErrors,
  }, testInfo) => {
    const fixture = await startHmrFixture(testInfo.testId, (paths) =>
      patchConfig(paths, { version: 'chain-a' }),
    );

    try {
      await gotoHmrFixture(page, fixture);
      const token = await setPageToken(page);

      await patchConfig(fixture.paths, {
        version: 'chain-b',
        note: 'First hot update rendered.',
      });
      await expect(page.locator('[data-test="hmr-version"]')).toHaveText('Version: chain-b');
      await expect(page.locator('[data-test="hmr-note"]')).toHaveText('First hot update rendered.');
      await expect(page.locator('[data-test="hmr-update-count"]')).toHaveText('Hot updates: 1');
      await expectNoReloadedDuplicateRoot(page, token);

      await patchConfig(fixture.paths, {
        version: 'chain-c',
        note: 'Second hot update rendered.',
      });
      await expect(page.locator('[data-test="hmr-version"]')).toHaveText('Version: chain-c');
      await expect(page.locator('[data-test="hmr-note"]')).toHaveText(
        'Second hot update rendered.',
      );
      await expect(page.locator('[data-test="hmr-update-count"]')).toHaveText('Hot updates: 2');
      await expectNoReloadedDuplicateRoot(page, token);
      await assertNoConsoleErrors();
    } finally {
      await stopHmrFixture(fixture);
    }
  });

  test('uses updated event handlers after a hot update', async ({
    page,
    assertNoConsoleErrors,
  }, testInfo) => {
    const fixture = await startHmrFixture(testInfo.testId, (paths) =>
      patchConfig(paths, { version: 'handler-a' }),
    );

    try {
      await gotoHmrFixture(page, fixture);
      const token = await setPageToken(page);

      await page.getByRole('button', { name: 'Increment' }).click();
      await expect(page.locator('[data-test="hmr-count"]')).toHaveText('1');

      await patchConfig(fixture.paths, {
        version: 'handler-b',
        incrementLabel: 'Add 5',
        incrementStep: 5,
      });

      await expect(page.getByRole('button', { name: 'Add 5' })).toBeVisible();
      await page.getByRole('button', { name: 'Add 5' }).click();
      await expect(page.locator('[data-test="hmr-count"]')).toHaveText('6');
      await expect(page.locator('[data-test="hmr-double"]')).toHaveText('12');
      await expect(page.locator('[data-test="hmr-last-action"]')).toHaveText('Add 5 +5');
      await expectNoReloadedDuplicateRoot(page, token);
      await assertNoConsoleErrors();
    } finally {
      await stopHmrFixture(fixture);
    }
  });

  test('accepts an unmounted component module update without rendering it', async ({
    page,
    assertNoConsoleErrors,
  }, testInfo) => {
    const fixture = await startHmrFixture(testInfo.testId);

    try {
      await gotoHmrFixture(page, fixture);
      const token = await setPageToken(page);

      await patchUnmountedSentinel(fixture.paths, 'module-only');

      await expect
        .poll(() => page.evaluate(() => (window as any).__essorHmrSentinelVersion))
        .toBe('module-only');
      await expect(page.locator('[data-test="hmr-module-summary"]')).toHaveText(
        'Summary: Component module · interactive · idle',
      );
      await expect(page.locator('[data-test="hmr-unmounted-sentinel"]')).toHaveCount(0);
      await expect(page.locator('[data-test="hmr-update-count"]')).toHaveText('Hot updates: 0');
      await expectNoReloadedDuplicateRoot(page, token);
      await assertNoConsoleErrors();
    } finally {
      await stopHmrFixture(fixture);
    }
  });

  test('accepts an unknown unmounted component update without reloads or console errors', async ({
    page,
    assertNoConsoleErrors,
  }, testInfo) => {
    const fixture = await startHmrFixture(testInfo.testId, (paths) =>
      installUnknownComponent(paths, 'unknown-a'),
    );

    try {
      await gotoHmrFixture(page, fixture);
      const token = await setPageToken(page);

      await expect
        .poll(() => page.evaluate(() => (window as any).__essorHmrUnknownVersion))
        .toBe('unknown-a');
      await expect(page.locator('[data-test="hmr-unknown-component"]')).toHaveCount(0);
      await expect(page.locator('[data-test="hmr-update-count"]')).toHaveText('Hot updates: 0');

      await writeFile(fixture.paths.unknownComponent, createUnknownComponentSource('unknown-b'));

      await expect
        .poll(() => page.evaluate(() => (window as any).__essorHmrUnknownVersion))
        .toBe('unknown-b');
      await expect(page.locator('[data-test="hmr-unknown-component"]')).toHaveCount(0);
      await expect(page.locator('[data-test="hmr-update-count"]')).toHaveText('Hot updates: 0');
      await expectNoReloadedDuplicateRoot(page, token);
      await assertNoConsoleErrors();
    } finally {
      await stopHmrFixture(fixture);
    }
  });
});
