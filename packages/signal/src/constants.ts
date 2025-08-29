export enum SignalFlags {
  /** Marks an object as reactive */
  IS_REACTIVE = '__e_isReactive',

  /** Marks an object as readonly */
  IS_READONLY = '__e_isReadonly',

  /** Marks an object as shallow reactive (only top-level properties are reactive) */
  IS_SHALLOW = '__e_isShallow',

  /** Used to access the raw (non-reactive) version of an object */
  RAW = '__e_raw',

  /** Marks an object as a signal */
  IS_SIGNAL = '__e_isSignal',

  /** Marks an object as a computed value */
  IS_COMPUTED = '__e_isComputed',

  /** Marks an object as a ref */
  IS_REF = '__e_isRef',
}

/** Used to track changes to signal values */
export const SignalKey = Symbol(__DEV__ ? 'SIGNAL_KEY' : '');

/** Used to track changes to array operations */
export const ArrayKey = Symbol(__DEV__ ? 'ARRAY_KEY' : '');

/** Used to track changes to regular collection operations (Map/Set) */
export const CollectionKey = Symbol(__DEV__ ? 'COLLECTION_KEY' : '');

/** Used to track changes to weak collection operations (WeakMap/WeakSet) */
export const WeakCollectionKey = Symbol(__DEV__ ? 'WEAK_COLLECTION_KEY' : '');

/** Used to track iteration operations */
export const IterateKey = Symbol(__DEV__ ? 'ITERATE_KEY' : '');

/** Used to track Map key iteration operations */
export const MapKeyIterateKey = Symbol(__DEV__ ? 'MAP_KEY_ITERATE_KEY' : '');

/** Used to track computed value dependencies */
export const ComputedKey = Symbol(__DEV__ ? 'COMPUTED_KEY' : '');

export type TrackingKey =
  | typeof SignalKey
  | typeof ArrayKey
  | typeof CollectionKey
  | typeof WeakCollectionKey
  | typeof IterateKey
  | typeof MapKeyIterateKey
  | typeof ComputedKey;

export type ReactiveFlags = keyof typeof SignalFlags;
