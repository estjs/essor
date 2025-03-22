/**
 * @file JSX transformation module
 * @description Handles JSX transformation based on different rendering strategies
 * @module jsx-transformer
 */

import { transformJSX as transformClient } from './client';
import { transformJSX as transformSSR } from './ssr';
import { transformJSX as transformSSG } from './ssg';
import type { NodePath } from '@babel/core';
import type { JSXElement } from '../types';

/**
 * Available transformation strategies for different rendering modes
 */
const transformStrategies = {
  client: transformClient,
  ssr: transformSSR,
  ssg: transformSSG,
};

/**
 * Transform JSX elements based on server rendering strategy
 * @description Applies the appropriate transformation based on the server rendering mode
 * @param path - The path to the JSX element
 * @throws {Error} If mode type is invalid or transformation fails
 */
export function transformJSX(path: NodePath<JSXElement>): void {
  try {
    // Get rendering mode from options
    const mode = path.state?.opts?.mode || 'client';

    // Apply the corresponding transformation strategy
    const transform = transformStrategies[mode];

    if (!transform) {
      throw new Error(`Invalid rendering mode: ${mode}`);
    }

    transform(path);
  } catch (error) {
    console.error('JSX transformation failed:', error);
    throw error;
  }
}
