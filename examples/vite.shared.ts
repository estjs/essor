import { type UserConfig, defineConfig, mergeConfig } from 'vite';
import essor from 'unplugin-essor/vite';

type ExampleOptions = {
  hmr?: boolean;
  mode?: 'client' | 'hydrate' | 'server';
  overrides?: UserConfig;
};

const e2eServerConfig = process.env.E2E
  ? {
      hmr: false,
      watch: {
        ignored: ['**/*'],
      },
    }
  : undefined;

export function createEssorExampleConfig(options: ExampleOptions = {}) {
  return mergeConfig(
    defineConfig({
      base: './',
      plugins: [
        essor({
          hmr: options.hmr ?? false,
          mode: options.mode ?? 'client',
        }),
      ],
      server: e2eServerConfig,
    }),
    options.overrides ?? {},
  );
}
