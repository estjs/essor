import type { Computed, Signal } from '@estjs/signals';
import type { Component } from './component';

export type AnyNode =
  | Node
  | Component<any>
  | Element
  | string
  | number
  | boolean
  | null
  | undefined
  | AnyNode[]
  | (() => AnyNode)
  | Signal<AnyNode>
  | Computed<AnyNode>;

export type ComponentProps = Record<string, unknown>;
export type ComponentFn<P = ComponentProps> = (props: P) => AnyNode;

/** A mounted application instance returned by createApp() and hydrate(). */
export interface AppInstance {
  /** The root Component wrapper (undefined if mounting produced raw nodes). */
  root: Component | undefined;
  /** Tear down the application: dispose scopes, remove DOM nodes. */
  unmount: () => void;
}
