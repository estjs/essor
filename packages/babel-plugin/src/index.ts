import { transformProgram } from './program';
import { replaceProps } from './transformers/props';
import { transformJSX } from './jsx';
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
      FunctionDeclaration: replaceProps,
      ArrowFunctionExpression: replaceProps,
      JSXElement: transformJSX,
      JSXFragment: transformJSX,
    },
  };
}
