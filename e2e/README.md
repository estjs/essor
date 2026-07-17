# E2E Tests

Playwright end-to-end tests that drive the projects under `examples/` in real browsers.

## Architecture

```
playwright.config.ts        browsers, retries, webServer bootstrap
e2e/example-registry.ts     example name → port (+ serverMode) mapping
e2e/web-server.ts           spawns one dev server per example, signals ready on :4199
e2e/test-utils.ts           examplePage() fixture, assertNoConsoleErrors()
e2e/<name>.spec.ts          one spec per example
```

- Every example gets a **fixed port** (4101–4116, see the registry). Plain
  client examples are served by Vite; `serverMode: true` examples
  (todo-server, async-ssr) run their own `node server.js`.
- `web-server.ts` starts everything, then serves `/ready` on port 4199 —
  Playwright's `webServer.url` polls that endpoint.
- Specs use the `examplePage('<name>')` fixture, which navigates and waits
  for `[data-test="example-root"]` to be visible.
- `assertNoConsoleErrors()` collects `console.error` + uncaught page errors
  for the whole test and asserts the list is empty (supports
  `ignorePatterns` for expected noise).

## Running

```bash
pnpm test:e2e                              # full matrix (all examples × all projects)
npx playwright test e2e/portal.spec.ts     # one spec, all browser projects
npx playwright test --project=chromium     # one browser

# Start only the servers a spec needs (much faster iteration):
E2E_EXAMPLES=portal npx playwright test e2e/portal.spec.ts --project=chromium
E2E_EXAMPLES=todo-mvc,binding npx playwright test e2e/todo-mvc.spec.ts e2e/binding.spec.ts
```

## Browser projects

| Project | Devices | Scope |
|---------|---------|-------|
| chromium / firefox / webkit | Desktop | all specs |
| mobile-chrome | Pixel 5 | todo-mvc, binding, hydrate (core interactive flows) |

## Local vs CI differences

| | Local | CI |
|---|-------|-----|
| Workers | unlimited (parallel) | 1 (serial) |
| Retries | 1 | 2 |
| Dev-server reuse | reuses running servers | always fresh |
| Server start timeout (HMR fixtures) | 30–45 s | ×3 |

Because local runs are parallel and CI is serial, a race that passes locally
can still fail in CI (and vice versa). Reproduce the CI behavior locally with:

```bash
CI=1 npx playwright test
```

## Writing specs — house rules

1. **No `waitForTimeout` for state waiting.** Use auto-retrying assertions
   (`toHaveText`, `toHaveClass`, `toHaveCount`, `expect.poll`). A fixed sleep
   is acceptable only for verifying that a *duration* elapsed, and must carry
   a comment explaining why (see `transition.spec.ts` for the one allowed case).
2. **`data-test` attributes for selectors**, `getByRole` for interactions.
3. Every spec should include at least one `assertNoConsoleErrors()` case.
4. New examples must be registered in `example-registry.ts` (next free port)
   and get a spec file with the same name.

## HMR specs

`hmr.spec.ts` (Vite) and `hmr-rspack.spec.ts` copy `examples/hmr/src` into a
per-test temp dir (`examples/hmr/temp*/<testId>-<port>`, gitignored), start a
throwaway dev server on a free port, patch source files, and assert hot
updates land without a full reload (guarded by a page token that a reload
would destroy). Servers are killed by process group with a SIGKILL fallback;
temp dirs are removed best-effort.

## Troubleshooting

- **`Port 41xx is already in use`** — a previous run left a server behind
  (usually after Ctrl-C). Kill it: `pkill -f 'vite --port 41'` and
  `pkill -f 'server.js'`.
- **WebSocket errors on port 24678** — same cause: a stray Vite HMR socket
  from a leaked dev server; kill stray processes as above.
- **todo-server production specs** build the example once in `beforeAll` and
  copy `dist` → `dist-ssr` / `dist-ssg` so the two prod servers never mutate
  each other's files; they run `serial` within their describe block.
