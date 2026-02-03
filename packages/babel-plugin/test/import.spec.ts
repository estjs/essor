import { beforeEach, describe, expect, it } from 'vitest';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import {
  addImport,
  clearImport,
  createImport,
  createImportIdentifiers,
  importMap,
  importedSets,
} from '../src/import';
import type * as t from '@babel/types';
import type { PluginState } from '../src/types';

function getProgramPath(code: string) {
  const ast = parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'typescript'],
  });

  let programPath: any;
  traverse(ast, {
    Program(path) {
      programPath = path;
      path.stop();
    },
  });

  if (!programPath) {
    throw new Error('Failed to locate Program path');
  }

  return programPath;
}

function createState(mode: PluginState['opts']['mode'] = 'client') {
  return {
    opts: { mode, hmr: false, props: true, styled: true, symbol: '$' },
    imports: {} as Record<string, t.Identifier>,
    declarations: [] as t.VariableDeclarator[],
    events: new Set<string>(),
    filename: 'test.tsx',
  } satisfies PluginState;
}

describe('import utilities', () => {
  beforeEach(() => {
    clearImport();
  });

  it('creates unique identifiers for every import mapping', () => {
    const program = getProgramPath('const value = 1;');
    const identifiers = createImportIdentifiers(program);

    expect(Object.keys(identifiers)).toHaveLength(Object.keys(importMap).length);
    const uniqueNames = new Set(Object.values(identifiers).map(identifier => identifier.name));
    expect(uniqueNames.size).toBe(Object.keys(identifiers).length);
  });

  it('registers imports and injects declaration for client mode', () => {
    const program = getProgramPath('const message = "hello";');
    const state = createState('client');
    state.imports = createImportIdentifiers(program);
    program.state = state;

    addImport(importMap.template);
    addImport(importMap.insert);
    createImport(program, state.imports, 'essor');

    expect(program.node.body[0]).toMatchObject({
      type: 'ImportDeclaration',
      source: { value: 'essor' },
    });
    expect(program.node.body[0].specifiers).toHaveLength(2);
    expect(importedSets.size).toBe(2);
  });

  it('maps identifiers for SSG aliases', () => {
    const program = getProgramPath('const app = 1;');
    const state = createState('ssg');
    state.imports = createImportIdentifiers(program);
    program.state = state;

    addImport(importMap.createComponent);
    addImport(importMap.patchAttr);
    createImport(program, state.imports, 'essor');

    const specifiers = (program.node.body[0] as t.ImportDeclaration).specifiers;
    const importedNames = specifiers.map(
      spec => ((spec as t.ImportSpecifier).imported as t.Identifier).name,
    );
    expect(importedNames).toContain('createSSGComponent');
    expect(importedNames).toContain('setSSGAttr');
  });

  it('maps identifiers for SSR aliases', () => {
    const program = getProgramPath('const title = "ssr";');
    const state = createState('ssr');
    state.imports = createImportIdentifiers(program);
    program.state = state;

    addImport(importMap.mapNodes);
    addImport(importMap.template);
    createImport(program, state.imports, 'essor');

    const specifiers = (program.node.body[0] as t.ImportDeclaration).specifiers;
    const imported = specifiers.map(
      spec => ((spec as t.ImportSpecifier).imported as t.Identifier).name,
    );
    expect(imported).toContain('mapSSRNodes');
    expect(imported).toContain('getRenderedElement');
  });

  it('throws informative error when identifier is missing', () => {
    const program = getProgramPath('const demo = true;');
    const state = createState('client');
    state.imports = createImportIdentifiers(program);
    delete state.imports.insert; // simulate missing identifier
    program.state = state;

    addImport(importMap.insert);
    expect(() => createImport(program, state.imports, 'essor')).toThrowError(
      /Import identifier not found/,
    );
  });
});
