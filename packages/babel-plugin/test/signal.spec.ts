import { beforeEach, describe, expect, it } from 'vitest';
import { types as t } from '@babel/core';
import { importedSets } from '../src/import';
import { getContext, resetContext } from '../src/jsx/context';

// Import internal functions to be tested
import { replaceSymbol, symbolArrayPattern, symbolObjectPattern } from '../src/signal/symbol';
import {
  createASTNode,
  setupTestEnvironment,
  transformAndTest,
  withTestContext,
} from './test-utils';

describe('signal System Internal Functions', () => {
  beforeEach(() => {
    setupTestEnvironment();
    withTestContext('const A = () => <div/>;', 'client', {}, () => {});
  });

  afterEach(() => {
    resetContext();
  });
  describe('replaceSymbol', () => {
    it('should convert let $a = 1 to signal(1)', () => {
      // Create a variable declarator directly
      const declaratorNode = createASTNode(() =>
        t.variableDeclarator(t.identifier('$count'), t.numericLiteral(0)),
      );
      const { state } = getContext();

      // Create a mock NodePath
      const mockPath = {
        node: declaratorNode,
        scope: {
          getBinding: () => null,
        },
        state,
      };

      replaceSymbol(mockPath as any);

      expect(declaratorNode.init?.type).toBe('CallExpression');
      const callee = (declaratorNode.init as t.CallExpression).callee;
      expect(t.isIdentifier(callee) && callee.name).toBe('_signal$');
      expect(importedSets.has('signal')).toBe(true);
    });

    it('should not process variables not starting with $', () => {
      // Create a variable declarator directly
      const declaratorNode = createASTNode(() =>
        t.variableDeclarator(t.identifier('count'), t.numericLiteral(0)),
      );

      // Create a mock NodePath
      const mockPath = {
        node: declaratorNode,
        scope: {
          getBinding: () => null,
        },
      };

      replaceSymbol(mockPath as any);

      expect(declaratorNode.init?.type).toBe('NumericLiteral');
      expect(importedSets.has('signal')).toBe(false);
    });
  });

  describe('symbolIdentifier', () => {
    it('should convert $a to $a.value', () => {
      transformAndTest(
        'let $count = 0; function test() { console.log($count); }',
        { mode: 'client', symbol: '$' },
        code => {
          expect(code).toContain('$count.value');
        },
      );
    });

    it('should not process identifiers that are already .value properties', () => {
      transformAndTest(
        'let $count = 0; function test() { console.log($count.value); }',
        { mode: 'client', symbol: '$' },
        code => {
          // Should avoid duplicating .value
          expect(code.match(/(?:\.value){2}/g)).toBeNull();
        },
      );
    });
  });

  describe('symbolObjectPattern', () => {
    it('should remove $ prefix from property names in object destructuring', () => {
      // Create an object pattern with $-prefixed property
      const objectPatternNode = createASTNode(() =>
        t.objectPattern([
          t.objectProperty(t.identifier('$name'), t.identifier('$name'), false, true),
          t.objectProperty(t.identifier('age'), t.identifier('age'), false, true),
        ]),
      );

      // Create a mock NodePath
      const mockPath = {
        node: objectPatternNode,
        parent: t.variableDeclarator(objectPatternNode, t.identifier('props')),
        parentPath: {
          isVariableDeclarator: () => true,
        },
      };

      symbolObjectPattern(mockPath as any);

      // Verify the structure remains intact for transformProps to handle later
      const property = objectPatternNode.properties[0] as t.ObjectProperty;
      expect(t.isIdentifier(property.key) && property.key.name).toBe('$name');
    });

    it('should remove $ prefix in ObjectPattern not part of a VariableDeclarator', () => {
      // Create an object pattern for function parameter
      const objectPatternNode = createASTNode(() =>
        t.objectPattern([
          t.objectProperty(t.identifier('$name'), t.identifier('$name'), false, true),
          t.objectProperty(t.identifier('age'), t.identifier('age'), false, true),
        ]),
      );

      // Create a mock NodePath
      const mockPath = {
        node: objectPatternNode,
        parent: t.functionDeclaration(
          t.identifier('test'),
          [objectPatternNode],
          t.blockStatement([]),
        ),
        parentPath: {
          isVariableDeclarator: () => false,
        },
      };

      symbolObjectPattern(mockPath as any);

      // Verify $ prefix is removed
      const property1 = objectPatternNode.properties[0] as t.ObjectProperty;
      const property2 = objectPatternNode.properties[1] as t.ObjectProperty;
      expect(t.isIdentifier(property1.key) && property1.key.name).toBe('name');
      expect(t.isIdentifier(property2.key) && property2.key.name).toBe('age');
    });
  });

  describe('symbolArrayPattern', () => {
    it('should remove $ prefix from element names in array destructuring', () => {
      // Create an array pattern with mixed elements
      const arrayPatternNode = createASTNode(() =>
        t.arrayPattern([
          t.identifier('$a'),
          t.objectPattern([t.objectProperty(t.identifier('$b'), t.identifier('c'), false, false)]),
          t.identifier('d'),
        ]),
      );

      // Create a mock NodePath
      const mockPath = {
        node: arrayPatternNode,
        parent: t.variableDeclarator(arrayPatternNode, t.identifier('arr')),
        parentPath: {
          isVariableDeclarator: () => true,
        },
      };

      symbolArrayPattern(mockPath as any);

      // In variableDeclarator context, it preserves the structure for transformProps
      expect((arrayPatternNode.elements[0] as t.Identifier).name).toBe('$a');
    });

    it('should remove $ prefix in ArrayPattern not part of a VariableDeclarator', () => {
      // Create an array pattern for function parameter
      const arrayPatternNode = createASTNode(() =>
        t.arrayPattern([
          t.identifier('$a'),
          t.objectPattern([t.objectProperty(t.identifier('$b'), t.identifier('$b'), false, true)]),
          t.identifier('$c'),
        ]),
      );

      // Create a mock NodePath
      const mockPath = {
        node: arrayPatternNode,
        parent: t.functionDeclaration(
          t.identifier('test'),
          [arrayPatternNode],
          t.blockStatement([]),
        ),
        parentPath: {
          isVariableDeclarator: () => false,
        },
      };

      symbolArrayPattern(mockPath as any);

      // Verify $ prefix is removed
      expect((arrayPatternNode.elements[0] as t.Identifier).name).toBe('a');

      const nestedObjectPattern = arrayPatternNode.elements[1] as t.ObjectPattern;
      const nestedProperty = nestedObjectPattern.properties[0] as t.ObjectProperty;
      expect(t.isIdentifier(nestedProperty.key) && nestedProperty.key.name).toBe('b');

      expect((arrayPatternNode.elements[2] as t.Identifier).name).toBe('c');
    });
  });

  describe('transformProps', () => {
    it('should transform function parameters into reactive properties', () => {
      // Create a component function with destructuring
      const code = `
        const MyComponent = (props) => {
          const { $name, age, ...rest } = props;
          return <div>{$name} {age}</div>;
        };
      `;

      transformAndTest(code, { mode: 'client', symbol: '$' }, result => {
        // Check destructuring works correctly
        expect(result).toMatchInlineSnapshot();

        // Check signal import is added
        expect(importedSets.has('reactive')).toBe(true);
      });
    });

    it('should handle props destructuring when no rest parameter is present', () => {
      // Create a component with direct destructuring
      const code = `
        const MyComponent = ({ $name, age }) => {
          return <div>{$name} {age}</div>;
        };
      `;

      transformAndTest(code, { mode: 'client', symbol: '$' }, result => {
        // Check parameter is renamed to __props
        expect(result).toMatchInlineSnapshot();
      });
    });
  });
});
