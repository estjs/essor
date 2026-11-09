import { execSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import zlib from 'node:zlib';
import { chromium } from '@playwright/test';
import pc from 'picocolors';

interface SizeBudget {
  name: string;
  maxRawKb: number;
  maxGzipKb: number;
}

interface MetricResult {
  metric: string;
  actual: string;
  budget: string;
  status: 'PASS' | 'FAIL';
}

const BUDGETS: SizeBudget[] = [
  { name: 'Benchmark Bundle JS', maxRawKb: 32.0, maxGzipKb: 12.0 },
];

async function runBenchmarkBuild(): Promise<void> {
  console.log(pc.cyan('\n[1/3] Building benchmark...'));
  execSync('pnpm --filter essor-benchmark build', { stdio: 'inherit' });
}

function checkBundleSizes(): { results: MetricResult[]; passed: boolean } {
  console.log(pc.cyan('\n[2/3] Checking bundle sizes against budget...'));
  const distDir = path.resolve(process.cwd(), 'benchmark/dist');
  const assetsDir = path.join(distDir, 'assets');
  const files = fs.readdirSync(assetsDir);
  const jsFile = files.find((f) => f.endsWith('.js') && !f.endsWith('.map'));

  if (!jsFile) {
    throw new Error('No JS bundle found in benchmark/dist/assets');
  }

  const jsPath = path.join(assetsDir, jsFile);
  const content = fs.readFileSync(jsPath);
  const rawKb = content.length / 1024;
  const gzipKb = zlib.gzipSync(content).length / 1024;
  const brotliKb = zlib.brotliCompressSync(content).length / 1024;

  const budget = BUDGETS[0];
  const results: MetricResult[] = [];
  let passed = true;

  const rawPass = rawKb <= budget.maxRawKb;
  if (!rawPass) passed = false;
  results.push({
    metric: `${jsFile} (Raw)`,
    actual: `${rawKb.toFixed(2)} KB`,
    budget: `<= ${budget.maxRawKb.toFixed(2)} KB`,
    status: rawPass ? 'PASS' : 'FAIL',
  });

  const gzipPass = gzipKb <= budget.maxGzipKb;
  if (!gzipPass) passed = false;
  results.push({
    metric: `${jsFile} (Gzip)`,
    actual: `${gzipKb.toFixed(2)} KB`,
    budget: `<= ${budget.maxGzipKb.toFixed(2)} KB`,
    status: gzipPass ? 'PASS' : 'FAIL',
  });

  results.push({
    metric: `${jsFile} (Brotli)`,
    actual: `${brotliKb.toFixed(2)} KB`,
    budget: 'N/A',
    status: 'PASS',
  });

  return { results, passed };
}

async function runBrowserBenchmarks(): Promise<{ results: MetricResult[]; passed: boolean }> {
  console.log(pc.cyan('\n[3/3] Running headless browser performance benchmarks...'));
  const distDir = path.resolve(process.cwd(), 'benchmark/dist');

  const server = http.createServer((req, res) => {
    let reqPath = (req.url || '/').split('?')[0];
    if (reqPath === '/') reqPath = '/index.html';
    const filePath = path.join(distDir, reqPath);
    if (fs.existsSync(filePath)) {
      const ext = path.extname(filePath);
      const contentType =
        ext === '.html'
          ? 'text/html'
          : ext === '.js'
            ? 'application/javascript'
            : ext === '.css'
              ? 'text/css'
              : 'text/plain';
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(fs.readFileSync(filePath));
    } else if (reqPath.endsWith('.css')) {
      res.writeHead(200, { 'Content-Type': 'text/css' });
      res.end('');
    } else {
      res.writeHead(404);
      res.end('Not found');
    }
  });

  await new Promise<void>((resolve) => server.listen(0, resolve));
  const address = server.address() as { port: number };
  const url = `http://localhost:${address.port}`;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('pageerror', (err) => console.error('Browser error:', err));
  await page.goto(url);
  await page.waitForSelector('#run');

  const results: MetricResult[] = [];
  let passed = true;

  // 1. Create 1,000 rows
  const start1k = Date.now();
  await page.click('#run');
  await page.waitForSelector('tbody tr:nth-child(1000)');
  const time1k = Date.now() - start1k;
  const pass1k = time1k <= 500;
  if (!pass1k) passed = false;
  results.push({
    metric: 'Create 1,000 rows',
    actual: `${time1k} ms`,
    budget: '<= 500 ms',
    status: pass1k ? 'PASS' : 'FAIL',
  });

  // 2. Update every 10th row
  const startUpdate = Date.now();
  await page.click('#update');
  const timeUpdate = Date.now() - startUpdate;
  const passUpdate = timeUpdate <= 200;
  if (!passUpdate) passed = false;
  results.push({
    metric: 'Update every 10th row',
    actual: `${timeUpdate} ms`,
    budget: '<= 200 ms',
    status: passUpdate ? 'PASS' : 'FAIL',
  });

  // 3. Swap rows (1 with 998)
  const startSwap = Date.now();
  await page.click('#swaprows');
  const timeSwap = Date.now() - startSwap;
  const passSwap = timeSwap <= 200;
  if (!passSwap) passed = false;
  results.push({
    metric: 'Swap rows (1 & 998)',
    actual: `${timeSwap} ms`,
    budget: '<= 200 ms',
    status: passSwap ? 'PASS' : 'FAIL',
  });

  // 4. Clear rows
  const startClear = Date.now();
  await page.click('#clear');
  await page.waitForSelector('tbody tr', { state: 'detached' });
  const timeClear = Date.now() - startClear;
  const passClear = timeClear <= 200;
  if (!passClear) passed = false;
  results.push({
    metric: 'Clear 1,000 rows',
    actual: `${timeClear} ms`,
    budget: '<= 200 ms',
    status: passClear ? 'PASS' : 'FAIL',
  });

  await browser.close();
  server.close();

  return { results, passed };
}

function printTable(title: string, results: MetricResult[]) {
  console.log(pc.bold(`\n${title}`));
  console.log('----------------------------------------------------------------------');
  console.log(
    `${pc.bold('Metric'.padEnd(28))} | ${pc.bold('Actual'.padEnd(14))} | ${pc.bold('Budget'.padEnd(14))} | ${pc.bold('Status')}`,
  );
  console.log('----------------------------------------------------------------------');
  for (const r of results) {
    const statusColor = r.status === 'PASS' ? pc.green(r.status) : pc.red(r.status);
    console.log(
      `${r.metric.padEnd(28)} | ${r.actual.padEnd(14)} | ${r.budget.padEnd(14)} | ${statusColor}`,
    );
  }
  console.log('----------------------------------------------------------------------');
}

async function main() {
  try {
    await runBenchmarkBuild();
    const sizeCheck = checkBundleSizes();
    const perfCheck = await runBrowserBenchmarks();

    printTable('📊 Bundle Size Budget Gate', sizeCheck.results);
    printTable('⚡ Runtime Performance Gate', perfCheck.results);

    if (!sizeCheck.passed || !perfCheck.passed) {
      console.error(pc.red('\n❌ Benchmark CI Gate Failed: budget exceeded!'));
      process.exit(1);
    }

    console.log(pc.green('\n✅ All Benchmark CI Gates Passed!'));
  } catch (error) {
    console.error(pc.red('\n❌ Benchmark CI execution error:'), error);
    process.exit(1);
  }
}

main();
