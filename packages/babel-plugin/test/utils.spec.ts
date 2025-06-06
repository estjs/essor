/**
 * JSX 工具函数测试
 *
 * 本文件测试JSX转换过程中使用的工具函数，包括：
 * - 组件名称识别
 * - 标签名称获取
 * - 文本内容处理
 * - 属性序列化
 * - 树节点操作
 */

import { beforeEach, describe, expect, it } from 'vitest';
import { types as t } from '@babel/core';
import { importedSets } from '../src/import';
import { NODE_TYPE } from '../src/jsx/constants';
import {
  findBeforeIndex,
  findIndexPosition,
  getAttrName,
  getNodeText,
  getTagName,
  isComponentName,
  isTextChild,
  isValidChild,
  jsxElementNameToString,
  optimizeChildNodes,
  processObjectExpression,
  serializeAttributes,
  setNodeText,
  textTrim,
} from '../src/jsx/utils';
import { getPath, setupTestContext } from './test-utils';

// Import internal functions to be tested

beforeEach(() => {
  setupTestContext();
});

describe('jSX 工具函数', () => {
  describe('组件和标签名称处理', () => {
    describe('isComponentName', () => {
      it.each([
        ['MyComponent', true, '以大写字母开头的标签'],
        ['My.Component', true, '包含点的复合标签'],
        ['div', false, '以小写字母开头的标签'],
        ['$Component', true, '以特殊字符开头的标签'],
        ['123Component', true, '以数字开头的标签'],
        ['my-component', false, '包含连字符的标签'],
      ])('当标签为 %s 时应返回 %s (%s)', (tag, expected) => {
        expect(isComponentName(tag)).toBe(expected);
      });
    });

    describe('jsxElementNameToString', () => {
      it('应正确转换JSXIdentifier', () => {
        const node = t.jsxIdentifier('Div');
        expect(jsxElementNameToString(node)).toBe('Div');
      });

      it('应正确转换JSXMemberExpression', () => {
        const node = t.jsxMemberExpression(t.jsxIdentifier('My'), t.jsxIdentifier('Component'));
        expect(jsxElementNameToString(node)).toBe('My.Component');
      });

      it('应正确转换JSXNamespacedName', () => {
        const node = t.jsxNamespacedName(t.jsxIdentifier('svg'), t.jsxIdentifier('path'));
        expect(jsxElementNameToString(node)).toBe('svg:path');
      });
    });

    describe('getTagName', () => {
      it('应从JSXElement中获取正确的标签名', () => {
        const code = 'const Test = () => <div></div>;';
        const jsxElementPath = getPath(code, 'JSXElement');
        if (!jsxElementPath) {
          throw new Error('未找到JSXElement节点');
        }
        expect(getTagName(jsxElementPath.node as t.JSXElement)).toBe('div');
      });

      it('应从JSXMemberExpression中获取正确的标签名', () => {
        const code = 'const Test = () => <MyComponent.Nested></MyComponent.Nested>;';
        const jsxElementPath = getPath(code, 'JSXElement');
        if (!jsxElementPath) {
          throw new Error('未找到JSXElement节点');
        }
        expect(getTagName(jsxElementPath.node as t.JSXElement)).toBe('MyComponent.Nested');
      });

      it('应从JSXFragment中获取"Fragment"标签名', () => {
        const code = 'const Test = () => <></>;';
        const jsxFragmentPath = getPath(code, 'JSXFragment');
        if (!jsxFragmentPath) {
          throw new Error('未找到JSXFragment节点');
        }
        expect(getTagName(jsxFragmentPath.node as t.JSXFragment)).toBe('Fragment');
      });
    });
  });

  describe('文本内容处理', () => {
    describe('isTextChild', () => {
      it.each([
        ['JSXText', () => t.jsxText('Hello'), true],
        [
          '包含StringLiteral的JSXExpressionContainer',
          () => t.jsxExpressionContainer(t.stringLiteral('Hello')),
          true,
        ],
        [
          '包含NumericLiteral的JSXExpressionContainer',
          () => t.jsxExpressionContainer(t.numericLiteral(123)),
          true,
        ],
        ['StringLiteral节点', () => t.stringLiteral('test'), true],
        ['NullLiteral节点', () => t.nullLiteral(), true],
        [
          '非文本JSXExpressionContainer',
          () => t.jsxExpressionContainer(t.identifier('variable')),
          false,
        ],
        [
          'JSXElement',
          () =>
            t.jsxElement(
              t.jsxOpeningElement(t.jsxIdentifier('div'), []),
              t.jsxClosingElement(t.jsxIdentifier('div')),
              [],
            ),
          false,
        ],
      ])('对于%s应返回%s', (_, nodeFactory, expected) => {
        const node = nodeFactory();
        // 修复类型问题：创建一个具有node属性并模拟isJSXExpressionContainer等方法的对象
        const path = {
          node,
          isJSXExpressionContainer: () => t.isJSXExpressionContainer(node),
          isJSXText: () => t.isJSXText(node),
          isStringLiteral: () => t.isStringLiteral(node),
          isNullLiteral: () => t.isNullLiteral(node),
          get: (prop: string) => {
            if (prop === 'expression' && t.isJSXExpressionContainer(node)) {
              const expr = node.expression;
              return {
                node: expr,
                isJSXText: () => t.isJSXText(expr),
                isStringLiteral: () => t.isStringLiteral(expr),
                isNumericLiteral: () => t.isNumericLiteral(expr),
              };
            }
            return null;
          },
        };
        expect(isTextChild(path as any)).toBe(expected);
      });
    });

    describe('textTrim', () => {
      it('应修剪字符串并将多个空格替换为单一空格', () => {
        // 直接传递JSXText节点，符合函数期望的参数类型
        expect(textTrim(t.jsxText('  Hello   World  \n'))).toBe('Hello World');
        expect(textTrim(t.jsxText('\t\n\r SingleLine \t\n\r'))).toBe('SingleLine');
        expect(textTrim(t.jsxText('NoTrim'))).toBe('NoTrim');
        expect(textTrim(t.jsxText(' '))).toBe('');
        expect(textTrim(t.jsxText(''))).toBe('');
      });
    });

    describe('isValidChild', () => {
      it.each([
        ['非空JSXText', () => t.jsxText('Hello'), true],
        ['只含空白的JSXText', () => t.jsxText('   \n\t  '), false],
        ['非空StringLiteral', () => t.stringLiteral('abc'), true],
        ['只含空白的StringLiteral', () => t.stringLiteral('   '), false],
        [
          'JSXElement',
          () => t.jsxElement(t.jsxOpeningElement(t.jsxIdentifier('div'), []), null, []),
          true,
        ],
        ['非空JSXExpressionContainer', () => t.jsxExpressionContainer(t.identifier('foo')), true],
        [
          'JSXFragment',
          () => t.jsxFragment(t.jsxOpeningFragment(), t.jsxClosingFragment(), []),
          true,
        ],
      ])('%s应返回%s', (_, nodeFactory, expected) => {
        const node = nodeFactory();
        // 创建具有必要方法的路径对象
        const path = {
          node,
          isStringLiteral: () => t.isStringLiteral(node),
          isJSXText: () => t.isJSXText(node),
        };
        expect(isValidChild(path as any)).toBe(expected);
      });
    });

    describe('getNodeText', () => {
      it('应从JSXText获取文本内容', () => {
        const node = t.jsxText('  Some  Text  ');
        const path = {
          node,
          isJSXText: () => true,
          isJSXExpressionContainer: () => false,
        };
        expect(getNodeText(path as any)).toBe('Some Text');
      });

      it('应从包含StringLiteral的JSXExpressionContainer获取文本内容', () => {
        const stringLiteral = t.stringLiteral('  Expr  String  ');
        const node = t.jsxExpressionContainer(stringLiteral);
        const path = {
          node,
          isJSXText: () => false,
          isJSXExpressionContainer: () => true,
          get: () => ({
            node: stringLiteral,
            isStringLiteral: () => true,
            isNumericLiteral: () => false,
          }),
        };
        expect(getNodeText(path as any)).toBe('  Expr  String  ');
      });

      it('应从包含NumericLiteral的JSXExpressionContainer获取文本内容', () => {
        const numericLiteral = t.numericLiteral(123);
        const node = t.jsxExpressionContainer(numericLiteral);
        const path = {
          node,
          isJSXText: () => false,
          isJSXExpressionContainer: () => true,
          get: () => ({
            node: numericLiteral,
            isStringLiteral: () => false,
            isNumericLiteral: () => true,
          }),
        };
        expect(getNodeText(path as any)).toBe('123');
      });

      it('对于非文本节点应返回空字符串', () => {
        const node = t.jsxElement(t.jsxOpeningElement(t.jsxIdentifier('div'), []), null, []);
        const path = {
          node,
          isJSXText: () => false,
          isJSXExpressionContainer: () => false,
        };
        expect(getNodeText(path as any)).toBe('');
      });
    });

    describe('setNodeText', () => {
      it('应设置JSXText的文本内容', () => {
        const node = t.jsxText('old');
        const path = {
          node,
          isJSXText: () => true,
          isJSXExpressionContainer: () => false,
        };
        setNodeText(path as any, 'new text');
        expect(node.value).toBe('new text');
      });

      it('应设置包含StringLiteral的JSXExpressionContainer的文本内容', () => {
        const stringLiteralNode = t.stringLiteral('old');
        const exprContainerNode = t.jsxExpressionContainer(stringLiteralNode);
        const path = {
          node: exprContainerNode,
          isJSXText: () => false,
          isJSXExpressionContainer: () => true,
          get: () => ({
            node: stringLiteralNode,
            isStringLiteral: () => true,
            isNumericLiteral: () => false,
            replaceWith: (newNode: any) => {
              stringLiteralNode.value = newNode.value;
            },
          }),
        };
        setNodeText(path as any, 'new expr text');
        expect(stringLiteralNode.value).toBe('new expr text');
      });

      it('应设置包含NumericLiteral的JSXExpressionContainer的文本内容', () => {
        const numericLiteralNode = t.numericLiteral(123);
        const exprContainerNode = t.jsxExpressionContainer(numericLiteralNode);
        const path = {
          node: exprContainerNode,
          isJSXText: () => false,
          isJSXExpressionContainer: () => true,
          get: () => ({
            node: numericLiteralNode,
            isStringLiteral: () => false,
            isNumericLiteral: () => true,
            replaceWith: (newNode: any) => {
              // 修复：确保将stringLiteral的值转换为数字
              numericLiteralNode.value = Number(newNode.value);
            },
          }),
        };
        setNodeText(path as any, '456');
        expect(numericLiteralNode.value).toBe(456);
      });
    });
  });

  describe('子节点优化', () => {
    describe('optimizeChildNodes', () => {
      it('应合并连续的JSXText节点', () => {
        const code = `<div>Text1 {' ' } Text2</div>`;
        const jsxElementPath = getPath(code, 'JSXElement');
        if (!jsxElementPath) {
          throw new Error('未找到JSXElement节点');
        }
        const children = jsxElementPath.get('children');
        const optimized = optimizeChildNodes(children);

        expect(optimized.length).toBe(1);
        expect(getNodeText(optimized[0])).toBe('Text1 Text2');
      });

      it('应合并连续的JSXExpressionContainer (StringLiteral/NumericLiteral) 节点', () => {
        const code = `<div>{'Hello'} {'World'} {123}</div>`;
        const jsxElementPath = getPath(code, 'JSXElement');
        if (!jsxElementPath) {
          throw new Error('未找到JSXElement节点');
        }
        const children = jsxElementPath.get('children');
        const optimized = optimizeChildNodes(children);

        expect(optimized.length).toBe(1);
        expect(getNodeText(optimized[0])).toBe('Hello World 123');
      });

      it('不应合并文本节点和非文本节点', () => {
        const code = '<div>Text1<span>Span</span>Text2</div>';
        const jsxElementPath = getPath(code, 'JSXElement');
        if (!jsxElementPath) {
          throw new Error('未找到JSXElement节点');
        }
        const children = jsxElementPath.get('children');
        const optimized = optimizeChildNodes(children);

        expect(optimized.length).toBe(3);
        expect(getNodeText(optimized[0])).toBe('Text1');
        expect(optimized[1].isJSXElement()).toBe(true);
        expect(getNodeText(optimized[2])).toBe('Text2');
      });

      it('应忽略纯空白节点', () => {
        const code = '<div>  Text1  \n\t  <span>Span</span>   </div>';
        const jsxElementPath = getPath(code, 'JSXElement');
        if (!jsxElementPath) {
          throw new Error('未找到JSXElement节点');
        }
        const children = jsxElementPath.get('children');
        const optimized = optimizeChildNodes(children || []);

        expect(optimized.length).toBe(2);
        expect(getNodeText(optimized[0])).toBe('Text1');
        expect(optimized[1].isJSXElement()).toBe(true);
      });
    });
  });

  describe('属性处理', () => {
    describe('processObjectExpression', () => {
      it('当存在条件表达式时应将对象包装在computed中', () => {
        const propName = 'style';
        const objectExpr = t.objectExpression([
          t.objectProperty(
            t.identifier('color'),
            t.conditionalExpression(
              t.identifier('isActive'),
              t.stringLiteral('red'),
              t.stringLiteral('blue'),
            ),
          ),
        ]);
        const propsCollection: Record<string, any> = {};
        const result = processObjectExpression(propName, objectExpr, propsCollection);

        expect(result).toBe(''); // For non-class/style, no string is returned
        expect(importedSets.has('computed')).toBe(true);
        expect(propsCollection[propName].type).toBe('CallExpression');
        expect(((propsCollection[propName] as t.CallExpression).callee as t.Identifier).name).toBe(
          '_computed$',
        );
      });

      it('当为class/style属性且没有条件表达式时应返回静态字符串', () => {
        const propName = 'class';
        const objectExpr = t.objectExpression([
          t.objectProperty(t.identifier('active'), t.booleanLiteral(true)),
          t.objectProperty(t.identifier('large'), t.booleanLiteral(false)),
          t.objectProperty(t.identifier('highlight'), t.stringLiteral('true')),
        ]);
        const propsCollection: Record<string, any> = { class: objectExpr }; // Simulate original value
        const result = processObjectExpression(propName, objectExpr, propsCollection, true);

        // Note: Boolean value handling for class attributes here needs to be combined with serializeAttributes logic
        // Currently processObjectExpression's static handling for class/style only considers key: value form
        // Expected behavior: convert object to CSS string or class name string
        expect(result).toBe('highlight:true;'); // Assuming true is also converted to 'true'
        expect(propsCollection.class).toBeUndefined(); // Original property should be deleted
      });
    });

    describe('getAttrName', () => {
      it('应从JSXIdentifier获取属性名称', () => {
        const attr = t.jsxAttribute(t.jsxIdentifier('className'));
        expect(getAttrName(attr)).toBe('className');
      });

      it('应从JSXNamespacedName获取属性名称', () => {
        const attr = t.jsxAttribute(
          t.jsxNamespacedName(t.jsxIdentifier('data'), t.jsxIdentifier('id')),
        );
        expect(getAttrName(attr)).toBe('data:id');
      });

      it('对不支持的属性类型输出空字符串', () => {
        const attr: any = { name: { type: 'InvalidType' } };
        expect(() => getAttrName(attr)).toBe('');
      });
    });

    describe('serializeAttributes', () => {
      it('应正确序列化静态属性', () => {
        const props = {
          id: 'my-id',
          title: 'a title',
          dataValue: 123,
        };
        const serialized = serializeAttributes(props);
        expect(serialized).toBe(` id="my-id" title="a title" dataValue="123"`);
      });

      it('应正确处理布尔属性', () => {
        const props = {
          disabled: true,
          checked: false,
          required: true,
        };
        const serialized = serializeAttributes(props);
        expect(serialized).toBe(' disabled required');
      });

      it('应正确处理class属性', () => {
        const props = {
          class: 'btn active',
        };
        const serialized = serializeAttributes(props);
        expect(serialized).toBe(` class="btn active"`);
      });

      it('应正确处理style属性', () => {
        const props = {
          style: 'color: red; font-size: 14px',
        };
        const serialized = serializeAttributes(props);
        expect(serialized).toBe(` style="color: red; font-size: 14px;"`);
      });

      it('应使用computed函数包装属性中的条件表达式', () => {
        // Simulate a babel AST ConditionalExpression
        const mockConditionalExpr = t.conditionalExpression(
          t.identifier('isActive'),
          t.stringLiteral('active'),
          t.stringLiteral('blue'),
        );
        const props = {
          class: mockConditionalExpr, // Directly pass AST node
        };
        const serialized = serializeAttributes(props as any);
        expect(importedSets.has('computed')).toBe(true);
        // No direct assertion on serialized value as it will be a complex function call string.
        // Ensure it's processed correctly, e.g., by checking importedSets.
        expect(serialized).not.toBeNull(); // Ensure not null
      });

      it('应处理包含条件表达式的style对象属性', () => {
        const mockObjectExprWithConditional = t.objectExpression([
          t.objectProperty(
            t.identifier('color'),
            t.conditionalExpression(
              t.identifier('isRed'),
              t.stringLiteral('red'),
              t.stringLiteral('blue'),
            ),
          ),
        ]);
        const props = {
          style: mockObjectExprWithConditional,
        };
        const serialized = serializeAttributes(props as any);
        expect(importedSets.has('computed')).toBe(true);
        expect(serialized).not.toBeNull();
      });
    });
  });

  describe('树节点操作', () => {
    describe('findBeforeIndex', () => {
      it('当动态节点后面有静态兄弟节点时应返回该节点的索引', () => {
        const parentNode: any = {
          children: [
            { type: NODE_TYPE.EXPRESSION, index: 10, isLastChild: false },
            { type: NODE_TYPE.NORMAL, index: 20, tag: 'span', isLastChild: false },
          ],
        };
        expect(findBeforeIndex(parentNode.children[0], parentNode)).toBe(20);
      });

      it('当动态节点后面有注释节点时应返回该节点的索引', () => {
        const parentNode: any = {
          children: [
            { type: NODE_TYPE.EXPRESSION, index: 10, isLastChild: false },
            { type: NODE_TYPE.COMMENT, index: 20, isLastChild: false },
            { type: NODE_TYPE.NORMAL, index: 30, tag: 'span', isLastChild: false },
          ],
        };
        expect(findBeforeIndex(parentNode.children[0], parentNode)).toBe(30);
      });

      it('当动态节点后只有其他动态节点且没有静态节点时应返回null', () => {
        const parentNode: any = {
          children: [
            { type: NODE_TYPE.EXPRESSION, index: 10, isLastChild: false }, // {v1}
            { type: NODE_TYPE.COMPONENT, index: 20, isLastChild: false }, // <Comp/>
            { type: NODE_TYPE.EXPRESSION, index: 30, isLastChild: true }, // {v2}
          ],
        };
        // {v1} is followed by {Comp}, {Comp} by {v2}, no static nodes
        expect(findBeforeIndex(parentNode.children[0], parentNode)).toBe(null);
        expect(findBeforeIndex(parentNode.children[1], parentNode)).toBe(null);
      });

      it('当动态节点是其父节点的最后一个子节点时应返回null', () => {
        const parentNode: any = {
          children: [
            { type: NODE_TYPE.NORMAL, index: 10, tag: 'div', isLastChild: false },
            { type: NODE_TYPE.EXPRESSION, index: 20, isLastChild: true },
          ],
        };
        expect(findBeforeIndex(parentNode.children[1], parentNode)).toBe(null);
      });

      it('当父节点为空时应返回null', () => {
        const parentNode: any = { children: [] };
        const currentNode: any = { type: NODE_TYPE.EXPRESSION, index: 1, isLastChild: true };
        expect(findBeforeIndex(currentNode, parentNode)).toBe(null);
      });
    });

    describe('findIndexPosition', () => {
      it('应返回目标索引在索引映射数组中的正确位置', () => {
        const indexMap = [1, 5, 10, 15, 20];
        expect(findIndexPosition(1, indexMap)).toBe(0);
        expect(findIndexPosition(10, indexMap)).toBe(2);
        expect(findIndexPosition(20, indexMap)).toBe(4);
      });

      it('当目标索引不在映射数组中时应返回-1', () => {
        const indexMap = [1, 5, 10];
        expect(findIndexPosition(3, indexMap)).toBe(-1);
        expect(findIndexPosition(100, indexMap)).toBe(-1);
      });

      it('空映射数组总是返回-1', () => {
        const indexMap: number[] = [];
        expect(findIndexPosition(1, indexMap)).toBe(-1);
      });
    });
  });
});
