export const EXAMPLE_REGISTRY = {
  'signals': { port: 4101 },
  'todo-mvc': { port: 4102 },
  'fragment': { port: 4103 },
  'binding': { port: 4104 },
  'provide': { port: 4105 },
  'portal': { port: 4106 },
  'suspense': { port: 4107 },
  'hmr': { port: 4108 },
  'hydrate': { port: 4109 },
  'transition': { port: 4110 },
  'todo-server': { port: 4111, serverMode: true },
  'watch-effect': { port: 4112 },
  'store': { port: 4113 },
  'for-list': { port: 4114 },
  'async-ssr': { port: 4115, serverMode: true },
  'error-handling': { port: 4116 },
} as const;

export const E2E_READY_PORT = 4199;

export type ExampleName = keyof typeof EXAMPLE_REGISTRY;

/** Whether this example must be served by its own `node server.js` instead of plain Vite. */
export function getExampleServerMode(exampleName: ExampleName): boolean {
  return (EXAMPLE_REGISTRY[exampleName] as { serverMode?: boolean }).serverMode ?? false;
}

export function getExamplePort(exampleName: ExampleName) {
  return EXAMPLE_REGISTRY[exampleName].port;
}

export function getExampleUrl(exampleName: ExampleName) {
  return `http://localhost:${getExamplePort(exampleName)}`;
}

export function getSelectedExampleNames() {
  const filterRaw = process.env.E2E_EXAMPLES ?? process.env.E2E_EXAMPLE;

  if (!filterRaw) {
    return Object.keys(EXAMPLE_REGISTRY) as ExampleName[];
  }

  const requested = filterRaw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean) as ExampleName[];

  return requested;
}

export function getPrimaryExampleUrl() {
  const [first] = getSelectedExampleNames();
  return getExampleUrl(first ?? 'signals');
}

export function getE2eReadyUrl() {
  return `http://127.0.0.1:${E2E_READY_PORT}/ready`;
}
