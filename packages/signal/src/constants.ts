/**
 * @file 本文件定义了整个响应式系统中使用的常量，包括状态标志、操作类型和内部标识。
 */

/**
 * 响应式状态标志枚举 (ReactiveFlags)。
 * 用于表示响应式节点的各种状态。
 * 性能优化设计：
 * 1. 使用位运算实现多状态组合，比多个布尔值更节省内存。
 * 2. 位运算操作通常比逻辑运算更快。
 * 3. 允许通过单个数值存储和高效地操作多个状态。
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

// 定义副作用的特定标志。
export enum EffectFlags {
  ALLOW_RECURSE = 1 << 7, // 允许递归调用
  PAUSED = 1 << 8, // 已暂停
  STOP = 1 << 10, // 已停止
}

/**
 * 内部标志，用于标记和识别不同类型的响应式对象。
 * 这些标志作为属性附加到对象上，以表明其响应式特性。
 */
export enum SignalFlags {
  /** 标记一个对象是响应式的 (reactive) */
  IS_REACTIVE = '_isReactive',

  /** 标记一个对象是只读的 */
  IS_READONLY = '_isReadonly',

  /** 标记一个对象是浅层响应的 (只有顶层属性是响应式的) */
  IS_SHALLOW = '_isShallow',

  /** 用于访问对象的原始 (非响应式) 版本 */
  RAW = '_raw',

  /** 标记一个对象是信号 (signal) */
  IS_SIGNAL = '_isSignal',

  /** 标记一个对象是计算属性 (computed) */
  IS_COMPUTED = '_isComputed',

  /** 标记一个对象是引用 (ref) */
  IS_REF = '_isRef',
}

/** 用于追踪信号 (signal) 值变化的 Symbol */
export const SignalKey = Symbol(__DEV__ ? 'SignalKey' : '');

/** 用于追踪数组操作变化的 Symbol */
export const ArrayKey = Symbol(__DEV__ ? 'ArrayKey' : '');

/** 用于追踪常规集合 (Map/Set) 操作变化的 Symbol */
export const CollectionKey = Symbol(__DEV__ ? 'CollectionKey' : '');

/** 用于追踪弱集合 (WeakMap/WeakSet) 操作变化的 Symbol */
export const WeakCollectionKey = Symbol(__DEV__ ? 'WeakCollectionKey' : '');

/** 用于追踪迭代操作的 Symbol */
export const IterateKey = Symbol(__DEV__ ? 'IterateKey' : '');

/** 用于追踪 Map 键迭代操作的 Symbol */
export const MapKeyIterateKey = Symbol(__DEV__ ? 'MapKeyIterateKey' : '');

/** 用于追踪计算属性 (computed) 依赖的 Symbol */
export const ComputedKey = Symbol(__DEV__ ? 'ComputedKey' : '');

/** 用于追踪数组迭代的唯一 Symbol */
export const ARRAY_ITERATE_KEY: unique symbol = Symbol(__DEV__ ? 'Array iterate' : '');

export type TrackingKey =
  | typeof SignalKey
  | typeof ArrayKey
  | typeof CollectionKey
  | typeof WeakCollectionKey
  | typeof IterateKey
  | typeof MapKeyIterateKey
  | typeof ComputedKey;
