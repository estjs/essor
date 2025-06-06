/**
 * 客户端渲染模式JSX转换函数测试
 *
 * 本文件测试客户端渲染模式下的特定JSX处理函数，包括：
 * - 模板处理
 * - 动态内容处理
 * - 属性管理
 * - 插入操作
 */

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
import { setupTestContext } from './test-utils';

beforeEach(() => {
  setupTestContext('const A = () => <div/>;', 'client');
});

describe('客户端渲染模式内部函数', () => {
  describe('模板处理', () => {
    describe('processTemplate', () => {
      it('应为简单HTML树生成正确的模板字符串', () => {
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

      it('应为自闭合标签生成正确的模板字符串', () => {
        const tree = createDefaultTree();
        tree.tag = 'img';
        tree.isSelfClosing = true;
        tree.props = { src: 'pic.jpg' };
        tree.index = 0;
        tree.root = true;
        const template = processTemplate(tree);
        expect(template).toBe('<img src="pic.jpg" data-idx="0-0"/>'); // Root node index is 0
      });

      it('应处理注释节点并生成正确的模板字符串', () => {
        const tree = createDefaultTree();
        tree.tag = 'div';
        tree.index = 0;
        tree.root = true;
        tree.children = [{ type: NODE_TYPE.COMMENT, children: [], index: 1 }] as any;
        const template = processTemplate(tree);
        expect(template).toBe('<div data-idx="0-0"><!></div>');
      });
    });
  });

  describe('动态内容处理', () => {
    describe('processDynamic', () => {
      it('应收集动态文本表达式', () => {
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

      it('应收集动态属性', () => {
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

      it('应收集动态组件', () => {
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
          '从箭头函数IIFE中提取return语句参数',
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
          '从简写箭头函数IIFE中提取表达式体',
          () =>
            t.callExpression(t.arrowFunctionExpression([], t.stringLiteral('shorthand value')), []),
          'StringLiteral',
          'shorthand value',
        ],
        ['非IIFE表达式应保持不变', () => t.identifier('myVar'), 'Identifier', null],
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
          // 对于非IIFE表达式，应保持不变
          expect(processed).toBe(expr);
        }
      });
    });
  });

  describe('dOM操作', () => {
    describe('createInsertArguments', () => {
      it('应为动态内容生成正确的插入参数，不带前置节点', () => {
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

      it('应为动态内容生成正确的插入参数，带有前置节点', () => {
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
        ['不带key参数', false],
        ['带key参数', true],
      ])('应创建属性设置语句，%s', (_, withKey) => {
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
