// @ts-check
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rspack } from '@rspack/core';
import essor from 'unplugin-essor/rspack';

const __dirname = dirname(fileURLToPath(import.meta.url));

const isE2E = !!process.env.E2E;

/**
 * When RSPACK_E2E_FIXTURE is set (by hmr-rspack.spec.ts), entry and template
 * point at the fixture's temp directory. Otherwise fall back to the example root.
 */
const fixtureDir = process.env.RSPACK_E2E_FIXTURE ?? __dirname;

/** @type {import('@rspack/core').Configuration} */
export default {
  mode: 'development',
  context: fixtureDir,
  entry: './src/main.tsx',
  devtool: 'cheap-module-source-map',

  output: {
    path: resolve(fixtureDir, 'dist-rspack'),
    filename: 'bundle.js',
    publicPath: '/',
  },

  resolve: {
    extensions: ['.tsx', '.ts', '.jsx', '.js'],
    // Always resolve node_modules from the example root (workspace packages).
    modules: [resolve(__dirname, 'node_modules'), 'node_modules'],
  },

  module: {
    rules: [
      {
        test: /\.[cm]?[jt]sx?$/,
        // unplugin-essor/rspack handles JSX via babel — run swc after to strip
        // TypeScript syntax that babel left in (babel jsx:preserve mode).
        enforce: 'post',
        use: {
          loader: 'builtin:swc-loader',
          options: {
            jsc: {
              parser: {
                syntax: 'typescript',
                tsx: true,
              },
              // Do NOT set transform.react here; essor babel plugin already
              // transformed JSX into essor runtime calls.
            },
          },
        },
        type: 'javascript/auto',
      },
    ],
  },

  plugins: [
    new rspack.HtmlRspackPlugin({
      template: resolve(fixtureDir, 'index.html'),
    }),
    essor({
      hmr: true,
      mode: 'client',
    }),
  ],

  devServer: isE2E
    ? {
        hot: true,
        liveReload: false,
        // Only watch the fixture src so file patches trigger HMR.
        watchFiles: {
          paths: [resolve(fixtureDir, 'src/**/*')],
        },
      }
    : {
        hot: true,
      },
};
