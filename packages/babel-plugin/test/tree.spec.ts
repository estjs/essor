import { beforeEach, describe, expect, it } from 'vitest';
import { type NodePath, types as t } from '@babel/core';
import { clearImport, importedSets } from '../src/import'; // Import clearImport and importedSets
import { getContext, resetContext, setContext } from '../src/jsx/context'; // Import resetContext

// Import internal functions you want to test
import { createDefaultTree, createTree } from '../src/jsx/tree';
import {
  findBeforeIndex,
  findIndexPosition,
  getNodeText,
  getTagName,
  isComponentName,
  isTreeNode,
  optimizeChildNodes,
  serializeAttributes,
  textTrim, // Make sure to import isTreeNode
} from '../src/jsx/utils';
import { NODE_TYPE } from '../src/jsx/constants';
import { getPath, getProgramPathAndState } from './test-utils';

// Reset state before each test to avoid interference between tests
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

describe('jSX Tree Building and Utility Functions', () => {
  describe('createTree', () => {
    it('should correctly build tree structure for basic HTML elements', () => {
      const code = 'const Comp = () => <div>Hello<span>World</span></div>;';
      const jsxElementPath = getPath(
        code,
        'JSXElement',
        {},
        'client',
      ) as unknown as NodePath<t.JSXElement>;
      const tree = createTree(jsxElementPath!, jsxElementPath!.state);

      expect(tree.type).toBe(NODE_TYPE.NORMAL);
      expect(tree.tag).toBe('div');
      expect(tree.root).toBe(true);
      expect(tree.index).toBe(1);
      expect(tree.children.length).toBe(2);

      const textNode = tree.children[0] as any;
      expect(textNode.type).toBe(NODE_TYPE.TEXT);
      expect(textNode.index).toBe(2); // First child node index
      expect(textNode.children[0]).toBe('Hello');

      const spanNode = tree.children[1] as any;
      expect(spanNode.type).toBe(NODE_TYPE.NORMAL);
      expect(spanNode.tag).toBe('span');
      expect(spanNode.index).toBe(3); // Second child node index
      expect(spanNode.children[0].children[0]).toBe('World');
    });

    it('should correctly build tree structure with expressions', () => {
      const code = 'const Comp = (props) => <div>Count: {props.count}</div>;';
      const jsxElementPath = getPath(
        code,
        'JSXElement',
        {},
        'client',
      ) as unknown as NodePath<t.JSXElement>;
      const tree = createTree(jsxElementPath!, jsxElementPath!.state);

      expect(tree.type).toBe(NODE_TYPE.NORMAL);
      expect(tree.tag).toBe('div');
      expect(tree.children.length).toBe(2);

      const textNode = tree.children[0] as any;
      expect(textNode.type).toBe(NODE_TYPE.TEXT);
      expect(textNode.children[0]).toBe('Count: ');

      const exprNode = tree.children[1] as any;
      expect(exprNode.type).toBe(NODE_TYPE.EXPRESSION);
      expect(exprNode.children[0].type).toBe('MemberExpression'); // props.count
    });

    it('should correctly build tree structure for Fragments', () => {
      const code = 'const Comp = () => <><span>A</span><span>B</span></>;';
      const jsxFragmentPath = getPath(
        code,
        'JSXFragment',
        {},
        'client',
      ) as unknown as NodePath<t.JSXFragment>;
      const tree = createTree(jsxFragmentPath!, jsxFragmentPath!.state);

      expect(tree.type).toBe(NODE_TYPE.FRAGMENT);
      expect(tree.isFragment).toBe(true);
      expect(tree.children.length).toBe(2);
      expect((tree.children[0] as any).tag).toBe('span');
      expect((tree.children[1] as any).tag).toBe('span');
    });

    it('should correctly build tree structure for custom components', () => {
      const code = `const Comp = () => <MyComponent propA="valueA" bind:value={$val}>Child</MyComponent>;`;
      const jsxElementPath = getPath(
        code,
        'JSXElement',
        {},
        'client',
      ) as unknown as NodePath<t.JSXElement>;
      const tree = createTree(jsxElementPath!, jsxElementPath!.state);

      expect(tree.type).toBe(NODE_TYPE.COMPONENT);
      expect(tree.tag).toBe('MyComponent');
      expect(tree.props).toBeDefined();
      expect(tree.props?.propA).toBe('valueA');
      expect((tree.props as any)?.value.type).toBe('Identifier'); // $val
      expect((tree.props as any)?.updateValue.type).toBe('ArrowFunctionExpression'); // updateValue function
      expect(tree.children.length).toBe(1);
      expect((tree.children[0] as any).children[0]).toBe('Child');
    });

    it('should insert comment nodes as markers between dynamic content', () => {
      const code = 'const Comp = (props) => <div>Hello {props.name} World!</div>;';
      const jsxElementPath = getPath(
        code,
        'JSXElement',
        {},
        'client',
      ) as unknown as NodePath<t.JSXElement>;
      const tree = createTree(jsxElementPath!, jsxElementPath!.state);

      expect(tree.children.length).toBe(3);
      expect((tree.children[0] as any).type).toBe(NODE_TYPE.TEXT);
      expect((tree.children[1] as any).type).toBe(NODE_TYPE.EXPRESSION);
      expect((tree.children[2] as any).type).toBe(NODE_TYPE.TEXT);
      // Note: In client mode, processDynamic and generateRenderFunction will insert <!> markers.
      // createTree stage only creates the AST. Here we only verify the createTree stage structure.
    });
  });

  describe('optimizeChildNodes', () => {
    it('should merge adjacent JSXText nodes', () => {
      const code = '<div>Hello  World   !</div>';
      const jsxElementPath = getPath(
        code,
        'JSXElement',
        {},
        'client',
      ) as unknown as NodePath<t.JSXElement>;
      const children = jsxElementPath!.get('children');
      const optimized = optimizeChildNodes(children);

      expect(optimized.length).toBe(1);
      expect((optimized[0].node as t.JSXText).value).toBe('Hello World !');
    });

    it('should merge adjacent string/numeric literals in expression containers', () => {
      const code = `<div>{'Hello'}  {123} {' World'}</div>`;
      const jsxElementPath = getPath(
        code,
        'JSXElement',
        {},
        'client',
      ) as unknown as NodePath<t.JSXElement>;
      const children = jsxElementPath!.get('children');
      const optimized = optimizeChildNodes(children);

      expect(optimized.length).toBe(1);
      expect(getNodeText(optimized[0])).toBe('Hello 123 World');
    });

    it('should not merge text and non-text nodes', () => {
      const code = '<div>Hello<span>World</span>Text</div>';
      const jsxElementPath = getPath(
        code,
        'JSXElement',
        {},
        'client',
      ) as unknown as NodePath<t.JSXElement>;
      const children = jsxElementPath!.get('children');
      const optimized = optimizeChildNodes(children);

      expect(optimized.length).toBe(3);
      expect((optimized[0].node as t.JSXText).value).toBe('Hello');
      expect(optimized[1].isJSXElement()).toBe(true);
      expect((optimized[2].node as t.JSXText).value).toBe('Text');
    });

    it('should ignore whitespace nodes', () => {
      const code = '<div>  Text1  \n\t  <span>Span</span>   </div>';
      const jsxElementPath = getPath(
        code,
        'JSXElement',
        {},
        'client',
      ) as unknown as NodePath<t.JSXElement>;
      const children = jsxElementPath!.get('children');
      const optimized = optimizeChildNodes(children);

      expect(optimized.length).toBe(2);
      expect(getNodeText(optimized[0])).toBe('Text1');
      expect(optimized[1].isJSXElement()).toBe(true);
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

  describe('isComponentName', () => {
    it('should correctly identify if a tag is a component name', () => {
      expect(isComponentName('div')).toBe(false);
      expect(isComponentName('MyComponent')).toBe(true);
      expect(isComponentName('SomeLibrary.Component')).toBe(true);
      it("should return false for tags containing hyphens (unless it's a Web Component spec)", () => {
        expect(isComponentName('my-component')).toBe(false);
      });
      expect(isComponentName('_Component')).toBe(true);
      expect(isComponentName('$Component')).toBe(true);
    });
  });

  describe('getTagName', () => {
    it('should get correct tag name from JSXElement', () => {
      const code = '<div></div>';
      const jsxPath = getPath(
        code,
        'JSXElement',
        {},
        'client',
      ) as unknown as NodePath<t.JSXElement>;
      expect(getTagName(jsxPath!.node)).toBe('div');
    });

    it('should get correct tag name from JSXMemberExpression', () => {
      const code = '<MyNamespace.MyComponent></MyNamespace.MyComponent>';
      const jsxPath = getPath(
        code,
        'JSXElement',
        {},
        'client',
      ) as unknown as NodePath<t.JSXElement>;
      expect(getTagName(jsxPath!.node)).toBe('MyNamespace.MyComponent');
    });

    it('should get Fragment tag name from JSXFragment', () => {
      const code = '<></>';
      const jsxPath = getPath(
        code,
        'JSXFragment',
        {},
        'client',
      ) as unknown as NodePath<t.JSXFragment>;
      expect(getTagName(jsxPath!.node)).toBe('Fragment');
    });
  });

  describe('serializeAttributes', () => {
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
        checked: false, // false should be ignored
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
        t.stringLiteral('inactive'),
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
    it('should correctly identify TreeNode objects', () => {
      const validNode = createDefaultTree();
      validNode.type = NODE_TYPE.NORMAL;
      validNode.tag = 'div';
      validNode.children = [];
      validNode.index = 1;

      expect(isTreeNode(validNode)).toBe(true);
    });

    it('should reject objects missing key properties', () => {
      const invalidNode1 = { type: NODE_TYPE.NORMAL, tag: 'div', children: [] }; // Missing index
      const invalidNode2 = { type: NODE_TYPE.NORMAL, children: [], index: 1 }; // Missing tag
      const invalidNode3 = { tag: 'div', children: [], index: 1 }; // Missing type

      expect(isTreeNode(invalidNode1)).toBe(false);
      expect(isTreeNode(invalidNode2)).toBe(false);
      expect(isTreeNode(invalidNode3)).toBe(false);
    });

    it('should reject non-object types', () => {
      expect(isTreeNode(null)).toBe(false);
      expect(isTreeNode(undefined)).toBe(false);
      expect(isTreeNode('string')).toBe(false);
      expect(isTreeNode(123)).toBe(false);
      expect(isTreeNode(true)).toBe(false);
    });
  });

  describe('findBeforeIndex', () => {
    // Redesign test cases to better reflect actual tree structure and dynamic content logic
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
