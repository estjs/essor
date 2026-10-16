// @vitest-environment node
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { rollup } from 'rollup';
import unplugin from '../src/index';

const testDir = dirname(fileURLToPath(import.meta.url));
const fixture = resolve(testDir, 'fixtures/entry.tsx');

describe('rollup integration', () => {
  it('transforms a real TSX entry through the public Rollup adapter', async () => {
    const bundle = await rollup({
      input: fixture,
      external: ['essor'],
      plugins: [unplugin.rollup({ hmr: false })],
    });

    try {
      const generated = await bundle.generate({ format: 'es' });
      const code = generated.output[0].code;

      expect(code).toContain('createApp');
      expect(code).toContain('template');
      expect(code).toContain('Welcome');
      expect(code).not.toContain('return <main>');
    } finally {
      await bundle.close();
    }
  });

  it('can transform the fixture directly while preserving its source identity', async () => {
    const source = await readFile(fixture, 'utf8');
    const plugin = unplugin.raw({ hmr: false }, { framework: 'rollup' }) as any;
    const result = await plugin.transform.call({}, source, fixture);

    expect(result.map.sources).toEqual([expect.stringContaining('entry.tsx')]);
    expect(result.meta).toEqual({ ssr: false });
  });
});
