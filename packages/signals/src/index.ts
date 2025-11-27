// ==================== Signal API ====================
export { signal, shallowSignal, isSignal, type Signal, type SignalValue } from './signal';

// ==================== Effect API ====================
export {
  effect,
  memoEffect,
  stop,
  isEffect,
  type EffectRunner,
  type EffectFunction,
  type EffectOptions,
  type EffectScheduler,
  type MemoEffectFn,
} from './effect';

// ==================== Computed API ====================
export {
  computed,
  isComputed,
  type Computed,
  type ComputedGetter,
  type ComputedSetter,
  type ComputedOptions,
} from './computed';

// ==================== Reactive API ====================
export {
  reactive,
  shallowReactive,
  isReactive,
  toRaw,
  isShallow,
  toReactive,
  type Reactive,
} from './reactive';

// ==================== Batch API ====================
export { batch, startBatch, endBatch, isBatching } from './batch';

// ==================== Scheduler API ====================
export {
  nextTick,
  queueJob,
  queuePreFlushCb,
  type Job,
  type PreFlushCallback,
  type FlushTiming,
} from './scheduler';

// ==================== Tracking & Debugging API ====================
export { untrack, type DebuggerEvent, type DebuggerEventType } from './link';

// ==================== Type Utilities ====================

/**
 * Unwrap a Signal, Computed, or Reactive type to get the underlying value type
 *
 * @template T - The wrapped type
 *
 * @example
 * ```typescript
 * import type { Signal, Computed, Reactive, Unwrap } from '@estjs/signals';
 *
 * type Count = Unwrap<Signal<number>>; // number
 * type User = Unwrap<Reactive<{ name: string }>>; // { name: string }
 * type Double = Unwrap<Computed<number>>; // number
 * ```
 */
export type Unwrap<T> = T extends import('./signal').Signal<infer V>
  ? V
  : T extends import('./computed').Computed<infer V>
    ? V
    : T extends import('./reactive').Reactive<infer V extends object>
      ? V
      : T;

/**
 * Make all properties of an object type reactive
 *
 * @template T - The object type
 *
 * @example
 * ```typescript
 * import type { DeepReactive } from '@estjs/signals';
 *
 * type State = DeepReactive<{ count: number; nested: { value: string } }>;
 * // All properties including nested ones are reactive
 * ```
 */
export type DeepReactive<T> = T extends object
  ? T extends infer O
    ? O extends object
      ? import('./reactive').Reactive<O>
      : O
    : never
  : T;

/**
 * Make only top-level properties of an object type reactive
 *
 * @template T - The object type
 *
 * @example
 * ```typescript
 * type State = ShallowReactive<{ count: number; nested: { value: string } }>;
 * // Only count is reactive, nested.value is not
 * ```
 */
export type ShallowReactive<T> = T extends object
  ? {
      [K in keyof T]: T[K];
    }
  : T;

/**
 * Extract the value type from a Signal
 *
 * @template T - The Signal type
 *
 * @example
 * ```typescript
 * import { signal, type SignalType } from '@estjs/signals';
 *
 * const count = signal(0);
 * type CountValue = SignalType<typeof count>; // number
 * ```
 */
export type SignalType<T> = T extends import('./signal').Signal<infer V> ? V : never;

/**
 * Extract the value type from a Computed
 *
 * @template T - The Computed type
 *
 * @example
 * ```typescript
 * import { computed, type ComputedType } from '@estjs/signals';
 *
 * const doubled = computed(() => count.value * 2);
 * type DoubledValue = ComputedType<typeof doubled>; // number
 * ```
 */
export type ComputedType<T> = T extends import('./computed').Computed<infer V> ? V : never;

export * from './store';
export * from './watch';

export { Ref, isRef, ref } from './ref';
