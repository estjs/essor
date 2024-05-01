import { transformJSXService } from './server';
import { transformJSXClient } from './client';
import type { NodePath, types as t } from '@babel/core';
import type { State } from '../types';
type JSXElement = t.JSXElement | t.JSXFragment;
export function transformJSX(path: NodePath<JSXElement>) {
  const state: State = path.state;
  const isSsr = state.opts.ssr;
  return isSsr ? transformJSXService(path) : transformJSXClient(path);
}
