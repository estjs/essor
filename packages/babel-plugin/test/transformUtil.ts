import babel from '@babel/core';
import { transformProgram } from '../src/program';
import { transformJSX } from '../src/jsx';
import { replaceProps } from '../src/transformers/props';

const transforms = {
  jsx: {
    Program: transformProgram,
    JSXElement: transformJSX,
    JSXFragment: transformJSX,
  },

  props: {
    Program: transformProgram,
    FunctionDeclaration: replaceProps,
    ArrowFunctionExpression: replaceProps,
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
    name: '@estjs/babel-plugin',
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
