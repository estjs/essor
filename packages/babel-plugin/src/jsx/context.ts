import type { JSXElement, TemplateInfo } from './types';
import type { NodePath } from '@babel/core';
import type { State } from '../types';

/**
 * Transform Context Interface
 * @description Describes shared context data during the transformation process
 */
export interface TransformContext {
  /** State object */
  state: State;
  /** Node path */
  path: NodePath<JSXElement>;
}

let activeContext: TransformContext | null = null;

/**
 * Get current transform context
 * @returns {TransformContext} Current context object
 */
export function getContext(): TransformContext {
  return activeContext!;
}

/**
 * Set transform context
 * @param {Partial<TransformContext>} context - The context to update
 */
export function setContext(context: TransformContext): void {
  activeContext = context;
}

/**
 * Reset transform context
 * @description Resets the context to its initial state
 */
export function resetContext(): void {
  activeContext = null;
}

// template maps
export let templateMaps: TemplateInfo[] = [];

export function hasTemplateMaps(str: string | Array<string>) {
  return templateMaps.find(item => item.template === str);
}

export function addTemplateMaps(str: TemplateInfo) {
  templateMaps.push(str);
}

export function clearTemplateMaps() {
  templateMaps = [];
}

export function getTemplateMaps() {
  return templateMaps;
}
