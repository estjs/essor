/**
 * Test utilities for Essor framework E2E tests
 * Provides consistent port mapping and helper functions
 */

// Port mapping for all examples - must match playwright.config.ts
export const EXAMPLE_PORT_MAP = {
  basic: 3001,
  todo: 3002,
  hmr: 3003,
  portal: 3004,
} as const;

export type ExampleName = keyof typeof EXAMPLE_PORT_MAP;

/**
 * Get the URL for a specific example
 */
export function getExampleUrl(exampleName: ExampleName): string {
  const port = EXAMPLE_PORT_MAP[exampleName];
  return `http://localhost:${port}`;
}

/**
 * Get the port for a specific example
 */
export function getExamplePort(exampleName: ExampleName): number {
  return EXAMPLE_PORT_MAP[exampleName];
}
// Generate web server configurations for all examples.
//
// Each registered example gets a `webServer` entry that Playwright spins up
// before tests start. Two opt-in env vars scope what gets started:
//
//   E2E_EXAMPLES=portal,basic   only start the listed examples (CSV)
//   E2E_EXAMPLE=portal          shorthand for a single example
//
// Without either var: all examples start (legacy behaviour, used by CI).
// On dev machines with low inotify limits, the `hmr` example in particular
// can hang the whole launch; scoping is much cheaper to iterate against.
export const generateWebServers = () => {
  const filterRaw = process.env.E2E_EXAMPLES ?? process.env.E2E_EXAMPLE;
  const filter = filterRaw
    ? new Set(
        filterRaw
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
      )
    : null;

  return Object.entries(EXAMPLE_PORT_MAP)
    .filter(([name]) => !filter || filter.has(name))
    .map(([exampleName, port]) => ({
      command: `pnpm -C examples/${exampleName} run dev --port ${port}`,
      url: `http://localhost:${port}`,
      // CI gets a fresh server per run; local re-uses any already-running one.
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    }));
};
