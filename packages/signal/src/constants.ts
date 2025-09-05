/**
 * Reactive flags
 */
export enum ReactiveFlags {
  NONE = 0, // no state
  MUTABLE = 1, // mutable state,can be changed,link: computed
  WATCHING = 1 << 1, // watching state, is active effect
  RECURSED_CHECK = 1 << 2, // in recursive check process, check loop
  RECURSED = 1 << 3, // nark looped
  DIRTY = 1 << 4, // dirty state, need to be re-evaluated
  PENDING = 1 << 5, // pending state, need to be processed,check is dirty
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
