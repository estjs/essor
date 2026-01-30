/**
 * Common Type Definitions
 * Shared types across the Babel plugin
 */

import type { types as t } from '@babel/core';

/**
 * Rendering mode options
 */
export type RenderMode = 'client' | 'ssr' | 'ssg';

/**
 * Reactive system identifier
 */
export type ReactiveSymbol = string;

export type Primitive = string | number | bigint | boolean | symbol | null | undefined;

/**
 * JSX element types
 */
export type JSXElement = t.JSXElement | t.JSXFragment;

/**
 * JSX child node types
 */
export type JSXChild =
  | t.JSXElement
  | t.JSXFragment
  | t.JSXExpressionContainer
  | t.JSXSpreadChild
  | t.JSXText;

/**
 * Plugin configuration options
 */
export interface PluginOptions {
  /**
   * Rendering mode: client | ssr | ssg
   * @default client
   */
  mode: RenderMode;

  /**
   * Reactive system identifier
   * @default $
   */
  symbol?: ReactiveSymbol;

  /**
   * Whether to automatically handle props destructuring
   * @default true
   */
  props?: boolean;

  /**
   * Whether to enable hot module replacement functionality
   * @default true Enabled by default in client mode, this configuration is ignored in ssr and ssg modes
   */
  hmr?: boolean;

  /**
   * Whether to enable styled-jsx support
   * @default false
   */
  styled?: boolean;
}

/**
 * HMR component information
 */
export interface HMRComponentInfo {
  name: string;
  hmrId: string;
  line: number;
  file: string;
  location: string;
  styleId?: string;
}

/**
 * Styled component information
 */
export interface StyledComponentInfo {
  name: string; // Variable name, e.g. StyledButton
  styleId: string; // Style ID, e.g. 'btn-123'
  baseComponent: string; // Base component name, e.g. BaseButton
  css: string; // CSS content
  line: number; // Line number
}

/**
 * Plugin state during transformation
 */
export interface PluginState {
  /**
   * Configuration options
   */
  opts: PluginOptions;

  /**
   * HMR component information list (for passing to unplugin)
   */
  hmrComponents?: HMRComponentInfo[];

  /**
   * Import declaration mapping
   */
  imports: Record<string, t.Identifier>;

  /**
   * Template declaration
   */
  declarations: t.VariableDeclarator[];

  /**
   * Delegated events declaration
   */
  events?: Set<string>;

  /**
   * Current filename for HMR
   */
  filename?: string;

  /**
   * HMR metadata collected during transformation
   */
  hmr?: HMRTransformState;

  registryCall?: t.Identifier;

  /**
   * Babel transformation metadata
   * Used to pass data to unplugin
   */
  metadata?: {
    hmrComponents?: HMRComponentInfo[];
    styledComponents?: StyledComponentInfo[];
    [key: string]: any;
  };
}

export interface HMRComponentMeta {
  localName: string;
  exportNames: string[];
  id: string;
  displayName: string;
}

export interface HMRTransformState {
  moduleId: string;
  filePath: string;
  components: HMRComponentMeta[];
}
