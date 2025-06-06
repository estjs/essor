import type { USED_IMPORTS } from './constants';
import type { types as t } from '@babel/core';

export interface Options {
  mode: 'client' | 'ssr' | 'ssg';
  symbol?: string;
  props?: boolean;
  /**
   * Whether to enable hot module replacement functionality
   * @default true Enabled by default in client mode, this configuration is ignored in ssr and ssg modes
   */
  hmr?: boolean;
}

export type JSXElement = t.JSXElement | t.JSXFragment;

export type JSXChild =
  | t.JSXElement
  | t.JSXFragment
  | t.JSXExpressionContainer
  | t.JSXSpreadChild
  | t.JSXText;

export type ImportsNames = (typeof USED_IMPORTS)[number];

/**
 * Program state
 */
export interface State {
  /**
   * Configuration options
   */
  opts: Options;

  /**
   * Import declaration mapping
   */
  imports: Record<string, t.Identifier>;

  /**
   * Template declaration
   */
  templateDeclaration: t.VariableDeclaration;
}
