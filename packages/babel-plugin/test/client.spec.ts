import { beforeEach, describe, expect, it } from 'vitest';
import { types as t } from '@babel/core';
import { clearImport, importedSets } from '../src/import';
import { resetContext, setContext } from '../src/jsx/context';
import { NODE_TYPE } from '../src/jsx/constants';

// Import internal functions to be tested
import {
  createAttributeStatement,
  createInsertArguments,
  processDynamic,
  processIIFEExpression,
  processTemplate,
} from '../src/jsx/client';
import { createDefaultTree } from '../src/jsx/tree'; // Used for creating TreeNode
import { getProgramPathAndState } from './test-utils';

beforeEach(() => {
  clearImport();
  resetContext();
  const { programPath, programState } = getProgramPathAndState(
    'const A = () => <div/>;',
    {},
    'client',
  );
  setContext({ path: programPath!, state: programState! });
});

describe('client Internal Functions', () => {
  describe('processTemplate', () => {
    it('should generate correct template string from a simple HTML tree', () => {
      const tree = createDefaultTree();
      tree.tag = 'div';
      tree.index = 0; // Root node is usually 0
      tree.root = true;
      tree.children = [
        { type: NODE_TYPE.TEXT, children: ['Hello'], index: 1 },
        {
          type: NODE_TYPE.NORMAL,
          tag: 'span',
          children: [{ type: NODE_TYPE.TEXT, children: ['World'], index: 2 }],
          index: 3,
        },
      ] as any;
      const template = processTemplate(tree);
      expect(template).toBe('<div data-idx="0-1">Hello<span data-idx="0-3">World</span></div>');
    });

    it('should generate correct template string from a self-closing tag', () => {
      const tree = createDefaultTree();
      tree.tag = 'img';
      tree.isSelfClosing = true;
      tree.props = { src: 'pic.jpg' };
      tree.index = 0;
      tree.root = true;
      const template = processTemplate(tree);
      expect(template).toBe('<img src="pic.jpg" data-idx="0-0"/>'); // Root node index is 0
    });

    it('should handle comment nodes and generate correct template string', () => {
      const tree = createDefaultTree();
      tree.tag = 'div';
      tree.index = 0;
      tree.root = true;
      tree.children = [{ type: NODE_TYPE.COMMENT, children: [], index: 1 }] as any;
      const template = processTemplate(tree);
      expect(template).toBe('<div data-idx="0-0"><!></div>');
    });
  });

  describe('processDynamic', () => {
    it('should collect dynamic text expressions', () => {
      const tree = createDefaultTree();
      tree.tag = 'div';
      tree.index = 0;
      tree.root = true;
      tree.children = [
        { type: NODE_TYPE.TEXT, children: ['Hello '], index: 1 },
        { type: NODE_TYPE.EXPRESSION, children: [t.identifier('name')], index: 2 },
        { type: NODE_TYPE.TEXT, children: ['!'], index: 3 },
      ] as any;
      const dynamicCollection = processDynamic(tree);
      expect(dynamicCollection.children.length).toBe(1);
      expect(dynamicCollection.children[0].node.type).toBe('Identifier'); // name
      expect(dynamicCollection.children[0].index).toBe(2);
      expect(dynamicCollection.children[0].parentIndex).toBe(0); // div's index
    });

    it('should collect dynamic attributes', () => {
      const tree = createDefaultTree();
      tree.tag = 'div';
      tree.index = 0;
      tree.root = true;
      tree.props = { class: t.identifier('className') };
      const dynamicCollection = processDynamic(tree);
      expect(dynamicCollection.props.length).toBe(1);
      expect(dynamicCollection.props[0].props.class.type).toBe('Identifier'); // className
      expect(dynamicCollection.props[0].parentIndex).toBe(0);
    });

    it('should collect dynamic components', () => {
      const tree = createDefaultTree();
      tree.tag = 'div';
      tree.index = 0;
      tree.root = true;
      tree.children = [
        { type: NODE_TYPE.COMPONENT, tag: 'MyComponent', index: 1, children: [], props: {} },
      ] as any;
      const dynamicCollection = processDynamic(tree);
      expect(dynamicCollection.children.length).toBe(1);
      expect(dynamicCollection.children[0].node.type).toBe('CallExpression'); // createComponent call
      expect(importedSets.has('createComponent')).toBe(true);
    });
  });

  describe('processIIFEExpression', () => {
    it('should extract return statement argument from arrow function IIFE', () => {
      const expr = t.callExpression(
        t.arrowFunctionExpression(
          [],
          t.blockStatement([t.returnStatement(t.stringLiteral('returned value'))]),
        ),
        [],
      );
      const processed = processIIFEExpression(expr);
      expect(processed.type).toBe('StringLiteral');
      expect((processed as t.StringLiteral).value).toBe('returned value');
    });

    it('should extract expression body from shorthand arrow function IIFE', () => {
      const expr = t.callExpression(
        t.arrowFunctionExpression([], t.stringLiteral('shorthand value')),
        [],
      );
      const processed = processIIFEExpression(expr);
      expect(processed.type).toBe('StringLiteral');
      expect((processed as t.StringLiteral).value).toBe('shorthand value');
    });

    it('non-IIFE expressions should remain unchanged', () => {
      const expr = t.identifier('myVar');
      const processed = processIIFEExpression(expr);
      expect(processed).toBe(expr);
    });
  });

  describe('createInsertArguments', () => {
    it('should generate correct insert arguments for dynamic content', () => {
      const dynamicContent: any = {
        index: 10,
        node: t.identifier('dynamicValue'),
        before: null, // No preceding node
        parentIndex: 5,
      };
      const nodesIdentifier = t.identifier('_nodes');
      const indexMap = [5, 10, 20]; // Parent node index 5 at map position 0

      const args = createInsertArguments(dynamicContent, nodesIdentifier, indexMap);
      expect(args.length).toBe(2);
      expect(((args[0] as t.MemberExpression).property as t.NumericLiteral).value).toBe(0); // nodes[0]
      expect((args[1] as t.ArrowFunctionExpression).body.type).toBe('Identifier'); // () => dynamicValue
    });

    it('should generate correct insert arguments for dynamic content with a preceding node', () => {
      const dynamicContent: any = {
        index: 10,
        node: t.identifier('dynamicValue'),
        before: 20, // Has a preceding node
        parentIndex: 5,
      };
      const nodesIdentifier = t.identifier('_nodes');
      const indexMap = [5, 10, 20]; // Preceding node index 20 at map position 2

      const args = createInsertArguments(dynamicContent, nodesIdentifier, indexMap);
      expect(args.length).toBe(3);
      expect(((args[2] as t.MemberExpression).property as t.NumericLiteral).value).toBe(2); // nodes[2]
    });
  });

  describe('createAttributeStatement', () => {
    it('should create an attribute setting statement with function identifier, node, and value', () => {
      const funcId = t.identifier('setAttr');
      const nodesId = t.identifier('_nodes');
      const nodeIndex = 0;
      const value = t.stringLiteral('value');

      const statement = createAttributeStatement(funcId, nodesId, nodeIndex, value);
      expect(statement.type).toBe('ExpressionStatement');
      expect((statement.expression as t.CallExpression).callee).toBe(funcId);
      expect((statement.expression as t.CallExpression).arguments.length).toBe(2);
      expect(
        (
          ((statement.expression as t.CallExpression).arguments[0] as t.MemberExpression)
            .property as t.NumericLiteral
        ).value,
      ).toBe(nodeIndex);
      expect((statement.expression as t.CallExpression).arguments[1]).toBe(value);
    });

    it('should create an attribute setting statement with a key', () => {
      const funcId = t.identifier('setAttr');
      const nodesId = t.identifier('_nodes');
      const nodeIndex = 0;
      const value = t.stringLiteral('value');
      const key = t.stringLiteral('name');

      const statement = createAttributeStatement(funcId, nodesId, nodeIndex, value, key);
      expect(statement.type).toBe('ExpressionStatement');
      expect((statement.expression as t.CallExpression).arguments.length).toBe(3);
      expect((statement.expression as t.CallExpression).arguments[1]).toBe(key);
      expect((statement.expression as t.CallExpression).arguments[2]).toBe(value);
    });
  });
});
