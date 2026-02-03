import { describe, expect, it } from 'vitest';
import { parse, parseExpression } from '@babel/parser';
import * as t from '@babel/types';
import traverse from '@babel/traverse';
import {
  collectNodeIndexMap,
  convertValueToASTNode,
  createPropsObjectExpression,
  deepCheckObjectDynamic,
  extractStringChildren,
  findBeforeIndex,
  findIndexPosition,
  getSetFunctionForAttribute,
  hasPureStringChildren,
  isComponentName,
  isDynamicExpression,
  isMapCall,
  jsxElementNameToString,
  normalizeProps,
  optimizeChildNodes,
  processTextElementAddComment,
  serializeAttributes,
} from '../src/jsx/shared';
import { resetContext, setContext } from '../src/jsx/context';
import { transformProgram } from '../src/program';
import { createImportIdentifiers } from '../src/import';
import { NODE_TYPE } from '../src/jsx/constants';

describe('jsx shared helpers', () => {
  it('detects component naming conventions', () => {
    expect(isComponentName('MyComponent')).toBe(true);
    expect(isComponentName('ns:Component')).toBe(true);
    expect(isComponentName('div')).toBe(false);

    // Edge cases
    expect(isComponentName('')).toBe(false); // empty string
    expect(isComponentName('_Component')).toBe(true); // starts with underscore
    expect(isComponentName('$Component')).toBe(true); // starts with dollar sign
    expect(isComponentName('lib.component')).toBe(false); // dot notation but lowercase
    expect(isComponentName('lib.Component')).toBe(true); // dot notation with uppercase
    expect(isComponentName('ns:component')).toBe(false); // colon notation but lowercase
    expect(isComponentName('a.b.Component')).toBe(true); // nested dot notation
  });

  it('converts JSX element names to string', () => {
    const expr = parseExpression('Namespace.Component');
    expect(jsxElementNameToString(expr as unknown as t.JSXIdentifier)).toBe('Namespace.Component');

    // Test JSXIdentifier
    const code = '<MyComponent />';
    const ast = parse(code, { sourceType: 'module', plugins: ['jsx'] });
    let jsxName: any;
    traverse(ast, {
      JSXElement(path) {
        jsxName = path.node.openingElement.name;
        path.stop();
      },
    });
    expect(jsxElementNameToString(jsxName)).toBe('MyComponent');

    // Test JSXNamespacedName
    const nsCode = '<ns:Component />';
    const nsAst = parse(nsCode, { sourceType: 'module', plugins: ['jsx'] });
    let nsName: any;
    traverse(nsAst, {
      JSXElement(path) {
        nsName = path.node.openingElement.name;
        path.stop();
      },
    });
    expect(jsxElementNameToString(nsName)).toBe('ns:Component');
  });

  it('identifies dynamic objects recursively', () => {
    const staticObj = parseExpression('({ width: "10px" })') as t.ObjectExpression;
    const dynamicObj = parseExpression('({ style: { color: value } })') as t.ObjectExpression;
    expect(deepCheckObjectDynamic(staticObj)).toBe(false);
    expect(deepCheckObjectDynamic(dynamicObj)).toBe(true);
  });

  it('normalizes props and class/style strings', () => {
    const normalized = normalizeProps({ class: 'a', className: 'b', style: 'color:red;' });
    expect(normalized.class).toBe('a');
    // with component not transform className to class ,just in dom element transform
    expect(normalized.className).toBe('b');
    expect(normalized.style).toBe('color:red;');

    // Test with dynamic class expression (last one wins)
    const dynamicClass = t.identifier('dynamicClass');
    const normalizedDynamic = normalizeProps({ className: dynamicClass });
    expect(normalizedDynamic.className).toBe(dynamicClass); // Dynamic expression

    // Test with dynamic style expression
    const dynamicStyle = t.identifier('dynamicStyle');
    const normalizedDynamicStyle = normalizeProps({ style: dynamicStyle });
    expect(normalizedDynamicStyle.style).toBe(dynamicStyle);

    // Test with spread attributes
    const spread1 = t.identifier('spread1');
    const spread2 = t.identifier('spread2');
    const normalizedSpread = normalizeProps({ '...': spread1 });
    normalizedSpread['...'] = [spread1, spread2]; // Manually add second spread
    expect(Array.isArray(normalizedSpread['...'])).toBe(true);

    // Test with style without trailing semicolon
    const normalizedStyleNoSemicolon = normalizeProps({ style: 'color:blue' });
    expect(normalizedStyleNoSemicolon.style).toBe('color:blue;');
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
      imports: createImportIdentifiers(jsxPath.scope.path),
    };

    transformProgram.enter(jsxPath.scope.path, state);
    // @ts-ignore
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
      const state: any = {
        opts: { mode: 'client' },
        imports: createImportIdentifiers(programPath),
        declarations: [],
        events: new Set<string>(),
      };
      return { state };
    })();

    // @ts-ignore
    setContext({ state, path: null, operationIndex: 0 });
    expect(getSetFunctionForAttribute('class').name).toBe('patchClass');
    expect(getSetFunctionForAttribute('style').name).toBe('patchStyle');
    expect(getSetFunctionForAttribute('title').name).toBe('patchAttr');
    resetContext();
  });

  it('detects dynamic expressions across multiple node types', () => {
    const dynamic = parseExpression('a ? b : c');
    const staticLiteral = parseExpression('"text"');
    expect(isDynamicExpression(dynamic)).toBe(true);
    expect(isDynamicExpression(staticLiteral)).toBe(false);

    // Test more expression types
    expect(isDynamicExpression(parseExpression('a || b'))).toBe(true); // LogicalExpression
    expect(isDynamicExpression(parseExpression('`template ${x}`'))).toBe(true); // TemplateLiteral
    expect(isDynamicExpression(parseExpression('a + b'))).toBe(true); // BinaryExpression
    expect(isDynamicExpression(parseExpression('!a'))).toBe(true); // UnaryExpression
    expect(isDynamicExpression(parseExpression('a++'))).toBe(true); // UpdateExpression
    expect(isDynamicExpression(parseExpression('a = b'))).toBe(true); // AssignmentExpression
    expect(isDynamicExpression(parseExpression('(a, b)'))).toBe(true); // SequenceExpression
    expect(isDynamicExpression(parseExpression('() => a'))).toBe(true); // ArrowFunctionExpression
    expect(isDynamicExpression(parseExpression('function() {}'))).toBe(true); // FunctionExpression
    expect(isDynamicExpression(parseExpression('obj.prop'))).toBe(true); // MemberExpression
    expect(isDynamicExpression(parseExpression('obj?.prop'))).toBe(true); // OptionalMemberExpression
    expect(isDynamicExpression(parseExpression('fn()'))).toBe(true); // CallExpression
    expect(isDynamicExpression(parseExpression('fn?.()'))).toBe(true); // OptionalCallExpression

    // Test array with dynamic elements
    expect(isDynamicExpression(parseExpression('[a, b]'))).toBe(true);
    expect(isDynamicExpression(parseExpression('[1, 2]'))).toBe(false);

    // Test literals
    expect(isDynamicExpression(parseExpression('123'))).toBe(false); // NumericLiteral
    expect(isDynamicExpression(parseExpression('true'))).toBe(false); // BooleanLiteral
    expect(isDynamicExpression(parseExpression('null'))).toBe(false); // NullLiteral
    expect(isDynamicExpression(parseExpression('/regex/'))).toBe(false); // RegExpLiteral

    // Test null/undefined
    expect(isDynamicExpression(null)).toBe(false);
    expect(isDynamicExpression(undefined)).toBe(false);
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

    // Test with false boolean attribute (should be ignored)
    const attrsWithFalse = { hidden: false, visible: true };
    const resultWithFalse = serializeAttributes(attrsWithFalse);
    expect(resultWithFalse).not.toContain('hidden');
    expect(resultWithFalse).toContain(' visible');

    // Test with number attribute
    const attrsWithNumber = { 'tabindex': 0, 'data-count': 42 };
    const resultWithNumber = serializeAttributes(attrsWithNumber);
    expect(resultWithNumber).toContain('tabindex="0"');
    expect(resultWithNumber).toContain('data-count="42"');

    // Test with style without trailing semicolon
    const attrsWithStyleNoSemicolon = { style: 'color: blue' };
    const resultWithStyleNoSemicolon = serializeAttributes(attrsWithStyleNoSemicolon);
    expect(resultWithStyleNoSemicolon).toContain('style="color: blue;"');

    // Test with conditional expression (should be kept in attributes)
    const conditionalExpr = t.conditionalExpression(
      t.identifier('condition'),
      t.stringLiteral('a'),
      t.stringLiteral('b'),
    );
    const attrsWithConditional = { class: conditionalExpr };
    expect(attrsWithConditional.class).toBe(conditionalExpr); // Should remain unchanged

    // Test with object expression for class
    const objectExpr = t.objectExpression([
      t.objectProperty(t.identifier('active'), t.stringLiteral('true')),
    ]);
    const attrsWithObject = { class: objectExpr };
    serializeAttributes(attrsWithObject);

    // Test with null/undefined attributes
    const attrsEmpty = undefined;
    expect(serializeAttributes(attrsEmpty)).toBe('');

    const attrsNotObject = 'not an object';
    // @ts-ignore
    expect(serializeAttributes(attrsNotObject)).toBe('');
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

    const optimized = optimizeChildNodes(jsxPath.get('children'));
    expect(optimized.length).toBe(2); // merged adjacent text nodes

    const parentNode = {
      children: [
        { type: NODE_TYPE.EXPRESSION, index: 2, parentIndex: 1, isLastChild: false },
        { type: NODE_TYPE.EXPRESSION, index: 3, parentIndex: 1, isLastChild: false },
      ],
      index: 1,
    };
    // @ts-ignore
    processTextElementAddComment(parentNode);
    expect(parentNode.children.some((child: any) => child.type === NODE_TYPE.COMMENT)).toBe(true);
    // @ts-ignore
    const beforeIdx = findBeforeIndex(parentNode.children[0], parentNode);
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

    // Test findIndexPosition with Map
    const indexMap = new Map([
      [1, 0],
      [3, 1],
      [5, 2],
    ]);
    expect(findIndexPosition(3, indexMap)).toBe(1);
    expect(findIndexPosition(5, indexMap)).toBe(2);
    expect(findIndexPosition(99, indexMap)).toBe(-1); // not found

    // Test collectNodeIndexMap with extraIndices
    const mapWithExtra = collectNodeIndexMap(
      [{ node: t.identifier('x'), index: 2, parentIndex: 1, before: null }],
      [],
      [10, 20],
    );
    expect(mapWithExtra).toContain(10);
    expect(mapWithExtra).toContain(20);
    expect(mapWithExtra).toContain(1); // parentIndex

    // Test with null/undefined indices (should be filtered out)
    const mapWithNulls = collectNodeIndexMap(
      [{ node: t.identifier('x'), index: 2, parentIndex: null, before: null }],
      [{ props: {}, parentIndex: null }],
    );
    expect(mapWithNulls).toEqual([]);
  });

  it('tests hasPureStringChildren and extractStringChildren', () => {
    // Test node with no children
    const emptyNode = { children: [], type: NODE_TYPE.NORMAL, index: 0 };
    expect(hasPureStringChildren(emptyNode)).toBe(false);
    expect(extractStringChildren(emptyNode)).toBe('');

    // Test node with string children
    const stringNode = {
      children: ['hello', ' ', 'world'],
      type: NODE_TYPE.NORMAL,
      index: 0,
    };
    expect(hasPureStringChildren(stringNode)).toBe(true);
    expect(extractStringChildren(stringNode)).toBe('hello world');

    // Test node with TEXT type children - need _isTreeNode property
    const textChild1 = { type: NODE_TYPE.TEXT, children: ['foo'], index: 1, _isTreeNode: true };
    const textChild2 = { type: NODE_TYPE.TEXT, children: ['bar'], index: 2, _isTreeNode: true };
    const textNode = {
      children: [textChild1, textChild2],
      type: NODE_TYPE.NORMAL,
      index: 0,
      _isTreeNode: true,
    };
    // @ts-ignore
    expect(hasPureStringChildren(textNode)).toBe(true);
    // @ts-ignore
    expect(extractStringChildren(textNode)).toBe('foobar');

    // Test node with mixed children (not pure strings)
    const mixedNode = {
      children: ['text', { type: NODE_TYPE.EXPRESSION, children: [], _isTreeNode: true }],
      type: NODE_TYPE.NORMAL,
      index: 0,
    };
    // @ts-ignore
    expect(hasPureStringChildren(mixedNode)).toBe(false);

    // Test node with undefined children
    const noChildrenNode = { type: NODE_TYPE.NORMAL, index: 0 };
    // @ts-ignore
    expect(hasPureStringChildren(noChildrenNode)).toBe(false);
    // @ts-ignore
    expect(extractStringChildren(noChildrenNode)).toBe('');
  });

  it('tests isMapCall function', () => {
    const mapCall = parseExpression('arr.map(x => x * 2)');
    expect(isMapCall(mapCall)).toBe(true);

    const notMapCall = parseExpression('arr.filter(x => x > 0)');
    expect(isMapCall(notMapCall)).toBe(false);

    const regularCall = parseExpression('fn()');
    expect(isMapCall(regularCall)).toBe(false);

    const identifier = parseExpression('x');
    expect(isMapCall(identifier)).toBe(false);
  });

  it('tests convertValueToASTNode with various types', () => {
    const mockTransformJSX = () => t.identifier('transformed');

    // Test with already an AST expression
    const expr = t.identifier('test');
    expect(convertValueToASTNode(expr, mockTransformJSX)).toBe(expr);

    // Test with array
    const arrayResult = convertValueToASTNode(['a', 'b'], mockTransformJSX);
    expect(t.isArrayExpression(arrayResult)).toBe(true);

    // Test with string
    const stringResult = convertValueToASTNode('hello', mockTransformJSX);
    expect(t.isStringLiteral(stringResult)).toBe(true);
    expect((stringResult as t.StringLiteral).value).toBe('hello');

    // Test with number
    const numberResult = convertValueToASTNode(42, mockTransformJSX);
    expect(t.isNumericLiteral(numberResult)).toBe(true);
    expect((numberResult as t.NumericLiteral).value).toBe(42);

    // Test with boolean
    const boolResult = convertValueToASTNode(true, mockTransformJSX);
    expect(t.isBooleanLiteral(boolResult)).toBe(true);

    // Test with undefined
    const undefResult = convertValueToASTNode(undefined, mockTransformJSX);
    expect(t.isIdentifier(undefResult)).toBe(true);
    expect((undefResult as t.Identifier).name).toBe('undefined');

    // Test with null
    const nullResult = convertValueToASTNode(null, mockTransformJSX);
    expect(t.isNullLiteral(nullResult)).toBe(true);
  });

  it('tests findBeforeIndex edge cases', () => {
    // Test with last child
    const lastChildNode = { type: NODE_TYPE.EXPRESSION, index: 3, isLastChild: true };
    const parentWithLastChild = { children: [lastChildNode], index: 1 };
    // @ts-ignore
    expect(findBeforeIndex(lastChildNode, parentWithLastChild)).toBeNull();

    // Test with no children
    const parentNoChildren = { children: [], index: 1 };
    const childNode = { type: NODE_TYPE.EXPRESSION, index: 2, isLastChild: false };
    // @ts-ignore
    expect(findBeforeIndex(childNode, parentNoChildren)).toBeNull();

    // Test with static sibling
    const dynamicNode = { type: NODE_TYPE.EXPRESSION, index: 2, isLastChild: false };
    const staticNode = { type: NODE_TYPE.NORMAL, index: 3, isLastChild: false };
    const parentWithStatic = { children: [dynamicNode, staticNode], index: 1 };
    // @ts-ignore
    expect(findBeforeIndex(dynamicNode, parentWithStatic)).toBe(3);

    // Test with all dynamic siblings
    const dynamic1 = { type: NODE_TYPE.EXPRESSION, index: 2, isLastChild: false };
    const dynamic2 = { type: NODE_TYPE.FRAGMENT, index: 3, isLastChild: false };
    const dynamic3 = { type: NODE_TYPE.COMPONENT, index: 4, isLastChild: false };
    const parentAllDynamic = { children: [dynamic1, dynamic2, dynamic3], index: 1 };
    // @ts-ignore
    expect(findBeforeIndex(dynamic1, parentAllDynamic)).toBeNull();
  });

  it('tests processTextElementAddComment edge cases', () => {
    // Test with no children
    const nodeNoChildren = { children: [], index: 1 };
    // @ts-ignore
    processTextElementAddComment(nodeNoChildren);
    expect(nodeNoChildren.children.length).toBe(0);

    // Test with single child
    const singleChild = { type: NODE_TYPE.EXPRESSION, index: 2 };
    const nodeSingleChild = { children: [singleChild], index: 1 };
    // @ts-ignore
    processTextElementAddComment(nodeSingleChild);
    // Single child should not trigger comment insertion
    expect(nodeSingleChild.children.length).toBe(1);

    // Test with expression followed by normal element (no comment needed)
    const expr = { type: NODE_TYPE.EXPRESSION, index: 2, _isTreeNode: true };
    const normal = { type: NODE_TYPE.NORMAL, index: 3, _isTreeNode: true };
    const nodeExprNormal = { children: [expr, normal], index: 1 };
    // @ts-ignore
    processTextElementAddComment(nodeExprNormal);
    // Should not insert comment between expression and normal element
    expect(nodeExprNormal.children.length).toBe(2);
  });
});
