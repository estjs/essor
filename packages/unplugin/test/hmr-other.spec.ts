// @vitest-environment node
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { transform } from 'esbuild';
import { rollup } from 'rollup';
import unplugin from '../src/index';

const fixtures = import.meta.glob('./fixtures/*.tsx');

describe('hMR - Rollup Platform', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should work with rollup', async () => {
    for (const path of Object.keys(fixtures)) {
      const entry = join(__dirname, path);

      const bundle = await rollup({
        input: entry,
        plugins: [
          unplugin.rollup({
            hmr: true,
          }),
          {
            name: 'esbuild-transform',
            async transform(code, id) {
              if (id.endsWith('.tsx') || id.endsWith('.ts')) {
                const result = await transform(code, { loader: 'tsx' });
                return result.code;
              }
            },
          },
        ],
        external: ['essor'],
      });

      const { output } = await bundle.generate({
        format: 'es',
        exports: 'auto',
      });

      const code = output[0].code;

      expect(code).toContain('createHMRComponent');
      expect(code).toMatchSnapshot();
    }
  });
});
