import { ComponentNode } from './component-node';

export function onMount(cb: () => void): void {
  throwIfOutsideComponent('onMounted');
  ComponentNode.ref?.addHook('mounted', cb);
}

export function onDestroy(cb: () => void): void {
  throwIfOutsideComponent('onDestroy');
  ComponentNode.ref?.addHook('destroy', cb);
}

function throwIfOutsideComponent(hook: string) {
  if (!ComponentNode.ref) {
    console.error(
      `"${hook}" can only be called within the component function body
      and cannot be used in asynchronous or deferred calls.`,
    );
  }
}

export function getCurrentComponent(): ComponentNode | null {
  return ComponentNode.ref;
}

// eslint-disable-next-line @typescript-eslint/no-wrapper-object-types, unused-imports/no-unused-vars
export interface InjectionKey<T> extends Symbol {}

export function useProvide<T, K = InjectionKey<T> | string | number>(
  key: K,
  value: K extends InjectionKey<infer V> ? V : T,
) {
  throwIfOutsideComponent('useProvide');

  ComponentNode.ref?.setContext(key as string, value);
}
export function useInject<T, K = InjectionKey<T> | string | number>(
  key: K,
  defaultValue?: K extends InjectionKey<infer V> ? V : T,
): (K extends InjectionKey<infer V> ? V : T) | undefined {
  throwIfOutsideComponent('useInject');
  return ComponentNode.ref?.getContext(key as string) || defaultValue;
}

// export function useProps(props) {
//   const propsValue = props;
//   const propsAction = () => {};
//   const propsRef = () => {};
//   const propsChild = () => {};
// }
