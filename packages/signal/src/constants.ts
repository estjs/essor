/**
 * Internal flags used to mark and identify different types of reactive objects.
 * These flags are symbols that are attached to objects to indicate their reactive nature.
 *
 * @internal
 */
export enum SignalFlags {
  /** Marks an object as reactive */
  IS_REACTIVE = '__s_isReactive',

  /** Marks an object as readonly */
  IS_READONLY = '__s_isReadonly',

  /** Marks an object as shallow reactive (only top-level properties are reactive) */
  IS_SHALLOW = '__s_isShallow',

  /** Used to access the raw (non-reactive) version of an object */
  RAW = '__s_raw',

  /** Marks an object as a signal */
  IS_SIGNAL = '__s_isSignal',

  /** Marks an object as a computed value */
  IS_COMPUTED = '__s_isComputed',

  /** Marks an object as a ref */
  IS_REF = '__s_isRef',
}

/**
 * Symbol keys used for dependency tracking.
 * These symbols are used as unique identifiers for different types of reactive operations.
 * They help the system distinguish between different types of dependencies and track them appropriately.
 *
 * @internal
 */

/** Used to track changes to signal values */
export const SignalKey = Symbol(__DEV__ ? 'SignalKey' : '');

/** Used to track changes to array operations */
export const ArrayKey = Symbol(__DEV__ ? 'ArrayKey' : '');

/** Used to track changes to regular collection operations (Map/Set) */
export const CollectionKey = Symbol(__DEV__ ? 'CollectionKey' : '');

/** Used to track changes to weak collection operations (WeakMap/WeakSet) */
export const WeakCollectionKey = Symbol(__DEV__ ? 'WeakCollectionKey' : '');

/** Used to track iteration operations */
export const IterateKey = Symbol(__DEV__ ? 'IterateKey' : '');

/** Used to track Map key iteration operations */
export const MapKeyIterateKey = Symbol(__DEV__ ? 'MapKeyIterateKey' : '');

/** Used to track computed value dependencies */
export const ComputedKey = Symbol(__DEV__ ? 'ComputedKey' : '');

/**
 * Type representing any tracking key used in the reactivity system.
 * This is a union of all possible symbol keys that can be used for tracking.
 *
 * @internal
 */
export type TrackingKey =
  | typeof SignalKey
  | typeof ArrayKey
  | typeof CollectionKey
  | typeof WeakCollectionKey
  | typeof IterateKey
  | typeof MapKeyIterateKey
  | typeof ComputedKey;

/**
 * Type representing the possible values of reactive flags.
 * These are the string literals used as property keys to mark reactive objects.
 *
 * @internal
 */
export type ReactiveFlags = keyof typeof SignalFlags;
