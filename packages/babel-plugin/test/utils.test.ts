import { beforeEach, describe, expect, it } from 'vitest';
import { NodePath, types as t } from '@babel/core';
import { clearImport, importedSets } from '../src/import';
import { getContext, resetContext, setContext } from '../src/jsx/context';
import { NODE_TYPE } from '../src/jsx/constants';

// Import internal functions to be tested
import {
  findBeforeIndex,
  findIndexPosition,
  getAttrName,
  getNodeText,
  getTagName,
  isComponentName,
  isTextChild,
  isTreeNode,
  isValidChild,
  jsxElementNameToString,
  optimizeChildNodes,
  processObjectExpression,
  serializeAttributes,
  setNodeText,
  textTrim,
} from '../src/jsx/utils';
import { getPath, getProgramPathAndState } from './test-utils';

beforeEach(() => {
  clearImport();
  resetContext();
  const { programPath, programState } = getProgramPathAndState('const A = () => <div/>;');
  setContext({ path: programPath!, state: programState! });
});

describe('jSX Utility Functions ', () => {
  describe('isComponentName', () => {
    it('should return true for tags starting with an uppercase letter', () => {
      expect(isComponentName('MyComponent')).toBe(true);
    });
    it('should return true for tags containing dots', () => {
      expect(isComponentName('My.Component')).toBe(true);
    });
    it('should return false for tags starting with a lowercase letter', () => {
      expect(isComponentName('div')).toBe(false);
    });
    it('should return true for tags not starting with a letter (e.g., $)', () => {
      expect(isComponentName('$Component')).toBe(true);
    });
    it('should return false for tags starting with a number', () => {
      expect(isComponentName('123Component')).toBe(false);
    });
    it("should return false for tags containing hyphens (unless it's a Web Component spec)", () => {
      expect(isComponentName('my-component')).toBe(false);
    });
  });

  describe('jsxElementNameToString', () => {
    it('should correctly convert JSXIdentifier', () => {
      const node = t.jsxIdentifier('Div');
      expect(jsxElementNameToString(node)).toBe('Div');
    });
    it('should correctly convert JSXMemberExpression', () => {
      const node = t.jsxMemberExpression(t.jsxIdentifier('My'), t.jsxIdentifier('Component'));
      expect(jsxElementNameToString(node)).toBe('My.Component');
    });
    it('should correctly convert JSXNamespacedName', () => {
      const node = t.jsxNamespacedName(t.jsxIdentifier('svg'), t.jsxIdentifier('path'));
      expect(jsxElementNameToString(node)).toBe('svg:path');
    });
  });

  describe('getTagName', () => {
    it('should get the correct tag name from JSXElement', () => {
      const code = 'const Test = () => <div></div>;';
      const jsxElementPath = getPath(code, 'JSXElement') as unknown as NodePath<t.JSXElement>;
      expect(getTagName(jsxElementPath!.node)).toBe('div');
    });
    it('should get the correct tag name from JSXMemberExpression', () => {
      const code = 'const Test = () => <MyComponent.Nested></MyComponent.Nested>;';
      const jsxElementPath = getPath(code, 'JSXElement') as unknown as NodePath<t.JSXElement>;
      expect(getTagName(jsxElementPath!.node)).toBe('MyComponent.Nested');
    });
    it('should get "Fragment" from JSXFragment', () => {
      const code = 'const Test = () => <></>;';
      const jsxFragmentPath = getPath(code, 'JSXFragment') as unknown as NodePath<t.JSXFragment>;
      expect(getTagName(jsxFragmentPath!.node)).toBe('Fragment');
    });
  });

  describe('isTextChild', () => {
    it('should return true for JSXText', () => {
      const node = t.jsxText('Hello');
      expect(isTextChild({ node } as any)).toBe(true);
    });
    it('should return true for JSXExpressionContainer containing StringLiteral', () => {
      const node = t.jsxExpressionContainer(t.stringLiteral('Hello'));
      expect(isTextChild({ node } as any)).toBe(true);
    });
    it('should return true for JSXExpressionContainer containing NumericLiteral', () => {
      const node = t.jsxExpressionContainer(t.numericLiteral(123));
      expect(isTextChild({ node } as any)).toBe(true);
    });
    it('should return true for StringLiteral node itself', () => {
      const node = t.stringLiteral('test');
      expect(isTextChild({ node } as any)).toBe(true);
    });
    it('should return true for NullLiteral node itself', () => {
      const node = t.nullLiteral();
      expect(isTextChild({ node } as any)).toBe(true);
    });
    it('should return false for non-text JSXExpressionContainer', () => {
      const node = t.jsxExpressionContainer(t.identifier('variable'));
      expect(isTextChild({ node } as any)).toBe(false);
    });
    it('should return false for JSXElement', () => {
      const node = t.jsxElement(
        t.jsxOpeningElement(t.jsxIdentifier('div'), []),
        t.jsxClosingElement(t.jsxIdentifier('div')),
        [],
      );
      expect(isTextChild({ node } as any)).toBe(false);
    });
  });

  describe('textTrim', () => {
    it('should trim string and replace multiple whitespaces with a single space', () => {
      const type = 'JSXText';
      expect(textTrim({ node: { type, value: '  Hello   World  \n' } } as any)).toBe('Hello World');
      expect(textTrim({ node: { type, value: '\t\n\r SingleLine \t\n\r' } } as any)).toBe(
        'SingleLine',
      );
      expect(textTrim({ node: { type, value: 'NoTrim' } } as any)).toBe('NoTrim');
      expect(textTrim({ node: { type, value: ' ' } } as any)).toBe('');
      expect(textTrim({ node: { type, value: '' } } as any)).toBe('');
    });
  });

  describe('isValidChild', () => {
    it('should return true for non-empty JSXText', () => {
      const node = t.jsxText('Hello');
      expect(isValidChild({ node } as any)).toBe(true);
    });
    it('should return false for whitespace-only JSXText', () => {
      const node = t.jsxText('   \n\t  ');
      expect(isValidChild({ node } as any)).toBe(false);
    });
    it('should return true for non-empty StringLiteral', () => {
      const node = t.stringLiteral('abc');
      expect(isValidChild({ node } as any)).toBe(true);
    });
    it('should return false for whitespace-only StringLiteral', () => {
      const node = t.stringLiteral('   ');
      expect(isValidChild({ node } as any)).toBe(false);
    });
    it('should return true for JSXElement', () => {
      const node = t.jsxElement(t.jsxOpeningElement(t.jsxIdentifier('div'), []), null, []);
      expect(isValidChild({ node } as any)).toBe(true);
    });
    it('should return true for non-empty JSXExpressionContainer', () => {
      const node = t.jsxExpressionContainer(t.identifier('foo'));
      expect(isValidChild({ node } as any)).toBe(true);
    });
    it('should return true for JSXFragment', () => {
      const node = t.jsxFragment(t.jsxOpeningFragment(), t.jsxClosingFragment(), []);
      expect(isValidChild({ node } as any)).toBe(true);
    });
  });

  describe('getNodeText', () => {
    it('should get text content from JSXText', () => {
      const node = t.jsxText('  Some  Text  ');
      expect(getNodeText({ node } as any)).toBe('Some Text');
    });
    it('should get text content from JSXExpressionContainer containing StringLiteral', () => {
      const node = t.jsxExpressionContainer(t.stringLiteral('  Expr  String  '));
      expect(getNodeText({ node } as any)).toBe('Expr String');
    });
    it('should get text content from JSXExpressionContainer containing NumericLiteral', () => {
      const node = t.jsxExpressionContainer(t.numericLiteral(123));
      expect(getNodeText({ node } as any)).toBe('123');
    });
    it('should return empty string for non-text nodes', () => {
      const node = t.jsxElement(t.jsxOpeningElement(t.jsxIdentifier('div'), []), null, []);
      expect(getNodeText({ node } as any)).toBe('');
    });
  });

  describe('setNodeText', () => {
    it('should set text content of JSXText', () => {
      const node = t.jsxText('old');
      setNodeText({ node } as any, 'new text');
      expect(node.value).toBe('new text');
    });
    it('should set text content of JSXExpressionContainer containing StringLiteral', () => {
      const stringLiteralNode = t.stringLiteral('old');
      const exprContainerNode = t.jsxExpressionContainer(stringLiteralNode);
      const path: any = {
        node: exprContainerNode,
        get: (key: string) =>
          key === 'expression'
            ? {
                node: stringLiteralNode,
                replaceWith: (newNode: any) => {
                  stringLiteralNode.value = newNode.value;
                },
              }
            : undefined,
      };
      setNodeText(path, 'new expr text');
      expect(stringLiteralNode.value).toBe('new expr text');
    });
    it('should set text content of JSXExpressionContainer containing NumericLiteral', () => {
      const numericLiteralNode = t.numericLiteral(123);
      const exprContainerNode = t.jsxExpressionContainer(numericLiteralNode);
      const path: any = {
        node: exprContainerNode,
        get: (key: string) =>
          key === 'expression'
            ? {
                node: numericLiteralNode,
                replaceWith: (newNode: any) => {
                  numericLiteralNode.value = newNode.value;
                },
              }
            : undefined,
      };
      setNodeText(path, '456');
      expect(numericLiteralNode.value).toBe(456); // replaceWith should be stringLiteral, so there will be type mismatch here
    });
  });

  describe('optimizeChildNodes', () => {
    it('should merge consecutive JSXText nodes', () => {
      const code = `<div>Text1 {' ' } Text2</div>`;
      const jsxElementPath = getPath(code, 'JSXElement') as unknown as NodePath<t.JSXElement>;
      const children = jsxElementPath!.get('children');
      const optimized = optimizeChildNodes(children);

      expect(optimized.length).toBe(1);
      expect(getNodeText(optimized[0])).toBe('Text1 Text2');
    });

    it('should merge consecutive JSXExpressionContainer (StringLiteral/NumericLiteral) nodes', () => {
      const code = `<div>{'Hello'} {'World'} {123}</div>`;
      const jsxElementPath = getPath(code, 'JSXElement') as unknown as NodePath<t.JSXElement>;
      const children = jsxElementPath!.get('children');
      const optimized = optimizeChildNodes(children);

      expect(optimized.length).toBe(1);
      expect(getNodeText(optimized[0])).toBe('Hello World 123');
    });

    it('should not merge text nodes and non-text nodes', () => {
      const code = '<div>Text1<span>Span</span>Text2</div>';
      const jsxElementPath = getPath(code, 'JSXElement') as unknown as NodePath<t.JSXElement>;
      const children = jsxElementPath!.get('children');
      const optimized = optimizeChildNodes(children);

      expect(optimized.length).toBe(3);
      expect(getNodeText(optimized[0])).toBe('Text1');
      expect(optimized[1].isJSXElement()).toBe(true);
      expect(getNodeText(optimized[2])).toBe('Text2');
    });

    it('should ignore whitespace nodes', () => {
      const code = '<div>  Text1  \n\t  <span>Span</span>   </div>';
      const jsxElementPath = getPath(code, 'JSXElement') as unknown as NodePath<t.JSXElement>;
      const children = jsxElementPath!.get('children');
      const optimized = optimizeChildNodes(children);

      expect(optimized.length).toBe(2);
      expect(getNodeText(optimized[0])).toBe('Text1');
      expect(optimized[1].isJSXElement()).toBe(true);
    });
  });

  describe('processObjectExpression', () => {
    it('should wrap object in computed when conditional expressions exist', () => {
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
      const { state } = getContext();
      const result = processObjectExpression(propName, objectExpr, propsCollection, state);

      expect(result).toBe(''); // For non-class/style, no string is returned
      expect(importedSets.has('computed')).toBe(true);
      expect(propsCollection[propName].type).toBe('CallExpression');
      expect(((propsCollection[propName] as t.CallExpression).callee as t.Identifier).name).toBe(
        '_computed$',
      );
    });

    it("should return static string when it's a class/style attribute and no conditional expressions", () => {
      const propName = 'class';
      const objectExpr = t.objectExpression([
        t.objectProperty(t.identifier('active'), t.booleanLiteral(true)),
        t.objectProperty(t.identifier('large'), t.booleanLiteral(false)),
        t.objectProperty(t.identifier('highlight'), t.stringLiteral('true')),
      ]);
      const propsCollection: Record<string, any> = { class: objectExpr }; // Simulate original value
      const { state } = getContext();
      const result = processObjectExpression(propName, objectExpr, propsCollection, state, true);

      // Note: Boolean value handling for class attributes here needs to be combined with serializeAttributes logic
      // Currently processObjectExpression's static handling for class/style only considers key: value form
      // Expected behavior: convert object to CSS string or class name string
      expect(result).toBe('active:true;highlight:true;'); // Assuming true is also converted to 'true'
      expect(propsCollection.class).toBeUndefined(); // Original property should be deleted
    });
  });

  describe('getAttrName', () => {
    it('should get attribute name from JSXIdentifier', () => {
      const attr = t.jsxAttribute(t.jsxIdentifier('className'));
      expect(getAttrName(attr)).toBe('className');
    });
    it('should get attribute name from JSXNamespacedName', () => {
      const attr = t.jsxAttribute(
        t.jsxNamespacedName(t.jsxIdentifier('data'), t.jsxIdentifier('id')),
      );
      expect(getAttrName(attr)).toBe('data:id');
    });
    it('should throw error for unsupported attribute type', () => {
      const attr: any = { name: { type: 'InvalidType' } };
      expect(() => getAttrName(attr)).toThrow('Unsupported attribute type');
    });
  });

  describe('serializeAttributes', () => {
    // This test needs to ensure that the state simulation is correct so that addImport does not report errors
    // const mockState: any = {
    //   imports: {
    //     computed: 'computed$',
    //     setClass: 'setClass$',
    //     setStyle: 'setStyle$',
    //     setAttr: 'setAttr$',
    //     setSpread: 'setSpread$',
    //     addEventListener: 'addEventListener$',
    //   },
    // };

    it('should correctly serialize static attributes', () => {
      const props = {
        id: 'my-id',
        title: 'a title',
        dataValue: 123,
      };
      const { state } = getContext();
      const serialized = serializeAttributes(props, state);
      expect(serialized).toBe(` id="my-id" title="a title" dataValue="123"`);
    });

    it('should correctly handle boolean attributes', () => {
      const props = {
        disabled: true,
        checked: false,
        required: true,
      };
      const { state } = getContext();
      const serialized = serializeAttributes(props, state);
      expect(serialized).toBe(' disabled required');
    });

    it('should correctly handle class attributes', () => {
      const props = {
        class: 'btn active',
      };
      const { state } = getContext();
      const serialized = serializeAttributes(props, state);
      expect(serialized).toBe(` class="btn active"`);
    });

    it('should correctly handle style attributes', () => {
      const props = {
        style: 'color: red; font-size: 14px',
      };
      const { state } = getContext();
      const serialized = serializeAttributes(props, state);
      expect(serialized).toBe(` style="color: red; font-size: 14px;"`);
    });

    it('should wrap conditional expressions in attributes with a computed function', () => {
      // Simulate a babel AST ConditionalExpression
      const mockConditionalExpr = t.conditionalExpression(
        t.identifier('isActive'),
        t.stringLiteral('active'),
        t.stringLiteral('blue'),
      );
      const props = {
        class: mockConditionalExpr, // Directly pass AST node
      };
      const { state } = getContext();
      const serialized = serializeAttributes(props as any, state);
      expect(importedSets.has('computed')).toBe(true);
      // No direct assertion on serialized value as it will be a complex function call string.
      // Ensure it's processed correctly, e.g., by checking importedSets.
      expect(serialized).not.toBeNull(); // Ensure not null
    });

    it('should handle style object properties containing conditional expressions', () => {
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
      const { state } = getContext();
      const serialized = serializeAttributes(props as any, state);
      expect(importedSets.has('computed')).toBe(true);
      expect(serialized).not.toBeNull();
    });
  });

  describe('isTreeNode', () => {
    it('should return true for objects conforming to TreeNode interface', () => {
      const node: any = { type: NODE_TYPE.NORMAL, tag: 'div', children: [], index: 1 };
      expect(isTreeNode(node)).toBe(true);
    });
    it('should return false for objects missing type property', () => {
      const node: any = { tag: 'div', children: [], index: 1 };
      expect(isTreeNode(node)).toBe(false);
    });
    it('should return false for objects missing tag property', () => {
      const node: any = { type: NODE_TYPE.NORMAL, children: [], index: 1 };
      expect(isTreeNode(node)).toBe(false);
    });
    it('should return false for objects missing children property', () => {
      const node: any = { type: NODE_TYPE.NORMAL, tag: 'div', index: 1 };
      expect(isTreeNode(node)).toBe(false);
    });
    it('should return false for objects missing index property', () => {
      const node: any = { type: NODE_TYPE.NORMAL, tag: 'div', children: [] };
      expect(isTreeNode(node)).toBe(false);
    });
    it('should return false for non-object values', () => {
      expect(isTreeNode(null)).toBe(false);
      expect(isTreeNode(undefined)).toBe(false);
      expect(isTreeNode('string')).toBe(false);
      expect(isTreeNode(123)).toBe(false);
    });
  });

  describe('findBeforeIndex', () => {
    it('should return the index of a static sibling node when a dynamic node is followed by one', () => {
      const parentNode: any = {
        children: [
          { type: NODE_TYPE.EXPRESSION, index: 10, isLastChild: false },
          { type: NODE_TYPE.NORMAL, index: 20, tag: 'span', isLastChild: false },
        ],
      };
      expect(findBeforeIndex(parentNode.children[0], parentNode)).toBe(20);
    });

    it('should return the index of a comment node when a dynamic node is followed by one', () => {
      const parentNode: any = {
        children: [
          { type: NODE_TYPE.EXPRESSION, index: 10, isLastChild: false },
          { type: NODE_TYPE.COMMENT, index: 20, isLastChild: false },
          { type: NODE_TYPE.NORMAL, index: 30, tag: 'span', isLastChild: false },
        ],
      };
      expect(findBeforeIndex(parentNode.children[0], parentNode)).toBe(20);
    });

    it('should return the index of the nearest subsequent static node when a dynamic node is followed only by other dynamic nodes, or null if none', () => {
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

    it('should return null when a dynamic node is the last child of its parent', () => {
      const parentNode: any = {
        children: [
          { type: NODE_TYPE.NORMAL, index: 10, tag: 'div', isLastChild: false },
          { type: NODE_TYPE.EXPRESSION, index: 20, isLastChild: true },
        ],
      };
      expect(findBeforeIndex(parentNode.children[1], parentNode)).toBe(null);
    });

    it('should return null when the parent node is empty', () => {
      const parentNode: any = { children: [] };
      const currentNode: any = { type: NODE_TYPE.EXPRESSION, index: 1, isLastChild: true };
      expect(findBeforeIndex(currentNode, parentNode)).toBe(null);
    });
  });

  describe('findIndexPosition', () => {
    it('should return the correct position of the target index in the map array', () => {
      const indexMap = [1, 5, 10, 15, 20];
      expect(findIndexPosition(1, indexMap)).toBe(0);
      expect(findIndexPosition(10, indexMap)).toBe(2);
      expect(findIndexPosition(20, indexMap)).toBe(4);
    });

    it('should return -1 if the target index is not in the map array', () => {
      const indexMap = [1, 5, 10];
      expect(findIndexPosition(3, indexMap)).toBe(-1);
      expect(findIndexPosition(100, indexMap)).toBe(-1);
    });

    it('an empty map array should always return -1', () => {
      const indexMap: number[] = [];
      expect(findIndexPosition(1, indexMap)).toBe(-1);
    });
  });
});
