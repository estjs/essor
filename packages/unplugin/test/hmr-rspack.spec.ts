// @vitest-environment node
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rspack } from '@rspack/core';
import unplugin from '../src/index';

const fixtures = import.meta.glob('./fixtures/*.tsx');

describe('hMR - Rspack Platform', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should work with rspack', async () => {
    for (const path of Object.keys(fixtures)) {
      const entry = join(__dirname, path);

      await new Promise<void>((resolve, reject) => {
        rspack(
          {
            entry,
            mode: 'development',
            devtool: false,
            output: {
              path: join(tmpdir(), `rspack-test-${Date.now()}`),
              filename: 'bundle.js',
              library: {
                type: 'module',
              },
            },
            infrastructureLogging: {
              level: 'error',
            },
            plugins: [
              {
                name: 'test-swc-loader',
                apply(compiler) {
                  compiler.options.module.rules.push({
                    test: /\.tsx$/,
                    enforce: 'post',
                    use: {
                      loader: 'builtin:swc-loader',
                      options: {
                        jsc: {
                          parser: {
                            syntax: 'typescript',
                            tsx: true,
                          },
                        },
                      },
                    },
                    type: 'javascript/auto',
                  });
                },
              },
              unplugin.rspack({
                hmr: true,
              }),
            ],
            experiments: {
              outputModule: true,
            },
            externals: {
              essor: 'essor',
            },
          },
          (err, stats) => {
            if (err) return reject(err);
            if (stats?.hasErrors()) return reject(new Error(stats.toString()));

            const output = stats?.toJson({ source: true }).modules;
            if (!output) return reject(new Error('No output'));

            // Find the entry module output
            const entryModule = output.find(
              m => m.name && (m.name.endsWith(path) || m.name.includes(path.replace('./', ''))),
            );
            const code = entryModule?.source || '';

            try {
              expect(code).toContain('createHMRComponent');
              expect(code).toContain('virtual:essor-hmr');
              // Snapshot might be different from Vite, so we might need a separate snapshot or relaxed match
              expect(code).toMatchSnapshot();
              resolve();
            } catch (error) {
              reject(error);
            }
          },
        );
      });
    }
  });
});
