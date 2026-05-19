import process from 'node:process';
import { defineConfig } from 'tsup';
import pkg from './package.json';

const env = process.env.NODE_ENV;

const banner = `/**
* ${pkg.name} v${pkg.version}
* build time ${new Date().toISOString()}
* (c) 2023-Present jiangxd <jiangxd2016@gmail.com>
* @license MIT
**/`;

export function createCoreBuildConfig(nodeEnv = env) {
  const isDev = nodeEnv !== 'production';

  return defineConfig({
    entryPoints: {
      essor: './src/index.ts',
      server: './src/server.ts',
    },
    outDir: 'dist',
    format: ['cjs', 'esm'],
    target: 'es2016',
    dts: true,
    shims: true,
    clean: true,
    banner: {
      js: banner,
    },
    treeshake: true,
    cjsInterop: true,
    sourcemap: isDev,
    external: ['@estjs/shared', '@estjs/template', '@estjs/signals', '@estjs/server'],
    minify: !isDev,
    tsconfig: '../../tsconfig.build.json',
    define: {
      __DEV__: isDev ? 'true' : 'false',
    },
    outExtension({ format }) {
      return {
        js: `${isDev ? '.dev' : ''}.${format}.js`,
      };
    },
  });
}

export default createCoreBuildConfig();
