/// <reference types="vite/client" />
// @vitest-environment node
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type Plugin, build } from 'vite';
import unplugin from '../src/index';

const fixtures = import.meta.glob('./fixtures/*.tsx');

describe('hMR - Vite Platform', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should work with vite', async () => {
    for (const path of Object.keys(fixtures)) {
      const entry = join(__dirname, path);

      const result = await build({
        root: __dirname,
        configFile: false,
        plugins: [
          unplugin.vite({
            hmr: true,
          }) as Plugin,
        ],
        build: {
          write: false,
          minify: false,
          lib: {
            entry,
            formats: ['es'],
            fileName: 'bundle',
          },
          rollupOptions: {
            external: ['essor'],
          },
        },
      });

      // result can be RollupOutput | RollupOutput[] | RollupWatcher
      if ('output' in result) {
        const output = result.output;
        // Verify we have output
        expect(output.length).toBeGreaterThan(0);
        const code = output[0].code;

        expect(code).toContain('createHMRComponent');
        expect(code).toContain('virtual:essor-hmr');
        expect(code).toMatchSnapshot();
      } else if (Array.isArray(result)) {
        // Handle array case if needed, though lib mode usually returns one
        const code = result[0].output[0].code;
        expect(code).toMatchSnapshot();
      }
    }
  });
});
