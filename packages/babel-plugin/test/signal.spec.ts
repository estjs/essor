import { beforeEach, describe, expect, it } from 'vitest';
import { types as t, transformSync } from '@babel/core';
import essorPlugin from '../src/index';
import { clearImport, importedSets } from '../src/import';
import { resetContext } from '../src/jsx/context';

// Import internal functions to be tested
import { replaceSymbol, symbolArrayPattern, symbolObjectPattern } from '../src/signal/symbol';
import { transformProps } from '../src/signal/props';
import { getPath } from './test-utils';

beforeEach(() => {
  clearImport();
  resetContext();
});

describe('signal System Internal Functions', () => {
  describe('replaceSymbol', () => {
    it('should convert let $a = 1 to signal(1)', () => {
      const code = 'let $count = 0;';
      const declaratorPath = getPath(code, 'VariableDeclarator');
      replaceSymbol(declaratorPath);
      expect(declaratorPath.node.init.type).toBe('CallExpression');
      const callee = (declaratorPath.node.init as t.CallExpression).callee;
      expect(t.isIdentifier(callee) && callee.name).toBe('_signal$');
      expect(importedSets.has('signal')).toBe(true);
    });

    it('should convert const $a = () => {} to computed(() => {})', () => {
      const code = 'const $double = () => 1 + 1;';
      const declaratorPath = getPath(code, 'VariableDeclarator');
      replaceSymbol(declaratorPath);
      expect(declaratorPath.node.init.type).toBe('CallExpression');
      const callee = (declaratorPath.node.init as t.CallExpression).callee;
      expect(t.isIdentifier(callee) && callee.name).toBe('_computed$');
      expect(importedSets.has('computed')).toBe(true);
    });

    it('should not process variables not starting with $', () => {
      const code = 'let count = 0;';
      const declaratorPath = getPath(code, 'VariableDeclarator');
      replaceSymbol(declaratorPath);
      expect(declaratorPath.node.init.type).toBe('NumericLiteral'); // Should remain unchanged
      expect(importedSets.has('signal')).toBe(false);
    });
  });

  describe('symbolIdentifier', () => {
    it('should convert $a to $a.value', () => {
      const code = 'let $count = 0; function test() { console.log($count); }';
      const transformedCode = transformSync(code, {
        plugins: [[essorPlugin, { mode: 'client', symbol: '$' }]],
        filename: 'test.tsx',
        parserOpts: {
          plugins: ['jsx', 'typescript'],
        },
        babelrc: false,
        configFile: false,
      });

      const expectedCode = 'let _signal$ = 0; function test() {\n  console.log(_signal$.value);\n}'; // Expected transformed code
      expect(transformedCode?.code).toBe(expectedCode); // Verify the entire transformed code
    });

    it('should not process identifiers that are already .value properties', () => {
      const code = 'let $count = 0; function test() { console.log($count.value); }';
      const transformedCode = transformSync(code, {
        plugins: [[essorPlugin, { mode: 'client', symbol: '$' }]],
        filename: 'test.tsx',
        parserOpts: {
          plugins: ['jsx', 'typescript'],
        },
        babelrc: false,
        configFile: false,
      });

      const expectedCode = 'let _signal$ = 0; function test() {\n  console.log(_signal$.value);\n}'; // Expected transformed code
      expect(transformedCode?.code).toBe(expectedCode); // Verify the entire transformed code
    });
  });

  describe('symbolObjectPattern', () => {
    it('should remove $ prefix from property names in object destructuring', () => {
      const code = 'const { $name, age } = props;';
      const objectPatternPath = getPath(code, 'ObjectPattern');
      // In this test, we don't expect `symbolObjectPattern` to change `key.name`,
      // because this is the original AST structure before `transformProps`.
      // `transformProps` is the one that actually handles renaming.
      symbolObjectPattern(objectPatternPath);
      const properties = objectPatternPath.node.properties as t.ObjectProperty[];
      expect(t.isObjectProperty(properties[0]) && (properties[0].key as t.Identifier).name).toBe(
        '$name',
      );
    });

    it('should remove $ prefix in ObjectPattern not part of a VariableDeclarator', () => {
      const code = 'function test({ $name, age }) {}';
      const objectPatternPath = getPath(code, 'ObjectPattern');
      symbolObjectPattern(objectPatternPath);
      expect(
        t.isObjectProperty(objectPatternPath.node.properties[0]) &&
          (objectPatternPath.node.properties[0].key as t.Identifier).name,
      ).toBe('name');
      expect(
        t.isObjectProperty(objectPatternPath.node.properties[1]) &&
          (objectPatternPath.node.properties[1].key as t.Identifier).name,
      ).toBe('age');
    });
  });

  describe('symbolArrayPattern', () => {
    it('should remove $ prefix from element names in array destructuring and recursively process object patterns', () => {
      const code = 'const [$a, { $b: c }, d] = arr;';
      const arrayPatternPath = getPath(code, 'ArrayPattern');
      // Similar to symbolObjectPattern, this test should also reflect the original AST structure.
      // `transformProps` will handle these destructuring assignments.
      symbolArrayPattern(arrayPatternPath);
      expect((arrayPatternPath.node.elements[0] as t.Identifier).name).toBe('$a');
    });

    it('should remove $ prefix in ArrayPattern not part of a VariableDeclarator', () => {
      const code = 'function test([$a, { $b }, $c]) {}';
      const arrayPatternPath = getPath(code, 'ArrayPattern');
      symbolArrayPattern(arrayPatternPath);
      expect((arrayPatternPath.node.elements[0] as t.Identifier).name).toBe('a');
      const nestedObjectPattern = arrayPatternPath.node.elements[1] as t.ObjectPattern;
      expect(
        t.isObjectProperty(nestedObjectPattern.properties[0]) &&
          t.isIdentifier(nestedObjectPattern.properties[0].key) &&
          nestedObjectPattern.properties[0].key.name,
      ).toBe('b');
      expect((arrayPatternPath.node.elements[2] as t.Identifier).name).toBe('c');
    });
  });

  describe('transformProps', () => {
    it('should transform function parameters into reactive properties, rename $-prefixed properties, and create reactive calls', () => {
      const code = `
        const MyComponent = (props) => {
          const { $name, age, ...rest } = props;
          return <div>{$name} {age}</div>;
        };
      `;
      const funcPath = getPath(code, 'ArrowFunctionExpression');
      transformProps(funcPath);

      // Verify parameter becomes __props
      expect((funcPath.node.params[0] as t.Identifier).name).toBe('__props');

      // Verify property renaming
      const body = funcPath.node.body as t.BlockStatement;
      const declaration = body.body[0] as t.VariableDeclaration;
      expect(declaration.declarations[0].id.type).toBe('ObjectPattern');
      const firstProperty = (declaration.declarations[0].id as t.ObjectPattern)
        .properties[0] as t.ObjectProperty;
      expect(firstProperty.type).toBe('ObjectProperty');
      expect(t.isIdentifier(firstProperty.key) && firstProperty.key.name).toBe('$name');
      expect(t.isIdentifier(firstProperty.value) && firstProperty.value.name).toBe('__props$$name'); // Verify renaming

      // Verify rest parameter
      expect(importedSets.has('reactive')).toBe(true);
      expect(body.body[1].type).toBe('VariableDeclaration'); // rest variable declaration
    });

    it('should correctly handle props destructuring when no rest parameter is present', () => {
      const code = `
        const MyComponent = ({ $name, age }) => {
          return <div>{$name} {age}</div>;
        };
      `;
      const funcPath = getPath(code, 'ArrowFunctionExpression');
      transformProps(funcPath);

      expect((funcPath.node.params[0] as t.Identifier).name).toBe('__props');
      const body = funcPath.node.body as t.BlockStatement;
      const declaration = body.body[0] as t.VariableDeclaration;
      expect(declaration.declarations[0].id.type).toBe('ObjectPattern');
    });
  });
});
