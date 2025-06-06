import path from 'path';
import { NodePath, types as t, transformSync } from '@babel/core';
import pluginTester from 'babel-plugin-tester';
import essorPlugin from '../src/index';
import { clearImport, createImportIdentifiers, importedSets } from '../src/import';
import { resetContext, setContext } from '../src/jsx/context';
import type { State } from '../src/types';

/**
 * Test utility functions for Babel plugin testing
 * Provides unified test environment setup and common test helper functions
 */

// Clean up the test environment and reset state
export function setupTestEnvironment() {
  clearImport();
  resetContext();
}

/**
 * Use babel-plugin-tester to test plugin transformations
 *
 * @param tests Test cases array
 * @param pluginOptions Plugin options
 */
export function testPlugin(tests: any[], pluginOptions: Record<string, any> = { mode: 'client' }) {
  return pluginTester({
    plugin: essorPlugin,
    pluginName: 'essor-babel-plugin',
    pluginOptions,
    babelOptions: {
      parserOpts: {
        plugins: ['jsx', 'typescript'],
      },
    },
    tests,
  });
}

/**
 * Test plugin transformations using fixtures directory
 *
 * @param fixturesDir Path to fixtures directory
 * @param pluginOptions Plugin options
 */
export function testPluginWithFixtures(
  fixturesDir: string,
  pluginOptions: Record<string, any> = { mode: 'client' },
) {
  return pluginTester({
    plugin: essorPlugin,
    pluginName: 'essor-babel-plugin',
    pluginOptions,
    babelOptions: {
      parserOpts: {
        plugins: ['jsx', 'typescript'],
      },
    },
    fixtures: fixturesDir,
  });
}

/**
 * Transform code and execute a callback with the program path and state
 *
 * @param code Source code
 * @param mode Rendering mode
 * @param callback Function to call with the program path and state
 */
export function withTestContext<T>(
  code: string,
  mode: 'client' | 'ssg' | 'ssr' = 'client',
  options: Record<string, any> = {},
  callback: (context: { path: NodePath<t.Program>; state: State }) => T,
): T {
  setupTestEnvironment();

  let programPath: NodePath<t.Program> | null = null;
  let programState: State | null = null;

  transformSync(code, {
    plugins: [
      // First plugin to capture path and state
      {
        visitor: {
          Program(path: NodePath<t.Program>, state: State) {
            programPath = path;
            programState = state;
            programState.imports = createImportIdentifiers(path);
          },
        },
      },
      [essorPlugin, { mode, ...options }],
    ],
    filename: 'test.tsx',
    parserOpts: {
      plugins: ['jsx', 'typescript'],
    },
    babelrc: false,
    configFile: false,
  });

  if (!programPath || !programState) {
    throw new Error('Failed to get program path or state');
  }

  setContext({ path: programPath as any, state: programState });
  return callback({ path: programPath, state: programState });
}

/**
 * Test with snapshot
 *
 * @param title Test title
 * @param code Input code
 * @param pluginOptions Plugin options
 */
export function testWithSnapshot(
  title: string,
  code: string,
  pluginOptions: Record<string, any> = { mode: 'client' },
) {
  return pluginTester({
    plugin: essorPlugin,
    pluginName: 'essor-babel-plugin',
    pluginOptions,
    babelOptions: {
      parserOpts: {
        plugins: ['jsx', 'typescript'],
      },
    },
    snapshot: true,
    tests: [{ title, code }],
  });
}

/**
 * Create AST nodes for direct testing
 *
 * @param nodeFactory Factory function that creates test nodes
 * @returns Created AST node
 */
export function createASTNode<T>(nodeFactory: () => T): T {
  return nodeFactory();
}

/**
 * Helper function: Check if import set contains the specified import
 *
 * @param importName Import name
 */
export function expectImported(importName: string): void {
  expect(importedSets.has(importName)).toBe(true);
}

/**
 * Helper function to find a specific node in code
 *
 * @param code Source code
 * @param nodeType Type of node to find
 * @param callback Function to call with the found node path
 */
export function findNodePath<T extends t.Node, R>(
  code: string,
  nodeType: string,
  callback: (path: NodePath<T>) => R,
): R | null {
  let result: R | null = null;
  let found = false;

  transformSync(code, {
    plugins: [
      {
        visitor: {
          [nodeType](path: NodePath<T>) {
            if (!found) {
              result = callback(path);
              found = true;
              path.stop();
            }
          },
        },
      },
    ],
    filename: 'test.tsx',
    parserOpts: {
      plugins: ['jsx', 'typescript'],
    },
    babelrc: false,
    configFile: false,
  });

  return result;
}

/**
 * Transform the given code and call the callback with the resulting code
 *
 * @param code Source code
 * @param pluginOptions Plugin options
 * @param callback Function to call with the transformed code
 */
export function transformAndTest(
  code: string,
  pluginOptions: Record<string, any> = { mode: 'client' },
  callback: (result: string) => void,
): void {
  setupTestEnvironment();

  const result = transformSync(code, {
    plugins: [[essorPlugin, pluginOptions]],
    filename: 'test.tsx',
    parserOpts: {
      plugins: ['jsx', 'typescript'],
    },
    babelrc: false,
    configFile: false,
  });

  if (result && result.code) {
    callback(result.code);
  } else {
    throw new Error('Transform failed to produce code');
  }
}
