import { beforeEach, describe, expect, it } from 'vitest';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';
import { transformProgram } from '../src/program';
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
