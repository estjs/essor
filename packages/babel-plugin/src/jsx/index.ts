import { getCompileContext } from '../context';
import { RENDER_MODE } from '../options';
import { buildIR } from './ir';
import { generateServer } from './server';
import { generateClient } from './client';
import type { NodePath, types as t } from '@babel/core';
import type { IRNode } from './ir';
import type { CompileContext } from '../context';
import type { RenderMode } from '../options';

type TransformFn = (ir: IRNode, ctx: CompileContext) => t.Expression;

const transformStrategies: Record<RenderMode, TransformFn> = {
  [RENDER_MODE.CLIENT]: generateClient,
  [RENDER_MODE.SERVER]: generateServer,
  [RENDER_MODE.HYDRATE]: generateClient,
};

/**
 * Transforms JSX.
 */
function transformJSX(jsxPath: NodePath<t.JSXElement | t.JSXFragment>): void {
  const ctx = getCompileContext();
  const ir = buildIR(jsxPath, ctx);
  const result = transformStrategies[ctx.options.mode as RenderMode](ir, ctx);
  jsxPath.replaceWith(result);
}

/**
 * Compiles JSX program.
 */
export function compileJSXProgram(path: NodePath<t.Program>): void {
  path.traverse({
    JSXElement: (jsxPath: NodePath<t.JSXElement>) => {
      transformJSX(jsxPath);
    },
    JSXFragment: (jsxPath: NodePath<t.JSXFragment>) => {
      transformJSX(jsxPath);
    },
  });
}
