import { transformProgram } from './program';
import { transformProps } from './signal/props';
import { transformJSX } from './jsx';
import {
  replaceSymbol,
  symbolArrayPattern,
  symbolIdentifier,
  symbolObjectPattern,
} from './signal/symbol';
import type { PluginObj } from '@babel/core';

export default function (): PluginObj {
  return {
    name: '@estjs/babel-plugin',
    manipulateOptions({ filename }, parserOpts) {
      if (filename.endsWith('.ts') || filename.endsWith('.tsx')) {
        parserOpts.plugins.push('typescript');
      }
      parserOpts.plugins.push('jsx');
    },

    visitor: {
      Program: transformProgram,

      FunctionDeclaration: transformProps,
      ArrowFunctionExpression: transformProps,

      VariableDeclarator: replaceSymbol,
      Identifier: symbolIdentifier,
      ObjectPattern: symbolObjectPattern,
      ArrayPattern: symbolArrayPattern,

      JSXElement: transformJSX,
      JSXFragment: transformJSX,
    },
  };
}
