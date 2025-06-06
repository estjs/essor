import { type NodePath, type types as t, transformSync } from '@babel/core';
import essorPlugin from '../src/index';
import { clearImport } from '../src/import';
import { resetContext, setContext } from '../src/jsx/context';
import type { State } from '../src/types';

/**
 * 测试工具函数集合
 * 提供统一的测试环境设置和常用测试辅助函数
 */

// 设置测试上下文环境
export function setupTestContext(
  code = 'const A = () => <div/>;',
  mode: 'client' | 'ssg' | 'ssr' = 'client',
  options = {},
) {
  clearImport();
  resetContext();
  const { programPath, programState } = getProgramPathAndState(code, options, mode);

  setContext({ path: programPath!, state: programState! });
}

// Helper function: Get the path of a specific AST node
export const getPath = (
  code: string,
  nodeType: string,
  options: any = {},
  mode: 'client' | 'ssg' | 'ssr' = 'client',
) => {
  let targetPath: NodePath<any> | null = null;
  transformSync(code, {
    plugins: [
      () => ({
        visitor: {
          [nodeType](path: NodePath<any>) {
            targetPath = path;
            path.stop(); // Stop after finding the first one
          },
        },
      }),
      [essorPlugin, { mode, ...options }],
    ],
    filename: 'test.tsx',
    parserOpts: {
      plugins: ['jsx', 'typescript'],
    },
    babelrc: false,
    configFile: false,
  });
  return targetPath;
};

// Helper function: Get the Program path
export const getProgramPath = (
  code: string,
  options: any = {},
  mode: 'client' | 'ssg' | 'ssr' = 'client',
) => {
  let programPath: NodePath<t.Program> | null = null;
  transformSync(code, {
    plugins: [
      () => ({
        visitor: {
          Program(path: NodePath<t.Program>) {
            programPath = path;
            path.stop();
          },
        },
      }),
      [essorPlugin, { mode, ...options }],
    ],
    filename: 'test.tsx',
    parserOpts: {
      plugins: ['jsx', 'typescript'],
    },
    babelrc: false,
    configFile: false,
  });
  return programPath;
};

// Helper function: Get the Program path and state
export const getProgramPathAndState = (
  code: string,
  options: any = {},
  mode: 'client' | 'ssg' | 'ssr' = 'client',
) => {
  let programPath: NodePath<t.Program> | null = null;
  let programState: State | null = null;
  transformSync(code, {
    plugins: [
      () => ({
        visitor: {
          Program(path: NodePath<t.Program>, state: State) {
            programPath = path;
            programState = state;
            programState.imports = createImportIdentifiers(path);
            path.stop();
          },
        },
      }),
      [essorPlugin, { mode, ...options }],
    ],
    filename: 'test.tsx',
    parserOpts: {
      plugins: ['jsx', 'typescript'],
    },
    babelrc: false,
    configFile: false,
  });
  return { programPath, programState };
};
