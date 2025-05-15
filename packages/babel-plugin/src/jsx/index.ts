/**
 * @file JSX transformation factory and entry point
 * @description Handles JSX transformation based on different rendering strategies
 */

import { ClientTransformStrategy } from './client';
import { SSGTransformStrategy } from './ssg';
import { SSRTransformStrategy } from './ssr';
import type { NodePath } from '@babel/core';
import type { State } from '../types';
import type { JSXElement, TransformStrategy } from './types';

/**
 * Strategy factory that creates the appropriate transformation strategy
 * based on the rendering mode
 * @param state Babel state
 * @returns Transformation strategy instance
 */
export function createTransformStrategy(state: State): TransformStrategy {
  // Select the appropriate transformation strategy based on mode
  const mode = state.opts.mode || 'client';

  switch (mode) {
    case 'client':
      return new ClientTransformStrategy(state);
    case 'ssg':
      return new SSGTransformStrategy(state);
    case 'ssr':
      return new SSRTransformStrategy(state);
    default:
      throw new Error(`Invalid rendering mode: ${mode}`);
  }
}

/**
 * Transform JSX elements based on server rendering strategy
 * @param path JSX element path
 * @throws {Error} If mode type is invalid or transformation fails
 */
export function transformJSX(path: NodePath<JSXElement>): void {
  try {
    // Get Babel state from path
    const state = path.state as State;

    // Create the appropriate strategy based on rendering mode
    const strategy = createTransformStrategy(state);

    // Apply the transformation
    strategy.transform(path);
  } catch (error) {
    console.error('JSX transformation failed:', error);
    throw error;
  }
}
