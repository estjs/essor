import { transformProgram } from './program';
import { transformProps } from './signals/props';
import { transformJSX } from './jsx';
import {
  replaceSymbol,
  symbolArrayPattern,
  symbolAssignment,
  symbolIdentifier,
  symbolObjectPattern,
  symbolUpdate,
} from './signals/symbol';
import type { PluginObj } from '@babel/core';

export default function (): PluginObj {
  return {
    name: 'babel-plugin-essor',

    manipulateOptions(_, parserOpts) {
      parserOpts.plugins.push('jsx');
    },

    visitor: {
      Program: transformProgram,
      // props
      FunctionDeclaration: transformProps,
      ArrowFunctionExpression: transformProps,
      // Symbol
      VariableDeclarator: replaceSymbol, // let $x = 0 → let $x = signal(0)
      Identifier: symbolIdentifier, // $x → $x.value
      AssignmentExpression: symbolAssignment, // $x = 1 → $x.value = 1
      UpdateExpression: symbolUpdate, // $x++ → $x.value++
      ObjectPattern: symbolObjectPattern, // { $x } → handle nested patterns
      ArrayPattern: symbolArrayPattern, // [$x] → handle nested patterns
      // JSX
      JSXElement: transformJSX,
      JSXFragment: transformJSX,
    },
  };
}
