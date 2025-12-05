/**
 * Reactive node state flags
 */
export const enum ReactiveFlags {
  /** No state flags */
  NONE = 0,

  /**
   * Mutable flag - The node's value can change
   *
   * Signal and Computed are mutable, triggering propagation when their values change.
   * Immutable nodes (like constants) don't set this flag.
   */
  // eslint-disable-next-line unicorn/prefer-math-trunc
  MUTABLE = 1 << 0, // 0b00000001 = 1

  /**
   * Watching flag - The node is being watched by an Effect
   *
   * Set when an Effect depends on this node.
   * Used to determine whether to add the Effect to the execution queue.
   */
  WATCHING = 1 << 1, // 0b00000010 = 2

  /**
   * Recursion check flag - Currently checking for circular dependencies
   *
   * Set during the checkDirty process to detect and handle circular dependencies.
   * Prevents infinite recursion.
   */
  RECURSED_CHECK = 1 << 2, // 0b00000100 = 4

  /**
   * Recursed flag - Already in the recursion chain
   *
   * Marks that the node has already appeared in the current propagation path.
   * Used to handle complex dependency graph structures.
   */
  RECURSED = 1 << 3, // 0b00001000 = 8

  /**
   * Dirty flag - The node's value has changed but hasn't propagated yet
   *
   * Set when a Signal value changes.
   * Also set when Computed detects dependency changes.
   * Indicates need to recompute or notify subscribers.
   */
  DIRTY = 1 << 4, // 0b00010000 = 16

  /**
   * Pending flag - The node may need updating
   *
   * Set during propagation, indicating the node's dependencies may have become dirty.
   * Need to call checkDirty to confirm if update is actually needed.
   */
  PENDING = 1 << 5, // 0b00100000 = 32

  /**
   * Queued flag - Effect has been added to the execution queue
   *
   * Prevents the same Effect from being added to the queue multiple times.
   * This flag is cleared before queue execution.
   */
  QUEUED = 1 << 6, // 0b01000000 = 64
}

// Define specific flags for effects
export enum EffectFlags {
  ALLOW_RECURSE = 1 << 7, // Allow recursive calls
  PAUSED = 1 << 8, // Paused
  STOP = 1 << 10, // Stopped
}
// Define operation type constants
export const TriggerOpTypes = {
  SET: 'SET',
  ADD: 'ADD',
  DELETE: 'DELETE',
  CLEAR: 'CLEAR',
} as const;

/**
 * Internal flags used to mark and identify different types of reactive objects.
 * These flags are attached as properties to objects to indicate their reactive characteristics.
 */
export enum SignalFlags {
  /** Mark an object as reactive */
  IS_REACTIVE = '_IS_REACTIVE',

  /** Mark an object as readonly */
  IS_READONLY = '_IS_READONLY',

  /** Mark an object as shallow reactive (only top-level properties are reactive) */
  IS_SHALLOW = '_IS_SHALLOW',

  /** Used to access the raw (non-reactive) version of an object */
  RAW = '_RAW',

  /** Mark an object as a signal */
  IS_SIGNAL = '_IS_SIGNAL',

  /** Mark an object as a computed property */
  IS_COMPUTED = '_IS_COMPUTED',

  /** Mark an object as a ref */
  IS_REF = '_IS_REF',

  /** Mark an object as an effect */
  IS_EFFECT = '_IS_EFFECT',
}

/** Symbol used to track signal value changes */
export const SIGNAL_KEY: unique symbol = Symbol(__DEV__ ? 'Signal_Key' : '');

/** Symbol used to track array operation changes */
export const ARRAY_KEY: unique symbol = Symbol(__DEV__ ? 'Array_Key' : '');

/** Symbol used to track regular collection (Map/Set) operation changes */
export const COLLECTION_KEY: unique symbol = Symbol(__DEV__ ? 'Collection_Key' : '');

/** Symbol used to track weak collection (WeakMap/WeakSet) operation changes */
export const WEAK_COLLECTION_KEY: unique symbol = Symbol(__DEV__ ? 'WeakCollection_Key' : '');

/** Symbol used to track iteration operations */
export const ITERATE_KEY: unique symbol = Symbol(__DEV__ ? 'Iterate_Key' : '');

/** Symbol used to track Map key iteration operations */
export const MAP_KEY_ITERATE_KEY: unique symbol = Symbol(__DEV__ ? 'MapKeyIterate_Key' : '');

/** Symbol used to track computed property dependencies */
export const COMPUTED_KEY: unique symbol = Symbol(__DEV__ ? 'Computed_Key' : '');

/** Unique symbol used to track array iteration */
export const ARRAY_ITERATE_KEY: unique symbol = Symbol(__DEV__ ? 'Array_Iterate_Key' : '');

export type TRACKING_KEY =
  | typeof SIGNAL_KEY
  | typeof ARRAY_KEY
  | typeof COLLECTION_KEY
  | typeof WEAK_COLLECTION_KEY
  | typeof ITERATE_KEY
  | typeof MAP_KEY_ITERATE_KEY
  | typeof COMPUTED_KEY;
