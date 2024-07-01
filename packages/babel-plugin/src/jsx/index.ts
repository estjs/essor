import { transformJSXService } from './server';
import { transformJSXClient } from './client';
import type { NodePath, types as t } from '@babel/core';
import type { State } from '../types';
type JSXElement = t.JSXElement | t.JSXFragment;
export function transformJSX(path: NodePath<JSXElement>) {
  const state: State = path.state;
  const isSsg = state.opts.ssg;
  return isSsg ? transformJSXService(path) : transformJSXClient(path);
}
