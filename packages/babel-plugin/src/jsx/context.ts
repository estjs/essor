import type { NodePath } from '@babel/core';
import type { JSXElement, PluginState } from '../types';

/**
 * Transform Context Interface
 * @description Describes shared context data during the transformation process
 */
export interface TransformContext {
  /// State object
  state: PluginState;
  // Node path
  path: NodePath<JSXElement>;
  // Index to track operations
  operationIndex: number;
}

const contextStack: TransformContext[] = [];
/**
 * Get current transform context
 * @returns {TransformContext} Current context object
 */
export function getContext(): TransformContext {
  if (!contextStack.length) {
    throw new Error('No active context found. Ensure setContext has been called.');
  }
  return contextStack[contextStack.length - 1];
}

/**
 * Set transform context
 * @param {Partial<TransformContext>} context - The context to update
 */
export function setContext(context: TransformContext): void {
  contextStack.push(context);
}

/**
 * Reset transform context
 * @description Resets the context to its initial state
 */
export function resetContext(): void {
  contextStack.pop();
}
