import { transformProgram } from './program';
import { transformProps } from './signals/props';
import { transformJSX } from './jsx';
import type { PluginObj } from '@babel/core';

export default function (): PluginObj {
  return {
    name: 'babel-plugin-essor',

    manipulateOptions(_, parserOpts) {
      parserOpts.plugins.push('jsx');
      parserOpts.plugins.push('typescript');
    },

    visitor: {
      Program: transformProgram,
      // props
      FunctionDeclaration: transformProps,
      ArrowFunctionExpression: transformProps,
      // JSX
      JSXElement: transformJSX,
      JSXFragment: transformJSX,
    },
  };
}
