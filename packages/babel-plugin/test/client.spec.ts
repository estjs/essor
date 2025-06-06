import { beforeEach, describe, expect, it } from 'vitest';
import { types as t } from '@babel/core';
import { importedSets } from '../src/import';
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
import { resetContext } from '../src/jsx/context';
import { setupTestEnvironment, withTestContext } from './test-utils';

describe('client Rendering Mode Internal Functions', () => {
  beforeEach(() => {
    setupTestEnvironment();
    withTestContext('const A = () => <div/>;', 'client', {}, () => {});
  });

  afterEach(() => {
    resetContext();
  });
  describe('template Processing', () => {
    describe('processTemplate', () => {
      it('should generate correct template string for simple HTML tree', () => {
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
        expect(template).toBe('<div>Hello<span>World</span></div>');
      });

      it('should generate correct template string for self-closing tags', () => {
        const tree = createDefaultTree();
        tree.tag = 'img';
        tree.isSelfClosing = true;
        tree.props = { src: 'pic.jpg' };
        tree.index = 0;
        tree.root = true;
        const template = processTemplate(tree);
        expect(template).toBe('<img src="pic.jpg"/>'); // Root node index is 0
      });

      it('should handle comment nodes and generate correct template string', () => {
        const tree = createDefaultTree();
        tree.tag = 'div';
        tree.index = 0;
        tree.root = true;
        tree.children = [{ type: NODE_TYPE.COMMENT, children: [], index: 1 }] as any;
        const template = processTemplate(tree);
        expect(template).toBe('<div><!></div>');
      });
    });
  });

  describe('dynamic Content Processing', () => {
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
      it.each([
        [
          'should extract return statement parameter from arrow function IIFE',
          () =>
            t.callExpression(
              t.arrowFunctionExpression(
                [],
                t.blockStatement([t.returnStatement(t.stringLiteral('returned value'))]),
              ),
              [],
            ),
          'StringLiteral',
          'returned value',
        ],
        [
          'should extract expression body from shorthand arrow function IIFE',
          () =>
            t.callExpression(t.arrowFunctionExpression([], t.stringLiteral('shorthand value')), []),
          'StringLiteral',
          'shorthand value',
        ],
        [
          'should keep non-IIFE expressions unchanged',
          () => t.identifier('myVar'),
          'Identifier',
          null,
        ],
      ])('%s', (_, exprFactory, expectedType, expectedValue) => {
        const expr = exprFactory();
        const processed = processIIFEExpression(expr);
        expect(processed.type).toBe(expectedType);

        if (expectedValue !== null) {
          if (expectedType === 'StringLiteral') {
            expect((processed as t.StringLiteral).value).toBe(expectedValue);
          } else if (expectedType === 'Identifier') {
            expect((processed as t.Identifier).name).toBe(expectedValue);
          }
        } else {
          // Non-IIFE expressions should remain unchanged
          expect(processed).toBe(expr);
        }
      });
    });
  });

  describe('dOM Operations', () => {
    describe('createInsertArguments', () => {
      it('should generate correct insert parameters for dynamic content without preceding node', () => {
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

      it('should generate correct insert parameters for dynamic content with preceding node', () => {
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
      it.each([
        ['without key parameter', false],
        ['with key parameter', true],
      ])('should create attribute setting statement %s', (_, withKey) => {
        const funcId = t.identifier('setAttr');
        const nodesId = t.identifier('_nodes');
        const nodeIndex = 0;
        const value = t.stringLiteral('value');
        const key = withKey ? t.stringLiteral('name') : undefined;

        const statement = createAttributeStatement(funcId, nodesId, nodeIndex, value, key);
        expect(statement.type).toBe('ExpressionStatement');
        expect((statement.expression as t.CallExpression).callee).toBe(funcId);

        if (withKey) {
          expect((statement.expression as t.CallExpression).arguments.length).toBe(3);
          expect((statement.expression as t.CallExpression).arguments[1]).toBe(key);
          expect((statement.expression as t.CallExpression).arguments[2]).toBe(value);
        } else {
          expect((statement.expression as t.CallExpression).arguments.length).toBe(2);
          expect(
            (
              ((statement.expression as t.CallExpression).arguments[0] as t.MemberExpression)
                .property as t.NumericLiteral
            ).value,
          ).toBe(nodeIndex);
          expect((statement.expression as t.CallExpression).arguments[1]).toBe(value);
        }
      });
    });
  });
});
