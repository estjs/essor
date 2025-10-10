import { describe, expect, it } from 'vitest';
import { parse, parseExpression } from '@babel/parser';
import * as t from '@babel/types';
import traverse from '@babel/traverse';
import {
  collectNodeIndexMap,
  convertValueToASTNode,
  createPropsObjectExpression,
  deepCheckObjectDynamic,
  findBeforeIndex,
  findIndexPosition,
  getSetFunctionForAttribute,
  isComponentName,
  isDynamicExpression,
  jsxElementNameToString,
  normalizeProps,
  optimizeChildNodes,
  processTextElementAddComment,
  serializeAttributes,
} from '../src/jsx/shared';
import { resetContext, setContext } from '../src/jsx/context';
import { createTree } from '../src/jsx/tree';
import { transformProgram } from '../src/program';
import { createImportIdentifiers } from '../src/import';
import { NODE_TYPE } from '../src/jsx/constants';

describe('jsx shared helpers', () => {
  it('detects component naming conventions', () => {
    expect(isComponentName('MyComponent')).toBe(true);
    expect(isComponentName('ns:Component')).toBe(true);
    expect(isComponentName('div')).toBe(false);
  });

  it('converts JSX element names to string', () => {
    const expr = parseExpression('Namespace.Component');
    expect(jsxElementNameToString(expr as any)).toBe('Namespace.Component');
  });

  it('identifies dynamic objects recursively', () => {
    const staticObj = parseExpression('({ width: "10px" })') as t.ObjectExpression;
    const dynamicObj = parseExpression('({ style: { color: value } })') as t.ObjectExpression;
    expect(deepCheckObjectDynamic(staticObj)).toBe(false);
    expect(deepCheckObjectDynamic(dynamicObj)).toBe(true);
  });

  it('normalizes props and merges class/style strings', () => {
    const normalized = normalizeProps({ class: 'a', className: 'b', style: 'color:red;' });
    expect(normalized.class).toBe('a b');
    expect(normalized.style).toBe('color:red;');
  });

  it('creates props object expressions for mixed values', () => {
    const ast = parse('const view = <div class="x" data={value} />;', {
      sourceType: 'module',
      plugins: ['jsx'],
    });
    let jsxPath: any;
    traverse(ast, {
      JSXElement(path) {
        jsxPath = path;
        path.stop();
      },
    });

    const state = {
      opts: { mode: 'client' },
      declarations: [],
      events: new Set<string>(),
      imports: createImportIdentifiers(jsxPath.scope.path as any),
    } as any;

    transformProgram.enter(jsxPath.scope.path as any, state);
    const tree = createTree(jsxPath); // to set context dependency
    setContext({ path: jsxPath, state, operationIndex: 0 });
    const propsExpr = createPropsObjectExpression(
      { class: 'x', data: t.identifier('value') },
      () => {
        throw new Error('should not convert nested JSX in this scenario');
      },
    );
    resetContext();

    expect(propsExpr.properties).toHaveLength(2);
  });

  it('selects proper setter based on attribute', () => {
    const { state } = (() => {
      const ast = parse('const node = <div />;', { sourceType: 'module', plugins: ['jsx'] });
      let programPath: any;
      traverse(ast, {
        Program(path) {
          programPath = path;
          path.stop();
        },
      });
      const state = {
        opts: { mode: 'client' },
        imports: createImportIdentifiers(programPath),
        declarations: [],
        events: new Set<string>(),
      };
      programPath.state = state;
      return { programPath, state };
    })();

    setContext({ state, path: null as any, operationIndex: 0 });
    expect(getSetFunctionForAttribute('class').name).toBe('setClass');
    expect(getSetFunctionForAttribute('style').name).toBe('setStyle');
    expect(getSetFunctionForAttribute('title').name).toBe('setAttr');
    resetContext();
  });

  it('detects dynamic expressions across multiple node types', () => {
    const dynamic = parseExpression('a ? b : c');
    const staticLiteral = parseExpression('"text"');
    expect(isDynamicExpression(dynamic)).toBe(true);
    expect(isDynamicExpression(staticLiteral)).toBe(false);
  });

  it('serializes attributes into HTML strings', () => {
    const attrs = {
      class: 'base',
      style: 'color: red;',
      disabled: true,
      title: 'demo',
    } as Record<string, unknown>;
    const result = serializeAttributes(attrs);
    expect(result).toContain('class="base"');
    expect(result).toContain('style="color: red;"');
    expect(result).toContain(' disabled');
    expect(result).toContain(' title="demo"');
  });

  it('optimizes and annotates tree children', () => {
    const ast = parse('const view = <div>foo{"bar"}baz</div>;', {
      sourceType: 'module',
      plugins: ['jsx'],
    });

    let jsxPath: any;
    traverse(ast, {
      JSXElement(path) {
        jsxPath = path;
        path.stop();
      },
    });

    const optimized = optimizeChildNodes(jsxPath.get('children') as any);
    expect(optimized.length).toBe(2); // merged adjacent text nodes

    const parentNode = {
      children: [
        { type: NODE_TYPE.EXPRESSION, index: 2, parentIndex: 1, isLastChild: false },
        { type: NODE_TYPE.EXPRESSION, index: 3, parentIndex: 1, isLastChild: false },
      ],
      index: 1,
    } as any;

    processTextElementAddComment(parentNode);
    expect(parentNode.children.some((child: any) => child.type === NODE_TYPE.COMMENT)).toBe(true);

    const beforeIdx = findBeforeIndex(parentNode.children[0], parentNode as any);
    expect(beforeIdx).not.toBeNull();

    const map = collectNodeIndexMap(
      [
        {
          node: t.identifier('value'),
          index: 2,
          parentIndex: 1,
          before: 3,
        },
      ],
      [{ props: {}, parentIndex: 1 }],
    );
    expect(map).toEqual([1, 3]);
    expect(findIndexPosition(3, map)).toBe(1);
  });

  it('converts arbitrary values to AST nodes', () => {
    const ast = parse('const element = <span />;', { sourceType: 'module', plugins: ['jsx'] });
    let jsxPath: any;
    traverse(ast, {
      JSXElement(path) {
        jsxPath = path;
        path.stop();
      },
    });

    const state = {
      opts: { mode: 'client' },
      imports: createImportIdentifiers(jsxPath.scope.path as any),
      declarations: [],
      events: new Set<string>(),
    };
    transformProgram.enter(jsxPath.scope.path as any, state);
    setContext({ state, path: jsxPath, operationIndex: 0 });

    const literalNode = convertValueToASTNode('text', () => {
      throw new Error('unexpected JSX conversion');
    });
    expect(literalNode.type).toBe('StringLiteral');

    const arrayNode = convertValueToASTNode(['a', 'b'], () => {
      throw new Error('unexpected JSX conversion');
    });
    expect(arrayNode.type).toBe('ArrayExpression');

    resetContext();
  });
});
