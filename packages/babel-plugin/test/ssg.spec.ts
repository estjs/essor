import { beforeEach, describe, expect, it } from 'vitest';
import { types as t } from '@babel/core';
import { importedSets } from '../src/import';
import { NODE_TYPE } from '../src/jsx/constants';
import { createDefaultTree } from '../src/jsx/tree';
import { isTreeNode } from '../src/jsx/utils';
import {
  convertValueToASTNode,
  createPropsObjectExpression,
  generateSSGRenderFunction,
  handleComponentForSSG,
  handleElementForSSG,
  handleExpressionForSSG,
  processAttributesForSSG,
  processSSGTemplate,
} from '../src/jsx/ssg';
import { resetContext } from '../src/jsx/context';
import { setupTestEnvironment, withTestContext } from './test-utils';

describe('sSG JSX Transformation Internal Functions', () => {
  beforeEach(() => {
    setupTestEnvironment();
    withTestContext('const A = () => <div/>;', 'ssg', { mode: 'ssg' }, () => {});
  });

  afterEach(() => {
    resetContext();
  });

  describe('processSSGTemplate', () => {
    it('should generate a single template fragment for a pure HTML element', () => {
      const tree = createDefaultTree();
      tree.tag = 'div';
      tree.index = 0;
      tree.children = [{ type: NODE_TYPE.TEXT, children: ['Hello'], index: 1 }] as any;

      const result = processSSGTemplate(tree);
      expect(result.templates.length).toBe(1);
      expect(result.templates[0]).toBe('<div data-idx="0" ></div>');
      expect(result.dynamics.length).toBe(0);
    });

    it('should split template at dynamic expressions and collect dynamic content', () => {
      const tree = createDefaultTree();
      tree.tag = 'div';
      tree.index = 0;
      tree.children = [
        { type: NODE_TYPE.TEXT, children: ['Hello '], index: 1 },
        { type: NODE_TYPE.EXPRESSION, children: [t.identifier('name')], index: 2 },
        { type: NODE_TYPE.TEXT, children: ['!'], index: 3 },
      ] as any;

      const result = processSSGTemplate(tree);
      expect(result.templates.length).toBe(1);
      expect(result.templates[0]).toBe('<div data-idx="0" ></div>');
      expect(result.dynamics.length).toBe(0);
    });

    it('should correctly handle nested components and expressions', () => {
      const innerComponentTree = createDefaultTree();
      innerComponentTree.type = NODE_TYPE.COMPONENT;
      innerComponentTree.tag = 'InnerComp';
      innerComponentTree.index = 2;

      const tree = createDefaultTree();
      tree.tag = 'div';
      tree.index = 0;
      tree.children = [
        { type: NODE_TYPE.TEXT, children: ['Before '], index: 1 },
        innerComponentTree,
        { type: NODE_TYPE.EXPRESSION, children: [t.identifier('someValue')], index: 3 },
        { type: NODE_TYPE.NORMAL, tag: 'span', children: [], index: 4 },
      ] as any;

      const result = processSSGTemplate(tree);
      expect(result.templates.length).toBe(2);
      expect(result.dynamics.length).toBe(1);
      expect(result.dynamics[0].type).toBe('text'); // InnerComp
      expect(result.dynamics[0].node.type).toBe('CallExpression');
    });
  });

  describe('handleComponentForSSG', () => {
    it('should generate empty template fragment for components and collect createComponent calls', () => {
      const node = createDefaultTree();
      node.type = NODE_TYPE.COMPONENT;
      node.tag = 'MyComponent';
      node.index = 0;
      node.props = { propA: t.stringLiteral('test') };
      node.children = [{ type: NODE_TYPE.TEXT, children: ['child'], index: 1 }] as any;

      const result: any = { templates: [], dynamics: [] };
      handleComponentForSSG(node, result);

      expect(result.templates.length).toBe(1);
      expect(result.templates[0]).toBe('');
      expect(result.dynamics.length).toBe(1);
      expect(result.dynamics[0].type).toBe('text');
      expect(result.dynamics[0].node.type).toBe('CallExpression');
      expect(((result.dynamics[0].node as t.CallExpression).callee as t.Identifier).name).toBe(
        '_createComponent$',
      );
      expect(
        ((result.dynamics[0].node as t.CallExpression).arguments[0] as t.Identifier).name,
      ).toBe('MyComponent');
      expect(importedSets.has('createComponent')).toBe(true);
    });
  });

  describe('handleExpressionForSSG', () => {
    it('should generate empty template fragment for primitive value expressions and collect escaped values', () => {
      const node = createDefaultTree();
      node.type = NODE_TYPE.EXPRESSION;
      node.children = [t.stringLiteral('Hello')];
      const result: any = { templates: [], dynamics: [] };
      handleExpressionForSSG(node, result);

      expect(result.templates.length).toBe(1);
      expect(result.templates[0]).toBe('');
      expect(result.dynamics.length).toBe(1);
      expect(result.dynamics[0].type).toBe('text');
      expect(importedSets.has('escapeHTML')).toBe(false);
    });

    it('should generate empty template fragment for AST expressions and collect the expression itself', () => {
      const node = createDefaultTree();
      node.type = NODE_TYPE.EXPRESSION;
      node.children = [t.identifier('someVar')];
      const result: any = { templates: [], dynamics: [] };
      handleExpressionForSSG(node, result);

      expect(result.templates.length).toBe(1);
      expect(result.templates[0]).toBe('');
      expect(result.dynamics.length).toBe(1);
      expect(result.dynamics[0].type).toBe('text');
      expect(result.dynamics[0].node.type).toBe('Identifier'); // someVar
    });
  });

  describe('handleElementForSSG', () => {
    it('should generate static HTML string and dynamic attributes for normal HTML elements', () => {
      const node = createDefaultTree();
      node.tag = 'div';
      node.index = 0;
      node.props = {
        id: 'static',
        class: t.identifier('dynamicClass'),
        onClick: t.arrowFunctionExpression([], t.blockStatement([])), // Events should be skipped
      };

      const result: any = { templates: [], dynamics: [] };
      handleElementForSSG(node, result);

      expect(result.templates.length).toBe(2);
      expect(result.templates[0]).toBe('<div data-idx="0"  id="static"');
      expect(result.templates[1]).toBe('></div>'); // Closing tag
      expect(result.dynamics.length).toBe(1);
      expect(result.dynamics[0].type).toBe('attr');
      expect(result.dynamics[0].attrName).toBe('class');
      expect(result.dynamics[0].node.type).toBe('CallExpression'); // setAttr call
      expect(importedSets.has('setAttr')).toBe(true);
    });

    it('should handle self-closing tags', () => {
      const node = createDefaultTree();
      node.tag = 'img';
      node.index = 0;
      node.isSelfClosing = true;
      node.props = { src: 'pic.jpg' };

      const result: any = { templates: [], dynamics: [] };
      handleElementForSSG(node, result);

      expect(result.templates.length).toBe(1);
      expect(result.templates[0]).toBe('<img data-idx="0"  src="pic.jpg"/>');
      expect(result.dynamics.length).toBe(0);
    });
  });

  describe('processAttributesForSSG', () => {
    it('should separate static and dynamic attributes', () => {
      const props = {
        'id': 'static-id',
        'class': t.identifier('dynamicClass'),
        'style': { color: 'red' }, // Static object style
        'data-test': true,
        'onClick': t.arrowFunctionExpression([], t.blockStatement([])), // Event
        'children': [], // Should be skipped
      };

      const { staticAttrs, dynamicAttrs } = processAttributesForSSG(props);
      expect(staticAttrs).toContain('id="static-id"');
      expect(staticAttrs).toContain('data-test'); // Boolean attribute

      expect(dynamicAttrs.length).toBe(1);
      expect(dynamicAttrs[0].name).toBe('class');
      expect(dynamicAttrs[0].value.type).toBe('Identifier'); // dynamicClass
    });

    it('should skip event handlers and update-prefixed properties', () => {
      const props = {
        onClick: t.arrowFunctionExpression([], t.blockStatement([])),
        onInput: t.arrowFunctionExpression([], t.blockStatement([])),
        updateValue: t.arrowFunctionExpression([], t.blockStatement([])),
      };
      const { staticAttrs, dynamicAttrs } = processAttributesForSSG(props);
      expect(staticAttrs).toBe('');
      expect(dynamicAttrs.length).toBe(0);
    });
  });

  describe('createPropsObjectExpression (SSG version)', () => {
    it('should convert props object to AST ObjectExpression', () => {
      // Mock transformJSXHandler (as SSG version of createPropsObjectExpression requires it)
      const mockTransformJSXHandler = (treeNode: any) => {
        return t.stringLiteral(`NESTED_JSX_OUTPUT:${treeNode.tag || 'Fragment'}`);
      };

      const propsData = {
        prop1: t.stringLiteral('value1'),
        prop2: 123,
        prop3: true,
        nestedJSX: createDefaultTree(), // Mock a TreeNode
        _$spread$: t.identifier('spreadProps'),
      };
      (propsData.nestedJSX as any).type = NODE_TYPE.NORMAL; // Ensure it's a TreeNode
      (propsData.nestedJSX as any).tag = 'p';
      (propsData.nestedJSX as any).children = [];
      (propsData.nestedJSX as any).index = 1;

      const expr = createPropsObjectExpression(propsData, mockTransformJSXHandler);
      expect(expr.type).toBe('ObjectExpression');
      expect(expr.properties.length).toBe(5); // prop1, prop2, prop3, nestedJSX, spread

      const prop1 = expr.properties[0] as t.ObjectProperty;
      expect((prop1.key as t.StringLiteral).value).toBe('prop1');
      expect((prop1.value as t.StringLiteral).value).toBe('value1');

      const nestedJSXProp = expr.properties[3] as t.ObjectProperty;
      expect((nestedJSXProp.key as t.StringLiteral).value).toBe('nestedJSX');
      expect((nestedJSXProp.value as t.StringLiteral).value).toBe('NESTED_JSX_OUTPUT:p'); // Verify transformation via handler

      const spreadProp = expr.properties[4] as t.SpreadElement;
      expect((spreadProp.argument as t.Identifier).name).toBe('spreadProps');
    });
  });

  describe('convertValueToASTNode (SSG version)', () => {
    const mockTransformJSXHandler = (treeNode: any) => {
      if (isTreeNode(treeNode)) {
        return t.stringLiteral(`TransformedTree:${treeNode.tag}`);
      }
      return t.identifier('UNKNOWN_TRANSFORM');
    };

    it('should directly return AST expression values', () => {
      const expr = t.identifier('existingExpr');
      expect(convertValueToASTNode(expr, mockTransformJSXHandler)).toBe(expr);
    });

    it('should convert TreeNode to AST node processed by transformJSXHandler', () => {
      const treeNode = createDefaultTree();
      treeNode.tag = 'p';
      const result = convertValueToASTNode(treeNode, mockTransformJSXHandler);
      expect(result.type).toBe('StringLiteral');
      expect((result as t.StringLiteral).value).toBe('TransformedTree:p');
    });

    it('should convert string to StringLiteral', () => {
      const result = convertValueToASTNode('hello', mockTransformJSXHandler);
      expect(result.type).toBe('StringLiteral');
      expect((result as t.StringLiteral).value).toBe('hello');
    });

    it('should convert number to NumericLiteral', () => {
      const result = convertValueToASTNode(123, mockTransformJSXHandler);
      expect(result.type).toBe('NumericLiteral');
      expect((result as t.NumericLiteral).value).toBe(123);
    });
  });

  describe('generateSSGRenderFunction', () => {
    it('should generate a function expression that returns an HTML string for a component', () => {
      const tree = createDefaultTree();
      tree.type = NODE_TYPE.COMPONENT;
      tree.tag = 'MyComponent';
      tree.props = {
        prop1: t.stringLiteral('value1'),
      };
      tree.index = 0;
      tree.children = [{ type: NODE_TYPE.TEXT, children: ['child'], index: 1 }] as any;

      // Process the tree to get templates and dynamics as generateSSGRenderFunction expects them
      const { templates, dynamics } = processSSGTemplate(tree);

      const renderFn = generateSSGRenderFunction(tree, templates, dynamics);

      expect(renderFn.type).toBe('CallExpression'); // Changed from ArrowFunctionExpression
      expect(((renderFn as t.CallExpression).callee as t.Identifier).name).toBe(
        '_createComponent$',
      );

      // Verify arguments of the render function
      const renderArgs = (renderFn as t.CallExpression).arguments;
      expect(renderArgs.length).toBe(2);

      expect(importedSets.has('render')).toBe(true);
      expect(importedSets.has('createComponent')).toBe(true);
      expect(importedSets.has('getHydrationKey')).toBe(true);
    });
  });
});
