/**
 * ESBuild Raw Loader Plugin
 *
 * Loads files with ?raw suffix as text strings
 * Based on: https://github.com/hannoeru/esbuild-plugin-raw
 *
 * Example: import code from './file.js?raw'
 * Result: code will be a string containing the file contents
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Plugin } from 'esbuild';

/**
 * Create ESBuild plugin for loading raw files
 */
export default function rawPlugin(): Plugin {
  return {
    name: 'raw',
    setup(build) {
      // Resolve paths ending with ?raw
      build.onResolve({ filter: /\?raw$/ }, args => {
        const resolvedPath = join(args.resolveDir, args.path);
        return {
          path: resolvedPath,
          namespace: 'raw-loader',
        };
      });

      // Load raw files as text
      build.onLoad({ filter: /\?raw$/, namespace: 'raw-loader' }, async args => {
        const contents = await readFile(args.path.replace(/\?raw$/, ''));
        return {
          contents,
          loader: 'text',
        };
      });
    },
  };
}
