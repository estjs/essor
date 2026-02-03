import { describe, expect, it } from 'vitest';
import { parseExpression as babelParseExpression, parse } from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import {
  checkHasJSXReturn,
  isJSXNode,
  isMemberAccessingProperty,
  isValidPath,
  mightReturnJSX,
} from '../../src/signals/utils';

const parseExpression = (code: string) => babelParseExpression(code, { plugins: ['jsx'] });

describe('signals/utils', () => {
  describe('isValidPath', () => {
    it('returns true for valid path with node', () => {
      const path = { node: {} };
      // @ts-ignore
      expect(isValidPath(path)).toBe(true);
    });

    it('returns false for null/undefined path', () => {
      expect(isValidPath(null)).toBe(false);
      expect(isValidPath(undefined)).toBe(false);
    });

    it('returns false for path without node', () => {
      const path = {};
      // @ts-ignore
      expect(isValidPath(path)).toBe(false);
    });
  });

  describe('isJSXNode', () => {
    it('returns true for JSXElement', () => {
      const node = t.jsxElement(
        t.jsxOpeningElement(t.jsxIdentifier('div'), [], true),
        null,
        [],
        true,
      );
      expect(isJSXNode(node)).toBe(true);
    });

    it('returns true for JSXFragment', () => {
      const node = t.jsxFragment(t.jsxOpeningFragment(), t.jsxClosingFragment(), []);
      expect(isJSXNode(node)).toBe(true);
    });

    it('returns false for other nodes', () => {
      const node = t.identifier('foo');
      expect(isJSXNode(node)).toBe(false);
    });

    it('returns false for null/undefined', () => {
      expect(isJSXNode(null)).toBe(false);
      expect(isJSXNode(undefined)).toBe(false);
    });
  });

  describe('mightReturnJSX', () => {
    it('returns true for direct JSX', () => {
      const expr = parseExpression('<div />');
      expect(mightReturnJSX(expr)).toBe(true);
    });

    it('returns true for conditional expression returning JSX', () => {
      const expr = parseExpression('cond ? <div /> : null');
      expect(mightReturnJSX(expr)).toBe(true);
    });

    it('returns true for logical expression returning JSX', () => {
      const expr = parseExpression('cond && <div />');
      expect(mightReturnJSX(expr)).toBe(true);
    });

    it('returns true for sequence expression returning JSX', () => {
      const expr = parseExpression('(a, <div />)');
      expect(mightReturnJSX(expr)).toBe(true);
    });

    it('returns true for parenthesized expression returning JSX', () => {
      const expr = parseExpression('(<div />)');
      expect(mightReturnJSX(expr)).toBe(true);
    });

    it('returns false for non-JSX expressions', () => {
      expect(mightReturnJSX(parseExpression('1 + 2'))).toBe(false);
      expect(mightReturnJSX(parseExpression('call()'))).toBe(false);
      expect(mightReturnJSX(parseExpression('obj.prop'))).toBe(false);
    });
  });

  describe('checkHasJSXReturn', () => {
    const getFnPath = (code: string) => {
      const ast = parse(code, { sourceType: 'module', plugins: ['jsx'] });
      let fnPath: any = null;
      traverse(ast, {
        'FunctionDeclaration|FunctionExpression|ArrowFunctionExpression': path => {
          fnPath = path;
          path.stop();
        },
      });
      return fnPath;
    };

    it('returns true for function returning JSX directly', () => {
      const path = getFnPath('function App() { return <div />; }');
      expect(checkHasJSXReturn(path)).toBe(true);
    });

    it('returns true for arrow function returning JSX implicitly', () => {
      const path = getFnPath('const App = () => <div />;');
      expect(checkHasJSXReturn(path)).toBe(true);
    });

    it('returns true for function returning JSX in conditional', () => {
      const path = getFnPath('function App() { return cond ? <div /> : null; }');
      expect(checkHasJSXReturn(path)).toBe(true);
    });

    it('returns false for function returning string', () => {
      const path = getFnPath('function App() { return "hello"; }');
      expect(checkHasJSXReturn(path)).toBe(false);
    });

    it('returns false for function with no return', () => {
      const path = getFnPath('function App() { console.log("hi"); }');
      expect(checkHasJSXReturn(path)).toBe(false);
    });

    it('returns false for invalid path', () => {
      // @ts-ignore
      expect(checkHasJSXReturn(null)).toBe(false);
    });
  });

  describe('isMemberAccessingProperty', () => {
    it('returns true for identifier property match', () => {
      const node = parseExpression('obj.prop') as t.MemberExpression;
      expect(isMemberAccessingProperty(node, 'prop')).toBe(true);
    });

    it('returns true for string literal property match', () => {
      const node = parseExpression('obj["prop"]') as t.MemberExpression;
      expect(isMemberAccessingProperty(node, 'prop')).toBe(true);
    });

    it('returns false for identifier property mismatch', () => {
      const node = parseExpression('obj.other') as t.MemberExpression;
      expect(isMemberAccessingProperty(node, 'prop')).toBe(false);
    });

    it('returns false for string literal property mismatch', () => {
      const node = parseExpression('obj["other"]') as t.MemberExpression;
      expect(isMemberAccessingProperty(node, 'prop')).toBe(false);
    });

    it('returns false for computed property with non-string literal', () => {
      const node = parseExpression('obj[prop]') as t.MemberExpression;
      expect(isMemberAccessingProperty(node, 'prop')).toBe(false);
    });
  });
});
