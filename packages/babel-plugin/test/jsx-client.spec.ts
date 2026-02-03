import { describe, expect, it } from 'vitest';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import generate from '@babel/generator';
import * as t from '@babel/types';
import {
  createAttributeStatement,
  createInsertArguments,
  processIIFEExpression,
  transformJSXToClient,
} from '../src/jsx/client';
import { createTree } from '../src/jsx/tree';
import { resetContext, setContext } from '../src/jsx/context';
import { transformProgram } from '../src/program';
import { createImportIdentifiers } from '../src/import';
import type { DynamicContent } from '../src/jsx/shared';

describe('jsx client helpers', () => {
  it('builds attribute setter statements', () => {
    const fnIdentifier = t.identifier('_patchAttr$');
    const nodes = t.identifier('_nodes');
    const stmt = createAttributeStatement(
      fnIdentifier,
      nodes,
      0,
      t.stringLiteral('value'),
      t.stringLiteral('data-id'),
    );
    expect((stmt.expression as t.CallExpression).callee).toBe(fnIdentifier);
    expect((stmt.expression as t.CallExpression).arguments).toHaveLength(3);
  });

  it('unwraps immediately invoked function expressions', () => {
    const expr = parse('(() => 5)()').program.body[0] as t.ExpressionStatement;
    const optimised = processIIFEExpression(expr.expression as t.Expression);
    expect((optimised as t.NumericLiteral).value).toBe(5);
  });

  it('creates insert arguments using index lookup', () => {
    const args = createInsertArguments(
      { parentIndex: 2, before: 3, node: t.identifier('value') } as DynamicContent,
      t.identifier('_nodes'),
      new Map([
        [1, 0],
        [2, 1],
        [3, 2],
      ]),
    );
    expect(args.length).toBe(3);
  });

  it('throws when required parent index is absent', () => {
    expect(() =>
      createInsertArguments(
        { parentIndex: null, node: t.identifier('x') } as DynamicContent,
        t.identifier('_nodes'),
        new Map(),
      ),
    ).toThrowError(/missing valid parent node index/);
  });

  it('transforms JSX elements with dynamic props and children', () => {
    const code = `
      const view = (
        <button class={state.className} onClick={() => count++}>
          {label}
        </button>
      );
    `;
    const ast = parse(code, { sourceType: 'module', plugins: ['jsx', 'typescript'] });

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

    transformProgram.enter(programPath, { opts: { mode: 'client', hmr: false } });
    const state = programPath.state;
    state.imports = createImportIdentifiers(programPath);
    jsxPath.state = state;

    const tree = createTree(jsxPath);
    setContext({ state, path: jsxPath, operationIndex: 0 });
    const transformed = transformJSXToClient(jsxPath, tree);
    resetContext();

    expect(transformed.type).toBe('CallExpression');
    const codeOut = generate(transformed).code;
    expect(codeOut).toContain('mapNodes');
    expect(codeOut).toContain('memoEffect');
  });
});
