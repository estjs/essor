/**
 * Code generation entry: dispatches IR to the mode-specific generator.
 */
import { generateClient } from './client';
import { generateServer } from './server';
import type * as t from '@babel/types';
import type { CompileContext } from '../core/context';
import type { IRNode } from '../core/types';

export function generateCode(ir: IRNode, ctx: CompileContext): t.Expression {
  return ctx.mode === 'server' ? generateServer(ir, ctx) : generateClient(ir, ctx);
}
