import * as t from '@babel/types';
import { transformSync } from '@babel/core';
import {
  getAttrName,
  getTagName,
  hasSiblingElement,
  isComponent,
  isSymbolStart,
  isTextChild,
  jsxElementNameToString,
  setNodeText,
} from '../src/shared';

const getPathFromJSX = (code, visitor) => {
  transformSync(code, {
    plugins: [
      function () {
        return {
          manipulateOptions(_, parserOpts) {
            parserOpts.plugins.push('jsx');
          },
          visitor,
        };
      },
    ],
  });
};

describe('babel Utility Functions', () => {
  describe('hasSiblingElement', () => {
    it('should return true if there is a sibling JSXElement or JSXExpressionContainer', () => {
      const path = {
        getAllPrevSiblings: vitest.fn().mockReturnValue([]),
        getAllNextSiblings: vitest
          .fn()
          .mockReturnValue([{ isJSXElement: () => true, isJSXExpressionContainer: () => false }]),
      };

      expect(hasSiblingElement(path)).toBe(true);
    });

    it('should return false if there is no sibling JSXElement or JSXExpressionContainer', () => {
      const path = {
        getAllPrevSiblings: vitest.fn().mockReturnValue([]),
        getAllNextSiblings: vitest.fn().mockReturnValue([]),
      };

      expect(hasSiblingElement(path)).toBe(false);
    });
  });

  describe('getAttrName', () => {
    it('should return the name of the attribute if it is an identifier', () => {
      const attribute = t.jsxAttribute(t.jsxIdentifier('test'));

      expect(getAttrName(attribute)).toBe('test');
    });

    it('should return the namespace:name if it is a namespaced attribute', () => {
      const attribute = t.jsxAttribute(
        t.jsxNamespacedName(t.jsxIdentifier('namespace'), t.jsxIdentifier('name')),
      );

      expect(getAttrName(attribute)).toBe('namespace:name');
    });

    it('should throw an error for unsupported attribute types', () => {
      const attribute = { name: {} } as any;

      expect(() => getAttrName(attribute)).toThrow('Unsupported attribute type');
    });
  });

  describe('getTagName', () => {
    it('should return the tag name of a JSX element', () => {
      const node = t.jsxElement(
        t.jsxOpeningElement(t.jsxIdentifier('div'), [], true),
        null,
        [],
        true,
      );

      expect(getTagName(node)).toBe('div');
    });
  });

  describe('jsxElementNameToString', () => {
    it('should return the string representation of a JSXIdentifier', () => {
      const node = t.jsxIdentifier('MyComponent');

      expect(jsxElementNameToString(node)).toBe('MyComponent');
    });

    it('should return the string representation of a JSXMemberExpression', () => {
      const node = t.jsxMemberExpression(
        t.jsxIdentifier('SomeLibrary'),
        t.jsxIdentifier('Component'),
      );

      expect(jsxElementNameToString(node)).toBe('SomeLibrary.Component');
    });

    it('should return the string representation of a JSXNamespacedName', () => {
      const node = t.jsxNamespacedName(
        t.jsxIdentifier('namespace'),
        t.jsxIdentifier('ComponentName'),
      );

      expect(jsxElementNameToString(node)).toBe('namespace:ComponentName');
    });
  });

  describe('isComponent', () => {
    it('should return true for a component tag name', () => {
      expect(isComponent('MyComponent')).toBe(true);
      expect(isComponent('SomeLibrary.Component')).toBe(true);
      expect(isComponent('_component')).toBe(true);
    });

    it('should return false for a normal HTML tag name', () => {
      expect(isComponent('div')).toBe(false);
      expect(isComponent('span')).toBe(false);
    });
  });

  describe('isSymbolStart', () => {
    const path: any = {
      state: {
        opts: {
          symbol: '$',
        },
      },
    };
    it('should return true if the name starts with $', () => {
      expect(isSymbolStart(path, 'test')).toBe(false);
      expect(isSymbolStart(path, '$test')).toBe(true);
      expect(isSymbolStart(path, '$$test')).toBe(true);
    });
  });

  describe('isTextChild', () => {
    it('should return true for JSXText node', () => {
      getPathFromJSX('<div>text</div>', {
        JSXText(path) {
          expect(isTextChild(path)).toBe(true);
        },
      });
    });

    it('should return true for StringLiteral in JSXExpressionContainer', () => {
      getPathFromJSX('<div>{"text"}</div>', {
        JSXExpressionContainer(path) {
          expect(isTextChild(path)).toBe(true);
        },
      });
    });

    it('should return false for other node types', () => {
      getPathFromJSX('<div>{null}</div>', {
        JSXExpressionContainer(path) {
          expect(isTextChild(path)).toBe(false);
        },
      });
    });
  });

  describe('setNodeText', () => {
    it('should set text for JSXText node', () => {
      getPathFromJSX('<div>old text</div>', {
        JSXText(path) {
          setNodeText(path, 'new text');
          expect(path.node.value).toBe('new text');
        },
      });
    });

    it('should replace string literal in JSXExpressionContainer', () => {
      getPathFromJSX('<div>{"old text"}</div>', {
        JSXExpressionContainer(path) {
          setNodeText(path, 'new text');
          expect(path.get('expression').node.value).toBe('new text');
        },
      });
    });

    it('should do nothing for non-text nodes', () => {
      getPathFromJSX('<div>{null}</div>', {
        JSXExpressionContainer(path) {
          setNodeText(path, 'new text');
          // No assertions here, just making sure nothing breaks
        },
      });
    });
  });
});
