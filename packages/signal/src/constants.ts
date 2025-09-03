/**
 * @file This file defines constants used throughout the reactive system, including state flags, operation types, and internal identifiers.
 */

/**
 * Reactive state flags enumeration (ReactiveFlags).
 * Used to represent various states of reactive nodes.
 * Performance optimization design:
 * 1. Use bitwise operations to implement multi-state combinations, saving more memory than multiple boolean values.
 * 2. Bitwise operations are usually faster than logical operations.
 * 3. Allow storing and efficiently operating multiple states through a single numeric value.
 */
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

/**
 * Internal flags used to mark and identify different types of reactive objects.
 * These flags are attached to objects as properties to indicate their reactive characteristics.
 */
export enum SignalFlags {
  /** Mark an object as reactive */
  IS_REACTIVE = '_isReactive',

  /** Mark an object as read-only */
  IS_READONLY = '_isReadonly',

  /** Mark an object as shallow reactive (only top-level properties are reactive) */
  IS_SHALLOW = '_isShallow',

  /** Used to access the raw (non-reactive) version of an object */
  RAW = '_raw',

  /** Mark an object as a signal */
  IS_SIGNAL = '_isSignal',

  /** Mark an object as a computed property */
  IS_COMPUTED = '_isComputed',

  /** Mark an object as a ref */
  IS_REF = '_isRef',
}

/** Symbol used to track signal value changes */
export const SignalKey = Symbol(__DEV__ ? 'SignalKey' : '');

/** Symbol used to track array operation changes */
export const ArrayKey = Symbol(__DEV__ ? 'ArrayKey' : '');

/** Symbol used to track regular collection (Map/Set) operation changes */
export const CollectionKey = Symbol(__DEV__ ? 'CollectionKey' : '');

/** Symbol used to track weak collection (WeakMap/WeakSet) operation changes */
export const WeakCollectionKey = Symbol(__DEV__ ? 'WeakCollectionKey' : '');

/** Symbol used to track iteration operations */
export const IterateKey = Symbol(__DEV__ ? 'IterateKey' : '');

/** Symbol used to track Map key iteration operations */
export const MapKeyIterateKey = Symbol(__DEV__ ? 'MapKeyIterateKey' : '');

/** Symbol used to track computed property dependencies */
export const ComputedKey = Symbol(__DEV__ ? 'ComputedKey' : '');

/** Unique symbol used to track array iteration */
export const ARRAY_ITERATE_KEY: unique symbol = Symbol(__DEV__ ? 'Array iterate' : '');

export type TrackingKey =
  | typeof SignalKey
  | typeof ArrayKey
  | typeof CollectionKey
  | typeof WeakCollectionKey
  | typeof IterateKey
  | typeof MapKeyIterateKey
  | typeof ComputedKey;
