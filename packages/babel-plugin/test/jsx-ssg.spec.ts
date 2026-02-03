import { describe, expect, it } from 'vitest';
import { parse, parseExpression } from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import { processAttributes, transformJSXToSSG } from '../src/jsx/ssg';
import { transformProgram } from '../src/program';
import { createImportIdentifiers } from '../src/import';
import { createTree } from '../src/jsx/tree';
import { resetContext, setContext } from '../src/jsx/context';

describe('jSX SSG helpers', () => {
  it('separates static and dynamic attributes', () => {
    const attrs = processAttributes({ id: 'foo', title: 'bar', href: undefined, data: 'x' });
    expect(attrs.staticAttrs).toContain(' id="foo"');
    expect(attrs.dynamicAttrs).toHaveLength(0);

    const dynamicAttrs = processAttributes({ title: parseExpression('value') });
    expect(dynamicAttrs.dynamicAttrs).toHaveLength(1);
  });

  it('generates render call for SSG mode', () => {
    const ast = parse('const view = <div id={id} class="static">content</div>;', {
      sourceType: 'module',
      plugins: ['jsx'],
    });

    let programPath: any;
    let jsxPath: any;
    traverse(ast, {
      Program(path) {
        programPath = path;
      },
      JSXElement(path) {
        jsxPath = path;
      },
    });

    transformProgram.enter(programPath, { opts: { mode: 'ssg', hmr: false } });
    const state = programPath.state;
    state.imports = createImportIdentifiers(programPath);
    jsxPath.state = state;

    const tree = createTree(jsxPath);
    setContext({ state, path: jsxPath, operationIndex: 0 });
    const result = transformJSXToSSG(jsxPath, tree);
    resetContext();

    expect(result.type).toBe('CallExpression');
    const code = generate(result).code;
    expect(code).toContain('render');
    expect(code).toContain('getHydrationKey');
  });
});
