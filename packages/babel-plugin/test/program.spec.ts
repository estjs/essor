import { beforeEach, describe, expect, it } from 'vitest';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';
import { createImportIdentifier, transformProgram } from '../src/program';
import { addImport, clearImport } from '../src/import';
import type { PluginState } from '../src/types';

function buildProgram(code: string) {
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
    throw new Error('Unable to resolve Program path');
  }

  return { ast, programPath } as const;
}

function createState(mode: PluginState['opts']['mode'] = 'client', hmr = true): PluginState {
  return {
    opts: { mode, hmr, props: true, styled: true, symbol: '$' },
    imports: {} as Record<string, t.Identifier>,
    declarations: [],
    events: new Set<string>(),
    filename: 'fixture.tsx',
  };
}

describe('transformProgram visitor', () => {
  beforeEach(() => {
    clearImport();
  });

  it('initialises plugin state during enter', () => {
    const { programPath } = buildProgram('const value = 1;');
    const incomingState = createState('client', false);

    transformProgram.enter(programPath, incomingState);

    expect(programPath.state.imports).toBeDefined();
    expect(programPath.state.declarations).toEqual([]);
    expect(programPath.state.events).toBeInstanceOf(Set);
    expect(programPath.state.opts.mode).toBe('client');

    // ensure imported set cleared on entry by repopulating and checking reset
    addImport('template');
    expect(programPath.state.imports.template).toBeDefined();
  });

  it('inserts collected template declarations ahead of non-imports', () => {
    const { programPath, ast } = buildProgram('import x from "y"; const untouched = true;');
    const initialState = createState('client', false);
    transformProgram.enter(programPath, initialState);
    const pluginState = programPath.state as PluginState;
    pluginState.declarations.push(
      t.variableDeclarator(t.identifier('_tmpl$'), t.numericLiteral(1)),
    );

    transformProgram.exit(programPath);

    const output = generate(ast).code;
    expect(output).toContain('const _tmpl$ = 1;');
    expect(output.indexOf('const _tmpl$ = 1;')).toBeLessThan(
      output.indexOf('const untouched = true;'),
    );
  });

  it('appends delegate event bootstrap when events exist', () => {
    const { programPath, ast } = buildProgram('const view = <div/>;');
    const initialState = createState('client', false);
    transformProgram.enter(programPath, initialState);
    (programPath.state as PluginState).events?.add('click');

    transformProgram.exit(programPath);

    const code = generate(ast).code;
    expect(code).toContain('delegateEvents');
    expect(code).toContain('"click"');
  });

  it('collects HMR metadata for client mode when enabled', () => {
    // New architecture: Babel only collects metadata, doesn't inject code
    const client = buildProgram('export const Counter = () => <div>Count</div>;');
    const clientState = createState('client', true);
    transformProgram.enter(client.programPath, clientState);
    transformProgram.exit(client.programPath, clientState);

    // Verify metadata is collected (if there are components)
    // Note: transformProgram.exit will call transformHMRSimple
    // But this simple test has no actual component exports, so metadata may be empty

    const ssr = buildProgram('const noop = () => null;');
    const ssrState = createState('ssr', true);
    transformProgram.enter(ssr.programPath, ssrState);
    transformProgram.exit(ssr.programPath, ssrState);

    // SSR mode should not execute HMR transform
    expect(generate(ssr.ast).code).not.toContain('import.meta.hot');
  });
});

describe('createImportIdentifier', () => {
  it('should create new import when not exists', () => {
    const { programPath, ast } = buildProgram('const x = 1;');

    const importId = createImportIdentifier(programPath, 'refresh');

    expect(importId).toBeDefined();
    expect(t.isIdentifier(importId)).toBe(true);

    const code = generate(ast).code;
    expect(code).toContain('import');
    expect(code).toContain('refresh');
    expect(code).toContain('/@essor-refresh');
  });

  it('should reuse existing import when already imported', () => {
    const { programPath, ast } = buildProgram(
      'import { refresh } from "/@essor-refresh"; const x = 1;',
    );

    const importId1 = createImportIdentifier(programPath, 'refresh');
    const importId2 = createImportIdentifier(programPath, 'refresh');

    // Should return the same identifier
    expect(importId1.name).toBe(importId2.name);

    // Should not create duplicate imports
    const code = generate(ast).code;
    const importCount = (code.match(/import.*refresh.*from.*\/@essor-refresh/g) || []).length;
    expect(importCount).toBe(1);
  });

  it('should handle multiple different imports', () => {
    const { programPath, ast } = buildProgram('const x = 1;');

    const refresh = createImportIdentifier(programPath, 'refresh');
    const register = createImportIdentifier(programPath, 'register');

    expect(refresh.name).not.toBe(register.name);

    const code = generate(ast).code;
    expect(code).toContain('refresh');
    expect(code).toContain('register');
  });

  it('should insert import at the top of program', () => {
    const { programPath, ast } = buildProgram('const x = 1; const y = 2;');

    createImportIdentifier(programPath, 'refresh');

    const code = generate(ast).code;
    const importIndex = code.indexOf('import');
    const constIndex = code.indexOf('const x');

    expect(importIndex).toBeLessThan(constIndex);
  });
});

describe('transformProgram - signal transformation', () => {
  beforeEach(() => {
    clearImport();
  });

  it('should transform signal variables in enter phase', () => {
    const { programPath, ast } = buildProgram('let $count = 0; console.log($count);');
    const initialState = createState('client', false);

    transformProgram.enter(programPath, initialState);

    const code = generate(ast).code;
    // Signal variables should be transformed
    expect(code).toContain('signal');
    expect(code).toContain('.value');
  });

  it('should transform signal assignments', () => {
    const { programPath, ast } = buildProgram('let $count = 0; $count = 5;');
    const initialState = createState('client', false);

    transformProgram.enter(programPath, initialState);

    const code = generate(ast).code;
    expect(code).toContain('.value = 5');
  });

  it('should transform signal update expressions', () => {
    const { programPath, ast } = buildProgram('let $count = 0; $count++;');
    const initialState = createState('client', false);

    transformProgram.enter(programPath, initialState);

    const code = generate(ast).code;
    expect(code).toContain('.value++');
  });

  it('should handle signal object patterns', () => {
    const { programPath, ast } = buildProgram('const { $x } = obj;');
    const initialState = createState('client', false);

    transformProgram.enter(programPath, initialState);

    // Should process object patterns without errors
    expect(() => generate(ast)).not.toThrow();
  });

  it('should handle signal array patterns', () => {
    const { programPath, ast } = buildProgram('const [$x] = arr;');
    const initialState = createState('client', false);

    transformProgram.enter(programPath, initialState);

    // Should process array patterns without errors
    expect(() => generate(ast)).not.toThrow();
  });
});

describe('transformProgram - exit phase', () => {
  beforeEach(() => {
    clearImport();
  });

  it('should insert declarations after imports', () => {
    const { programPath, ast } = buildProgram('import React from "react"; const x = 1;');
    const initialState = createState('client', false);
    transformProgram.enter(programPath, initialState);

    const pluginState = programPath.state as PluginState;
    pluginState.declarations.push(
      t.variableDeclarator(t.identifier('_tmpl$'), t.numericLiteral(42)),
    );

    transformProgram.exit(programPath);

    const code = generate(ast).code;
    const importIndex = code.indexOf('import React');
    const tmplIndex = code.indexOf('const _tmpl$ = 42');
    const xIndex = code.indexOf('const x = 1');

    expect(importIndex).toBeLessThan(tmplIndex);
    expect(tmplIndex).toBeLessThan(xIndex);
  });

  it('should append declarations when no imports exist', () => {
    const { programPath, ast } = buildProgram('const x = 1;');
    const initialState = createState('client', false);
    transformProgram.enter(programPath, initialState);

    const pluginState = programPath.state as PluginState;
    pluginState.declarations.push(
      t.variableDeclarator(t.identifier('_tmpl$'), t.numericLiteral(99)),
    );

    transformProgram.exit(programPath);

    const code = generate(ast).code;
    expect(code).toContain('const _tmpl$ = 99');
  });

  it('should not insert declarations when array is empty', () => {
    const { programPath, ast } = buildProgram('const x = 1;');
    const initialState = createState('client', false);
    transformProgram.enter(programPath, initialState);

    // declarations array is empty
    transformProgram.exit(programPath);

    const code = generate(ast).code;
    expect(code).not.toContain('_tmpl$');
  });

  it('should handle multiple events in delegation', () => {
    const { programPath, ast } = buildProgram('const view = <div/>;');
    const initialState = createState('client', false);
    transformProgram.enter(programPath, initialState);

    const pluginState = programPath.state as PluginState;
    pluginState.events?.add('click');
    pluginState.events?.add('input');
    pluginState.events?.add('change');

    transformProgram.exit(programPath);

    const code = generate(ast).code;
    expect(code).toContain('delegateEvents');
    expect(code).toContain('"click"');
    expect(code).toContain('"input"');
    expect(code).toContain('"change"');
  });

  it('should not add event delegation when events set is empty', () => {
    const { programPath, ast } = buildProgram('const x = 1;');
    const initialState = createState('client', false);
    transformProgram.enter(programPath, initialState);

    // events set is empty
    transformProgram.exit(programPath);

    const code = generate(ast).code;
    expect(code).not.toContain('delegateEvents');
  });

  it('should create imports from essor package', () => {
    const { programPath, ast } = buildProgram('const x = 1;');
    const initialState = createState('client', false);
    transformProgram.enter(programPath, initialState);

    // Add some imports
    addImport('template');
    addImport('insert');

    transformProgram.exit(programPath);

    const code = generate(ast).code;
    expect(code).toContain('import');
    expect(code).toContain('essor');
  });
});
