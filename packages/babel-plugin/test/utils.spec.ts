import { beforeEach, describe, expect, it } from 'vitest';
import { types as t } from '@babel/core';
import { importedSets } from '../src/import';
import {
  getAttrName,
  getNodeText,
  getTagName,
  isComponentName,
  isTextChild,
  isValidChild,
  jsxElementNameToString,
  optimizeChildNodes,
  serializeAttributes,
  setNodeText,
  textTrim,
} from '../src/jsx/utils';
import { createASTNode, findNodePath, setupTestEnvironment, withTestContext } from './test-utils';

beforeEach(() => {
  setupTestEnvironment();
});

describe('jSX Utility Functions', () => {
  describe('component and Tag Name Processing', () => {
    describe('isComponentName', () => {
      it.each([
        ['MyComponent', true, 'Capitalized tag'],
        ['My.Component', true, 'Compound tag with dot'],
        ['div', false, 'Lowercase tag'],
        ['$Component', true, 'Tag with special character'],
        ['123Component', true, 'Tag starting with number'],
        ['my-component', false, 'Tag with hyphen'],
      ])('when tag is %s should return %s (%s)', (tag, expected) => {
        expect(isComponentName(tag)).toBe(expected);
      });
    });

    describe('jsxElementNameToString', () => {
      it('should correctly convert JSXIdentifier', () => {
        const node = createASTNode(() => t.jsxIdentifier('Div'));
        expect(jsxElementNameToString(node)).toBe('Div');
      });

      it('should correctly convert JSXMemberExpression', () => {
        const node = createASTNode(() =>
          t.jsxMemberExpression(t.jsxIdentifier('My'), t.jsxIdentifier('Component')),
        );
        expect(jsxElementNameToString(node)).toBe('My.Component');
      });

      it('should correctly convert JSXNamespacedName', () => {
        const node = createASTNode(() =>
          t.jsxNamespacedName(t.jsxIdentifier('svg'), t.jsxIdentifier('path')),
        );
        expect(jsxElementNameToString(node)).toBe('svg:path');
      });
    });

    describe('getTagName', () => {
      it('should get tag name from JSXElement', () => {
        const node = findNodePath<t.JSXElement, t.JSXElement>(
          'const Test = () => <div></div>;',
          'JSXElement',
          path => path.node,
        );
        expect(node).not.toBeNull();
        expect(getTagName(node!)).toBe('div');
      });

      it('should get tag name from JSXMemberExpression', () => {
        const node = findNodePath<t.JSXElement, t.JSXElement>(
          'const Test = () => <MyComponent.Nested></MyComponent.Nested>;',
          'JSXElement',
          path => path.node,
        );
        expect(node).not.toBeNull();
        expect(getTagName(node!)).toBe('MyComponent.Nested');
      });

      it('should get "Fragment" tag name from JSXFragment', () => {
        const node = findNodePath<t.JSXFragment, t.JSXFragment>(
          'const Test = () => <></>;',
          'JSXFragment',
          path => path.node,
        );
        expect(node).not.toBeNull();
        expect(getTagName(node!)).toBe('Fragment');
      });
    });
  });

  describe('text Content Processing', () => {
    describe('isTextChild', () => {
      it.each([
        [
          'JSXText',
          () => ({
            node: t.jsxText('Hello'),
            isJSXExpressionContainer: () => false,
            isJSXText: () => true,
            isStringLiteral: () => false,
            isNullLiteral: () => false,
          }),
          true,
        ],
        [
          'JSXExpressionContainer with StringLiteral',
          () => ({
            node: t.jsxExpressionContainer(t.stringLiteral('Hello')),
            isJSXExpressionContainer: () => true,
            isJSXText: () => false,
            isStringLiteral: () => false,
            isNullLiteral: () => false,
            get: (prop: string) => {
              if (prop === 'expression') {
                return {
                  node: t.stringLiteral('Hello'),
                  isJSXText: () => false,
                  isStringLiteral: () => true,
                  isNumericLiteral: () => false,
                };
              }
              return null;
            },
          }),
          true,
        ],
        [
          'JSXExpressionContainer with non-text',
          () => ({
            node: t.jsxExpressionContainer(t.identifier('variable')),
            isJSXExpressionContainer: () => true,
            isJSXText: () => false,
            isStringLiteral: () => false,
            isNullLiteral: () => false,
            get: (prop: string) => {
              if (prop === 'expression') {
                return {
                  node: t.identifier('variable'),
                  isJSXText: () => false,
                  isStringLiteral: () => false,
                  isNumericLiteral: () => false,
                };
              }
              return null;
            },
          }),
          false,
        ],
      ])('for %s should return %s', (_, pathFactory, expected) => {
        expect(isTextChild(pathFactory() as any)).toBe(expected);
      });
    });

    describe('textTrim', () => {
      it('should trim string and replace multiple spaces with single space', () => {
        const node = createASTNode(() => t.jsxText('  Hello   World  \n'));
        expect(textTrim(node)).toBe('Hello World');

        expect(textTrim(createASTNode(() => t.jsxText('\t\n\r SingleLine \t\n\r')))).toBe(
          'SingleLine',
        );
        expect(textTrim(createASTNode(() => t.jsxText('NoTrim')))).toBe('NoTrim');
        expect(textTrim(createASTNode(() => t.jsxText(' ')))).toBe('');
        expect(textTrim(createASTNode(() => t.jsxText('')))).toBe('');
      });
    });

    describe('isValidChild', () => {
      it.each([
        [
          'Non-empty JSXText',
          () => ({
            node: t.jsxText('Hello'),
            isStringLiteral: () => false,
            isJSXText: () => true,
          }),
          true,
        ],
        [
          'Whitespace-only JSXText',
          () => ({
            node: t.jsxText('   \n\t  '),
            isStringLiteral: () => false,
            isJSXText: () => true,
          }),
          false,
        ],
        [
          'Non-empty StringLiteral',
          () => ({
            node: t.stringLiteral('abc'),
            isStringLiteral: () => true,
            isJSXText: () => false,
          }),
          true,
        ],
      ])('%s should return %s', (_, pathFactory, expected) => {
        expect(isValidChild(pathFactory() as any)).toBe(expected);
      });
    });

    describe('getNodeText and setNodeText', () => {
      it('should get text from JSXText', () => {
        const path = {
          node: t.jsxText('  Some  Text  '),
          isJSXText: () => true,
          isJSXExpressionContainer: () => false,
        };
        expect(getNodeText(path as any)).toBe('Some Text');
      });

      it('should set text for JSXText', () => {
        const node = t.jsxText('old');
        const path = {
          node,
          isJSXText: () => true,
          isJSXExpressionContainer: () => false,
        };
        setNodeText(path as any, 'new text');
        expect(node.value).toBe('new text');
      });

      it('should set text for StringLiteral in JSXExpressionContainer', () => {
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
    });
  });

  describe('child Node Optimization', () => {
    describe('optimizeChildNodes', () => {
      it('should merge consecutive JSXText nodes', () => {
        const result = findNodePath<t.JSXElement, any>(
          '<div>Text1 {" "} Text2</div>',
          'JSXElement',
          path => {
            // Create mock children paths that match the behavior needed
            const children = path.get('children') as any[];
            return optimizeChildNodes(children);
          },
        );

        expect(result).not.toBeNull();
        expect(result.length).toBe(1);
        expect(getNodeText(result[0])).toBe('Text1Text2');
      });
    });
  });

  describe('attribute Processing', () => {
    describe('getAttrName', () => {
      it('should get attribute name from JSXIdentifier', () => {
        const attr = createASTNode(() => t.jsxAttribute(t.jsxIdentifier('className')));
        expect(getAttrName(attr)).toBe('className');
      });

      it('should get attribute name from JSXNamespacedName', () => {
        const attr = createASTNode(() =>
          t.jsxAttribute(t.jsxNamespacedName(t.jsxIdentifier('data'), t.jsxIdentifier('id'))),
        );
        expect(getAttrName(attr)).toBe('data:id');
      });
    });

    describe('serializeAttributes', () => {
      it('should correctly serialize static attributes', () => {
        withTestContext('', 'client', {}, () => {
          const props = {
            id: 'my-id',
            title: 'a title',
            dataValue: 123,
          };
          const serialized = serializeAttributes(props);
          expect(serialized).toBe(' id="my-id" title="a title" dataValue="123"');
        });
      });

      it('should correctly handle boolean attributes', () => {
        withTestContext('', 'client', {}, () => {
          const props = {
            disabled: true,
            checked: false,
            required: true,
          };
          const serialized = serializeAttributes(props);
          expect(serialized).toBe(' disabled required');
        });
      });

      it('should correctly handle class attributes', () => {
        withTestContext('', 'client', {}, () => {
          const props = {
            class: 'btn active',
          };
          const serialized = serializeAttributes(props);
          expect(serialized).toBe(' class="btn active"');
        });
      });

      it('should use computed function for conditional expressions', () => {
        withTestContext('', 'client', {}, () => {
          const mockConditionalExpr = t.conditionalExpression(
            t.identifier('isActive'),
            t.stringLiteral('active'),
            t.stringLiteral('inactive'),
          );
          const props = {
            class: mockConditionalExpr,
          };
          serializeAttributes(props as any);
          expect(importedSets.has('computed')).toBe(true);
        });
      });
    });
  });
});
