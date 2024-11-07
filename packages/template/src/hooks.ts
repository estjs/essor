import { isSymbol } from '@estjs/shared';
import { LifecycleContext } from './lifecycleContext';

/**
 * Registers a hook to be called when the component is mounted.
 *
 * @remarks
 * This function can only be called in the component function body.
 * It cannot be used in asynchronous or deferred calls.
 * @param cb - The function to call when the component is mounted.
 */
export function onMount(cb: () => void): void {
  assertInsideComponent('onMounted');
  LifecycleContext.ref && LifecycleContext.ref.addHook('mounted', cb);
}

/**
 * Registers a hook to be called when the component is about to be unmounted.
 *
 * @remarks
 * This function can only be called in the component function body.
 * It cannot be used in asynchronous or deferred calls.
 * @param cb - The function to call when the component is about to be unmounted.
 */
export function onDestroy(cb: () => void): void {
  assertInsideComponent('onDestroy');
  LifecycleContext.ref && LifecycleContext.ref.addHook('destroy', cb);
}

function assertInsideComponent(hookName: string, key?: unknown) {
  if (!LifecycleContext.ref && __DEV__) {
    console.error(
      `"${hookName}"(key: ${isSymbol(key) ? key.toString() : key}) can only be called within the component function body
      and cannot be used in asynchronous or deferred calls.`,
    );
  }
}

// eslint-disable-next-line @typescript-eslint/no-wrapper-object-types, unused-imports/no-unused-vars
export interface InjectionKey<T> extends Symbol {}

/**
 * Provides a value to be used in the component tree.
 *
 * @remarks
 * This function can only be called in the component function body.
 * It cannot be used in asynchronous or deferred calls.
 * @param key - The key to store the value in the LifecycleContext with.
 * @param value - The value to store in the LifecycleContext with the given key.
 */
export function provide<T, K = InjectionKey<T> | string | number>(
  key: K,
  value: K extends InjectionKey<infer V> ? V : T,
): void {
  assertInsideComponent('provide', key);
  LifecycleContext.ref && LifecycleContext.ref.setContext(key as string, value);
}

/**
 * Injects a value from the current component LifecycleContext.
 *
 * @remarks
 * This function can only be called in the component function body.
 * It cannot be used in asynchronous or deferred calls.
 * @param key - The key to retrieve the value from the LifecycleContext with.
 * @param defaultValue - The default value to return if the key is not present
 * in the LifecycleContext.
 * @returns The value stored in the LifecycleContext with the given key, or the default
 * value if the key is not present in the LifecycleContext.
 */
export function inject<T, K = InjectionKey<T> | string | number>(
  key: K,
  defaultValue?: K extends InjectionKey<infer V> ? V : T,
): (K extends InjectionKey<infer V> ? V : T) | undefined {
  assertInsideComponent('inject', key);
  return (LifecycleContext.ref && LifecycleContext.ref.getContext(key as string)) ?? defaultValue;
}
