/**
 * Test utilities for Essor framework E2E tests
 * Provides consistent port mapping and helper functions
 */

// Port mapping for all examples - must match playwright.config.ts
export const EXAMPLE_PORT_MAP = {
  basic: 3001,
  todo: 3002,
  hmr: 3003,
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
// Generate web server configurations for all examples
export const generateWebServers = () => {
  // For CI or when running all tests, start all servers
  if (process.env.CI || process.env.START_ALL_SERVERS) {
    return Object.entries(EXAMPLE_PORT_MAP).map(([exampleName, port]) => ({
      command: `pnpm -C examples/${exampleName} run dev --port ${port}`,
      url: `http://localhost:${port}`,
      reuseExistingServer: !process.env.CI,
      timeout: 60000,
    }));
  }

  // For local development, start all servers but reuse existing ones
  // This allows tests to run without manual server management
  return Object.entries(EXAMPLE_PORT_MAP).map(([exampleName, port]) => ({
    command: `pnpm -C examples/${exampleName} run dev --port ${port}`,
    url: `http://localhost:${port}`,
    reuseExistingServer: true,
    timeout: 60000,
  }));
};
