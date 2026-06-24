import { type ChildProcess, spawn } from 'node:child_process';
import { cp, mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import path from 'node:path';
import { expect, test } from './test-utils';
import type { Page } from './test-utils';

const repoRoot = process.cwd();
const hmrExampleRoot = path.join(repoRoot, 'examples/hmr');
const hmrSourceRoot = path.join(hmrExampleRoot, 'src');
const hmrTempRoot = path.join(hmrExampleRoot, 'temp-rspack');

// ---------------------------------------------------------------------------
// Patch helpers (mirrors hmr.spec.ts)
// ---------------------------------------------------------------------------

type DemoContentPatch = {
  version?: string;
  note?: string;
  incrementLabel?: string;
  incrementStep?: number;
  moduleLabel?: string;
  moduleBadge?: string;
};

let patchCounter = 0;

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
    new RegExp(`export const ${name}\\s*=\\s*['"][^'"]*['"];`),
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
  const tempPath = `${filePath}.${process.pid}.${++patchCounter}.tmp`;
  await writeFile(tempPath, transform(source));
  await rename(tempPath, filePath);
}

async function patchDemoContent(demoContentPath: string, patch: DemoContentPatch) {
  await patchFile(demoContentPath, (source) => {
    let next = source;
    if (patch.version !== undefined)
      next = replaceExportedStringConstant(next, 'WORKBENCH_VERSION', patch.version);
    if (patch.note !== undefined)
      next = replaceExportedStringConstant(next, 'WORKBENCH_NOTE', patch.note);
    if (patch.incrementLabel !== undefined)
      next = replaceExportedStringConstant(next, 'PRIMARY_ACTION_LABEL', patch.incrementLabel);
    if (patch.incrementStep !== undefined)
      next = replaceExportedNumberConstant(next, 'PRIMARY_ACTION_STEP', patch.incrementStep);
    if (patch.moduleLabel !== undefined)
      next = replaceExportedStringConstant(next, 'BOUNDARY_NAME', patch.moduleLabel);
    if (patch.moduleBadge !== undefined)
      next = replaceExportedStringConstant(next, 'BOUNDARY_STATUS', patch.moduleBadge);
    return next;
  });
}

// ---------------------------------------------------------------------------
// Fixture lifecycle
// ---------------------------------------------------------------------------

type RspackFixture = {
  url: string;
  dir: string;
  child: ChildProcess;
  demoContentPath: string;
};

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

async function waitForUrl(url: string, timeoutMs = 45_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // still starting
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function waitForExit(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  await new Promise<void>((resolve) => {
    child.once('exit', () => resolve());
  });
}

function killProcessGroup(child: ChildProcess, signal: NodeJS.Signals) {
  if (!child.pid) return;

  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') {
      throw error;
    }
  }
}

async function terminateChild(child: ChildProcess) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  killProcessGroup(child, 'SIGTERM');
  const result = await Promise.race([
    waitForExit(child).then(() => 'exit' as const),
    new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), 5_000)),
  ]);
  if (result === 'timeout' && child.exitCode === null && child.signalCode === null) {
    killProcessGroup(child, 'SIGKILL');
    await waitForExit(child);
  }
}

async function startRspackFixture(
  testId: string,
  setup?: (srcDir: string, demoContentPath: string) => Promise<void>,
): Promise<RspackFixture> {
  const id = testId.replaceAll(/[^\w-]/g, '-');
  const port = await getFreePort();
  const dir = path.join(hmrTempRoot, `${id}-${port}`);
  const srcDir = path.join(dir, 'src');
  const demoContentPath = path.join(srcDir, 'demo-content.ts');
  const url = `http://127.0.0.1:${port}/`;

  await mkdir(dir, { recursive: true });
  await cp(hmrSourceRoot, srcDir, { recursive: true });
  await setup?.(srcDir, demoContentPath);

  // index.html — rspack.config.mjs uses `RSPACK_E2E_FIXTURE/index.html` as template
  await writeFile(
    path.join(dir, 'index.html'),
    [
      '<!doctype html>',
      '<html lang="en">',
      '  <head><meta charset="UTF-8" /><title>Essor HMR Rspack E2E</title></head>',
      '  <body>',
      '    <div id="app"></div>',
      '  </body>',
      '</html>',
      '',
    ].join('\n'),
  );

  const logs: string[] = [];

  const child = spawn(
    'pnpm',
    [
      'exec',
      'rspack',
      'serve',
      '--config',
      path.join(hmrExampleRoot, 'rspack.config.mjs'),
      '--port',
      String(port),
      '--host',
      '127.0.0.1',
    ],
    {
      // Run from examples/hmr so that rspack/node_modules resolve correctly.
      cwd: hmrExampleRoot,
      detached: true,
      env: {
        ...process.env,
        E2E: '1',
        // Tell rspack.config.mjs where the fixture files live.
        RSPACK_E2E_FIXTURE: dir,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );

  child.stdout?.on('data', (chunk) => logs.push(String(chunk)));
  child.stderr?.on('data', (chunk) => logs.push(String(chunk)));

  try {
    await waitForUrl(url);
  } catch (error) {
    await terminateChild(child);
    await rm(dir, { recursive: true, force: true });
    throw new Error(`${String(error)}\n\nRspack logs:\n${logs.join('')}`);
  }

  return { url, dir, child, demoContentPath };
}

async function stopRspackFixture(fixture: RspackFixture) {
  await terminateChild(fixture.child);
  await rm(fixture.dir, { recursive: true, force: true });
}

async function gotoRspackFixture(page: Page, fixture: RspackFixture) {
  await page.addInitScript(() => {
    (window as any).__essorHmrUpdateCount = 0;
  });
  await page.goto(fixture.url);
  await expect(page.locator('[data-test="example-root"]')).toBeVisible();
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

async function expectNoFullReload(page: Page, token: string) {
  await expectPageToken(page, token);
  await expect(page.locator('[data-test="example-root"]')).toHaveCount(1);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('hmr rspack — initial render', () => {
  test('renders the hot refresh workbench', async ({ page, assertNoConsoleErrors }, testInfo) => {
    const fixture = await startRspackFixture(testInfo.testId);
    try {
      await gotoRspackFixture(page, fixture);
      await expect(page.getByRole('heading', { level: 1, name: 'HMR Workbench' })).toBeVisible();
      await expect(
        page.getByRole('heading', { level: 2, name: 'Interactive state' }),
      ).toBeVisible();
      await expect(page.locator('[data-test="hmr-count"]')).toHaveText('0');
      await expect(page.locator('[data-test="hmr-version"]')).toHaveText('Version: 2026.06');
      await assertNoConsoleErrors();
    } finally {
      await stopRspackFixture(fixture);
    }
  });
});

test.describe('hmr rspack — real hot updates', () => {
  test('hot-swaps constants without a full page reload', async ({
    page,
    assertNoConsoleErrors,
  }, testInfo) => {
    const fixture = await startRspackFixture(testInfo.testId, async (_srcDir, demoContentPath) => {
      await patchDemoContent(demoContentPath, {
        version: '2026.06-a',
        moduleLabel: 'Module A',
        moduleBadge: 'stable',
      });
    });
    try {
      await gotoRspackFixture(page, fixture);
      const token = await setPageToken(page);
      await expect(page.locator('[data-test="hmr-version"]')).toHaveText('Version: 2026.06-a');

      await patchDemoContent(fixture.demoContentPath, {
        version: '2026.06-b',
        note: 'Hot update applied without a browser reload.',
        moduleLabel: 'Module B',
        moduleBadge: 'updated',
      });

      await expect(page.locator('[data-test="hmr-version"]')).toHaveText('Version: 2026.06-b');
      await expect(page.locator('[data-test="hmr-note"]')).toHaveText(
        'Hot update applied without a browser reload.',
      );
      await expect(page.locator('[data-test="hmr-module-label"]')).toHaveText('Boundary: Module B');
      await expect(page.locator('[data-test="hmr-update-count"]')).toHaveText('Runtime updates: 1');
      await expectNoFullReload(page, token);
      await assertNoConsoleErrors();
    } finally {
      await stopRspackFixture(fixture);
    }
  });

  test('preserves interactive state across a hot update', async ({
    page,
    assertNoConsoleErrors,
  }, testInfo) => {
    const fixture = await startRspackFixture(testInfo.testId, async (_srcDir, demoContentPath) => {
      await patchDemoContent(demoContentPath, { version: 'state-a' });
    });
    try {
      await gotoRspackFixture(page, fixture);
      const token = await setPageToken(page);

      await page.getByRole('button', { name: 'Increment' }).click();
      await page.getByRole('button', { name: 'Increment' }).click();
      await page.getByRole('button', { name: 'Decrement' }).click();
      await expect(page.locator('[data-test="hmr-count"]')).toHaveText('1');

      await patchDemoContent(fixture.demoContentPath, {
        version: 'state-b',
        note: 'Counter state survived.',
      });

      await expect(page.locator('[data-test="hmr-version"]')).toHaveText('Version: state-b');
      await expect(page.locator('[data-test="hmr-count"]')).toHaveText('1');
      await expect(page.locator('[data-test="hmr-update-count"]')).toHaveText('Runtime updates: 1');
      await expectNoFullReload(page, token);
      await assertNoConsoleErrors();
    } finally {
      await stopRspackFixture(fixture);
    }
  });

  test('accepts consecutive hot updates', async ({ page, assertNoConsoleErrors }, testInfo) => {
    const fixture = await startRspackFixture(testInfo.testId, async (_srcDir, demoContentPath) => {
      await patchDemoContent(demoContentPath, { version: 'chain-a' });
    });
    try {
      await gotoRspackFixture(page, fixture);
      const token = await setPageToken(page);

      await patchDemoContent(fixture.demoContentPath, { version: 'chain-b', note: 'First.' });
      await expect(page.locator('[data-test="hmr-version"]')).toHaveText('Version: chain-b');
      await expect(page.locator('[data-test="hmr-update-count"]')).toHaveText('Runtime updates: 1');
      await expectNoFullReload(page, token);

      await patchDemoContent(fixture.demoContentPath, { version: 'chain-c', note: 'Second.' });
      await expect(page.locator('[data-test="hmr-version"]')).toHaveText('Version: chain-c');
      await expect(page.locator('[data-test="hmr-update-count"]')).toHaveText('Runtime updates: 2');
      await expectNoFullReload(page, token);
      await assertNoConsoleErrors();
    } finally {
      await stopRspackFixture(fixture);
    }
  });

  test('uses updated event handlers after a hot update', async ({
    page,
    assertNoConsoleErrors,
  }, testInfo) => {
    const fixture = await startRspackFixture(testInfo.testId, async (_srcDir, demoContentPath) => {
      await patchDemoContent(demoContentPath, { version: 'handler-a' });
    });
    try {
      await gotoRspackFixture(page, fixture);
      const token = await setPageToken(page);

      await page.getByRole('button', { name: 'Increment' }).click();
      await expect(page.locator('[data-test="hmr-count"]')).toHaveText('1');

      await patchDemoContent(fixture.demoContentPath, {
        version: 'handler-b',
        incrementLabel: 'Add 5',
        incrementStep: 5,
      });

      await expect(page.getByRole('button', { name: 'Add 5' })).toBeVisible();
      await page.getByRole('button', { name: 'Add 5' }).click();
      await expect(page.locator('[data-test="hmr-count"]')).toHaveText('6');
      await expectNoFullReload(page, token);
      await assertNoConsoleErrors();
    } finally {
      await stopRspackFixture(fixture);
    }
  });
});
