/**
 * Core Types - IR and Context definitions
 */
import type * as t from '@babel/types';

// ===== Compilation Mode =====
export type CompileMode = 'client' | 'server' | 'hydrate';

// ===== Plugin Options =====
export interface PluginOptions {
  mode?: CompileMode;
  enableOptimizations?: boolean;
  signalPrefix?: string;
  hmr?: boolean;
  omitClosingTags?: boolean;
}

// ===== IR Types =====
export type IRNode = IRElement | IRFragment | IRText | IRExpression;

export interface IRStaticProp {
  name: string;
  value: t.StringLiteral | t.NumericLiteral | t.BooleanLiteral | t.NullLiteral | t.Identifier;
  order: number;
  isOverridden?: boolean;
}

export interface IRDynamicProp {
  name: string;
  value: t.Expression;
  order: number;
  isOverridden?: boolean;
}

export interface IREvent {
  name: string;
  handler: t.Expression;
  order: number;
}

export interface IRRef {
  value: t.Expression;
  order: number;
}

export interface IRSpread {
  value: t.Expression;
  order: number;
}

export interface IRBind {
  name: string;
  value: t.Expression;
  order: number;
}

export interface IRProps {
  static: IRStaticProp[];
  dynamic: IRDynamicProp[];
  events: IREvent[];
  ref: IRRef | null;
  spreads: IRSpread[];
  binds: IRBind[];
}

export interface IRElement {
  type: 'element';
  tag: string;
  props: IRProps;
  children: IRNode[];
  isSVG: boolean;
  isComponent: boolean;
  isDynamic: boolean;
  /** Whole subtree is static (set by analyzeIR). */
  fullyStatic?: boolean;
  /** Should be hoisted to module scope (set by analyzeIR). */
  shouldHoist?: boolean;
  /**
   * Set for runtime builtins (For, and server-side ErrorBoundary/Suspense/...)
   * that are not shadowed by a local binding: the component is referenced via
   * this imported runtime name instead of the source identifier.
   */
  importName?: string;
}

export interface IRFragment {
  type: 'fragment';
  children: IRNode[];
}

export interface IRText {
  type: 'text';
  value: string;
  isStatic: true;
}

export interface IRExpression {
  type: 'expression';
  node: t.Expression;
  isSignal: boolean;
}

// ===== Compile Context =====
export interface CompileContext {
  filename: string;
  mode: CompileMode;
  options: PluginOptions;
  programPath: any;
  imports: ImportRegistry;
  templates: TemplateRegistry;
  uids: UIDGenerator;
  hoisted: Map<string, t.Identifier>;
  delegatedEvents?: Set<string>;
  declarations: DeclarationRegistry;
}

// ===== Declaration Registry =====
export interface DeclarationRegistry {
  add(decl: t.Statement): void;
  getAll(): t.Statement[];
}

// ===== Import Registry =====
export interface ImportRegistry {
  get(name: string): t.Identifier;
  has(name: string): boolean;
  getAll(): Map<string, t.Identifier>;
}

// ===== Template Registry =====
export interface TemplateRegistry {
  register(html: string, isSVG: boolean): t.Identifier;
  add(parts: string[]): string;
  getAll(): Array<{ id: t.Identifier; html: string; svg: boolean }>;
  getAllArrays(): Array<{ id: string; parts: string[] }>;
}

// ===== UID Generator =====
export interface UIDGenerator {
  generate(base: string): t.Identifier;
}
