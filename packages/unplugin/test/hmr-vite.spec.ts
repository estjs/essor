/// <reference types="vite/client" />
// @vitest-environment node
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { unpluginFactory } from '../src/index';

const fixtures = import.meta.glob('./fixtures/*.tsx');

describe('hMR - Vite Platform', () => {
  it('should enable hmr for vite serve transforms', () => {
    const previousNodeEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    try {
      const plugin = unpluginFactory(
        {
          hmr: true,
        },
        { framework: 'vite' } as never,
      ) as any;

      plugin.vite?.configResolved?.({ command: 'serve' });

      for (const path of Object.keys(fixtures)) {
        const entry = join(__dirname, path);
        const source = readFileSync(entry, 'utf8');
        const result = plugin.transform?.call({}, source, entry);

        expect(result).toBeTruthy();

        const code = typeof result === 'string' ? result : result.code;
        expect(code).toContain('createHMRComponent');
        expect(code).toContain('virtual:essor-hmr');
        expect(code).toContain('import.meta.hot');
        expect(code).toContain('__hmrId');
        expect(code).toMatchSnapshot();
      }
    } finally {
      if (previousNodeEnv === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = previousNodeEnv;
      }
    }
  });
});
