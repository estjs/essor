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
} as const;

export const E2E_READY_PORT = 4199;

export type ExampleName = keyof typeof EXAMPLE_REGISTRY;

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
