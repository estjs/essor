import { RENDER_MODE } from '../constants';
import { transformJSX as clientTransform } from './client';
import { transformJSX as ssgTransform } from './ssg';
import type { JSXElement } from './types';
import type { NodePath } from '@babel/core';

/**
 * Transformation strategies corresponding to render modes
 */
const transformStrategies = {
  [RENDER_MODE.CLIENT]: clientTransform,
  [RENDER_MODE.SSG]: ssgTransform,
  [RENDER_MODE.SSR]: clientTransform,
};

/**
 * Main JSX transformation function
 * Entry point, responsible for delegating calls to the appropriate rendering strategy
 *
 * @param {NodePath<JSXElement>} path - JSX element path
 */
export function transformJSX(path: NodePath<JSXElement>): void {
  try {
    // Get render mode from options, default to client-side rendering
    const mode = (path.state?.opts?.mode || RENDER_MODE.CLIENT) as RENDER_MODE;

    // Get the corresponding transformation strategy
    const transformStrategy = transformStrategies[mode];

    if (!transformStrategy) {
      throw new Error(`Invalid render mode: ${mode}`);
    }

    // Apply core transformation using the selected strategy
    const result = transformStrategy(path);

    // Replace JSX element with transformation result
    if (result) {
      path.replaceWith(result);
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('JSX transformation failed:', errorMessage);
    throw error;
  }
}
