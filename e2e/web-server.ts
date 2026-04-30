// @ts-nocheck
import { type ChildProcess, spawn } from 'node:child_process';
import { type Server, createServer } from 'node:http';
import process from 'node:process';
import {
  E2E_READY_PORT,
  type ExampleName,
  getExamplePort,
  getExampleUrl,
  getSelectedExampleNames,
} from './example-registry';

type SpawnConfig = {
  command: string;
  args: string[];
};

const children: ChildProcess[] = [];
let readyServer: Server | null = null;
const examples = getSelectedExampleNames();

function getSpawnConfig(exampleName: ExampleName): SpawnConfig {
  const port = String(getExamplePort(exampleName));

  return {
    command: 'pnpm',
    args: ['-C', `examples/${exampleName}`, 'exec', 'vite', '--port', port, '--strictPort'],
  };
}

async function waitForUrl(url: string, timeoutMs = 60_000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // keep polling
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for ${url}`);
}

function attachLogs(exampleName: ExampleName, child: ChildProcess) {
  child.stdout?.on('data', (chunk) => {
    process.stdout.write(`[${exampleName}] ${chunk}`);
  });

  child.stderr?.on('data', (chunk) => {
    process.stderr.write(`[${exampleName}] ${chunk}`);
  });
}

async function startExample(exampleName: ExampleName) {
  const { command, args } = getSpawnConfig(exampleName);
  const child = spawn(command, args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      E2E: '1',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  attachLogs(exampleName, child);
  children.push(child);

  child.on('exit', (code) => {
    if (code && code !== 0) {
      process.stderr.write(`[${exampleName}] exited with code ${code}\n`);
    }
  });

  await waitForUrl(getExampleUrl(exampleName));
  process.stdout.write(`[${exampleName}] ready at ${getExampleUrl(exampleName)}\n`);
}

function shutdown(code = 0) {
  readyServer?.close();
  for (const child of children) {
    if (!child.killed) child.kill('SIGTERM');
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

for (const exampleName of examples) {
  await startExample(exampleName);
}

readyServer = createServer((_, res) => {
  res.statusCode = 200;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end('ready');
});

await new Promise<void>((resolve, reject) => {
  readyServer!.once('error', reject);
  readyServer!.listen(E2E_READY_PORT, '127.0.0.1', () => {
    process.stdout.write(`[ready] listening on http://127.0.0.1:${E2E_READY_PORT}/ready\n`);
    resolve();
  });
});

await new Promise(() => {});
