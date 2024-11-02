import babel from '@babel/core';
import { transformProgram } from '../src/program';
import {
  replaceSymbol,
  symbolArrayPattern,
  symbolIdentifier,
  symbolObjectPattern,
} from '../src/signal/symbol';
import { replaceImportDeclaration } from '../src/signal/import';
import { replaceProps } from '../src/signal/props';
import { transformJSX } from '../src/jsx';

const transforms = {
  jsxClient: {
    Program: transformProgram,
    JSXElement: transformJSX,
    JSXFragment: transformJSX,
  },
  jsxServe: {
    Program: transformProgram,
    JSXElement: transformJSX,
    JSXFragment: transformJSX,
  },

  symbol: {
    Program: transformProgram,
    VariableDeclarator: replaceSymbol,
    Identifier: symbolIdentifier,
    ObjectPattern: symbolObjectPattern,
    ArrayPattern: symbolArrayPattern,
    FunctionDeclaration: replaceProps,
  },
  props: {
    Program: transformProgram,
    FunctionDeclaration: replaceProps,
  },
  import: {
    Program: transformProgram,
    VariableDeclarator: replaceSymbol,
    ImportDeclaration: replaceImportDeclaration,
  },
};

export function getTransform(
  transformName: string | string[],
  opts: Record<string, any> = {},
): (code: string) => string {
  const transform = Array.isArray(transformName)
    ? transformName.reduce((obj, key) => {
        Object.assign(obj, transform[key]);
        return obj;
      }, {})
    : transforms[transformName];
  if (!transform) {
    throw new Error(`Unsupported transform: ${transformName}`);
  }

  const babelPlugin = {
    name: 'babel-plugin-essor',
    manipulateOptions({ filename }, parserOpts) {
      if (filename.endsWith('ts') || filename.endsWith('tsx')) {
        parserOpts.plugins.push('typescript');
      }
      parserOpts.plugins.push('jsx');
    },
    visitor: transform,
  };
  return code => {
    const result = babel.transformSync(code, {
      filename: 'test',
      sourceType: 'module',
      plugins: [[babelPlugin, opts]],
    });
    if (result?.code) {
      return result.code;
    }
    return code;
  };
}
