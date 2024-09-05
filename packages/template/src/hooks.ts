import { isSymbol } from '@estjs/shared';
import { Hooks } from './component-node';

export function onMount(cb: () => void): void {
  throwIfOutsideComponent('onMounted');
  Hooks.ref?.addHook('mounted', cb);
}

export function onDestroy(cb: () => void): void {
  throwIfOutsideComponent('onDestroy');
  Hooks.ref?.addHook('destroy', cb);
}

function throwIfOutsideComponent(hook: string, key?: unknown) {
  if (!Hooks.ref) {
    console.error(
      `"${hook}"(key: ${isSymbol(key) ? key.toString() : key}) can only be called within the component function body
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
  throwIfOutsideComponent('useProvide', key);

  Hooks.ref?.setContext(key as string, value);
}
export function useInject<T, K = InjectionKey<T> | string | number>(
  key: K,
  defaultValue?: K extends InjectionKey<infer V> ? V : T,
): (K extends InjectionKey<infer V> ? V : T) | undefined {
  throwIfOutsideComponent('useInject', key);
  return Hooks.ref?.getContext(key as string) || defaultValue;
}

// export function useProps(props) {
//   const propsValue = props;
//   const propsAction = () => {};
//   const propsRef = () => {};
//   const propsChild = () => {};
// }
