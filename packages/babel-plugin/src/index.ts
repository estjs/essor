import { transformJSX } from './jsx';
import { transformProgram } from './program';
import {
  replaceSymbol,
  symbolArrayPattern,
  symbolIdentifier,
  symbolObjectPattern,
} from './signal/symbol';
import { replaceImportDeclaration } from './signal/import';
import { replaceProps } from './signal/props';
import type { PluginObj } from '@babel/core';
export { Options, State } from './types';
export default function (): PluginObj {
  return {
    name: 'babel-plugin-aube',
    manipulateOptions({ filename }, parserOpts) {
      if (filename.endsWith('.ts') || filename.endsWith('.tsx')) {
        parserOpts.plugins.push('typescript');
      }
      parserOpts.plugins.push('jsx');
    },
    visitor: {
      Program: transformProgram,

      FunctionDeclaration: replaceProps,
      ArrowFunctionExpression: replaceProps,
      VariableDeclarator: replaceSymbol,
      ImportDeclaration: replaceImportDeclaration,
      Identifier: symbolIdentifier,
      ObjectPattern: symbolObjectPattern,
      ArrayPattern: symbolArrayPattern,

      JSXElement: transformJSX,
      JSXFragment: transformJSX,
    },
  };
}
