import { defineConfig } from 'vite';
import Essor from 'unplugin-essor/vite';

// Single isomorphic config. The Essor plugin compiles the client module graph
// in `hydrate` mode and auto-switches the SSR module graph to `server` mode
// (it inspects Vite's active environment), so the same `App` powers both the
// server-rendered HTML and client hydration. Per-build output targets are
// passed on the CLI from package.json (client build vs `--ssr` server build).
export default defineConfig({
  base: '/',
  plugins: [
    Essor({
      mode: 'hydrate',
      hmr: false,
    }),
  ],
  server: process.env.E2E
    ? {
        hmr: false,
        watch: {
          ignored: ['**/*'],
        },
      }
    : undefined,
});
