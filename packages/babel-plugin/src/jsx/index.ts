import { RENDER_MODE } from '../constants';
import { resetContext, setContext } from './context';
import { transformJSXToClient } from './client';
import { transformJSXToSSG } from './ssg';
import { createTree } from './tree';
import type { JSXElement, RenderMode } from '../types';
import type { NodePath } from '@babel/core';

const transformStrategies = {
  [RENDER_MODE.CLIENT]: transformJSXToClient,
  [RENDER_MODE.SSR]: transformJSXToClient,
  [RENDER_MODE.SSG]: transformJSXToSSG,
} as const;

/**
 * Retrieves the appropriate transformation strategy for a given render mode.
 *
 * @param {RenderMode} mode - The target rendering mode
 * @returns {Function} The transformation function for the specified mode
 * @throws {Error} When an unsupported render mode is provided
 */
const getRenderingStrategy = (mode: RenderMode) => {
  const strategy = transformStrategies[mode];

  if (!strategy) {
    throw new Error(`Unsupported render mode: ${mode}`);
  }

  return strategy;
};
/**
 * Main JSX transformation function that converts JSX elements and fragments
 * into optimized runtime calls based on the configured render mode.
 *
 * @param {NodePath<JSXElement>} path - Babel AST path containing the JSX element
 * @throws {Error} When JSX transformation fails due to invalid syntax or unsupported features
 */
export function transformJSX(path: NodePath<JSXElement>): void {
  try {
    const mode = (path.state?.opts?.mode || RENDER_MODE.CLIENT) as RenderMode;

    // Get the appropriate transformation strategy for the render mode
    const strategy = getRenderingStrategy(mode);

    // Build a normalized tree representation of the JSX structure
    const tree = createTree(path);

    // Initialize transformation context with current state and path
    setContext({ state: path.state, path, operationIndex: 0 });

    // Apply the transformation strategy to generate optimized code
    const result = strategy(path, tree);

    // Replace the original JSX node with the transformed result
    path.replaceWith(result!);

    // Clean up transformation context to prevent memory leaks
    resetContext();
  } catch (error_) {
    // In test environment, log error but allow graceful continuation
    console.warn('JSX transformation failed in test:', { error_ });
    // Clean up context even on error
    resetContext();

    throw error_;
  }
}
