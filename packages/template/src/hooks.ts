import { isSymbol } from '@estjs/shared';
import { type Signal, shallowSignal } from '@estjs/signal';
import { HooksManager } from './render/hooks';

export function onMount(cb: () => void): void {
  assertInsideComponent('onMounted');
  HooksManager.ref?.addHook('mounted', cb);
}

export function onDestroy(cb: () => void): void {
  assertInsideComponent('onDestroy');
  HooksManager.ref?.addHook('destroy', cb);
}

function assertInsideComponent(hookName: string, key?: unknown) {
  if (!HooksManager.ref && __DEV__) {
    console.error(
      `"${hookName}"(key: ${isSymbol(key) ? key.toString() : key}) can only be called within the component function body
      and cannot be used in asynchronous or deferred calls.`,
    );
  }
}
// eslint-disable-next-line @typescript-eslint/no-wrapper-object-types, unused-imports/no-unused-vars
export interface InjectionKey<T> extends Symbol {}

export function useProvide<T, K = InjectionKey<T> | string | number>(
  key: K,
  value: K extends InjectionKey<infer V> ? V : T,
) {
  assertInsideComponent('useProvide', key);

  HooksManager.ref?.setContext(key as string, value);
}
export function useInject<T, K = InjectionKey<T> | string | number>(
  key: K,
  defaultValue?: K extends InjectionKey<infer V> ? V : T,
): (K extends InjectionKey<infer V> ? V : T) | undefined {
  assertInsideComponent('useInject', key);
  return HooksManager.ref?.getContext(key as string) || defaultValue;
}

/**
 * Creates a reactive ref that can be used to reference a DOM node
 * or a component instance within the component function body.
 *
 * @returns a reactive ref signal
 *
 * @example
 * const inputRef = useRef(')
 *
 * <input ref={inputRef} />
 *
 * inputRef.value // input element
 */
export function useRef<T>(): Signal<T | null> {
  const ref = shallowSignal<T | null>(null);
  return ref;
}
