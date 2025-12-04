import babel from '@babel/core';
import { transformProgram } from '../../src/program';
import { transformProps } from '../../src/signals/props';
import {
  replaceSymbol,
  symbolArrayPattern,
  symbolIdentifier,
  symbolObjectPattern,
} from '../../src/signals/symbol';
import { transformJSX } from '../../src/jsx';
const transforms = {
  jsx: {
    Program: transformProgram,
    JSXElement: transformJSX,
    JSXFragment: transformJSX,
  },

  props: {
    Program: transformProgram,
    FunctionDeclaration: transformProps,
    FunctionExpression: transformProps,
    ArrowFunctionExpression: transformProps,
  },
  symbol: {
    Program: transformProgram,
    VariableDeclarator: replaceSymbol,
    Identifier: symbolIdentifier,
    ObjectPattern: symbolObjectPattern,
    ArrayPattern: symbolArrayPattern,
    FunctionDeclaration: transformProps,
  },
};

export function getTransform(
  transformName: string | string[],
  opts: Record<string, any> = {},
): (code: string) => string {
  const transform = Array.isArray(transformName)
    ? transformName.reduce((obj, key) => {
      Object.assign(obj, transforms[key]);
      return obj;
    }, {})
    : transforms[transformName];
  if (!transform) {
    throw new Error(`Unsupported transform: ${transformName}`);
  }

  const babelPlugin = {
    name: 'babel-plugin-essor',
    manipulateOptions({ filename }, parserOpts) {
      if (filename.endsWith('.ts') || filename.endsWith('.tsx')) {
        parserOpts.plugins.push('typescript');
      }
      parserOpts.plugins.push('jsx');
    },
    visitor: transform,
  };
  return code => {
    const result = babel.transformSync(code, {
      filename: 'test.jsx',
      sourceType: 'module',
      plugins: [[babelPlugin, opts]],
    });
    if (result?.code) {
      return result.code;
    }
    return code;
  };
}
