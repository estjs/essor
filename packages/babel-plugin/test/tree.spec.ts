import { beforeEach, describe, expect, it } from 'vitest';
import { types as t } from '@babel/core';
import { createDefaultTree } from '../src/jsx/tree';
import {
  findBeforeIndex,
  findIndexPosition,
  getTagName,
  isComponentName,
  isTreeNode,
  serializeAttributes,
} from '../src/jsx/utils';
import { NODE_TYPE } from '../src/jsx/constants';
import { resetContext } from '../src/jsx/context';
import { findNodePath, setupTestEnvironment, withTestContext } from './test-utils';

describe('jSX Tree Building and Utility Functions', () => {
  beforeEach(() => {
    setupTestEnvironment();
    withTestContext('const A = () => <div/>;', 'client', {}, () => {});
  });

  afterEach(() => {
    resetContext();
  });

  describe('isComponentName', () => {
    it('should correctly identify if a tag is a component name', () => {
      expect(isComponentName('div')).toBe(false);
      expect(isComponentName('MyComponent')).toBe(true);
      expect(isComponentName('SomeLibrary.Component')).toBe(true);
      expect(isComponentName('my-component')).toBe(false);
      expect(isComponentName('_Component')).toBe(true);
      expect(isComponentName('$Component')).toBe(true);
    });
  });

  describe('getTagName', () => {
    it('should get correct tag name from JSXElement', () => {
      const node = findNodePath<t.JSXElement, t.JSXElement>(
        '<div></div>',
        'JSXElement',
        path => path.node,
      );
      expect(node).not.toBeNull();
      expect(getTagName(node!)).toBe('div');
    });

    it('should get correct tag name from JSXMemberExpression', () => {
      const node = findNodePath<t.JSXElement, t.JSXElement>(
        '<MyNamespace.MyComponent></MyNamespace.MyComponent>',
        'JSXElement',
        path => path.node,
      );
      expect(node).not.toBeNull();
      expect(getTagName(node!)).toBe('MyNamespace.MyComponent');
    });

    it('should get Fragment tag name from JSXFragment', () => {
      const node = findNodePath<t.JSXFragment, t.JSXFragment>(
        '<></>',
        'JSXFragment',
        path => path.node,
      );
      expect(node).not.toBeNull();
      expect(getTagName(node!)).toBe('Fragment');
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
          checked: false, // false should be ignored
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
  });

  describe('findBeforeIndex and findIndexPosition', () => {
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

      it('should return null when a dynamic node is the last child of its parent', () => {
        const parentNode: any = {
          children: [
            { type: NODE_TYPE.NORMAL, index: 10, tag: 'div', isLastChild: false },
            { type: NODE_TYPE.EXPRESSION, index: 20, isLastChild: true },
          ],
        };
        expect(findBeforeIndex(parentNode.children[1], parentNode)).toBe(null);
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
    });
  });
});
