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
    throw new Error(
      `"${hook}" can only be called within the component function body
      and cannot be used in asynchronous or deferred calls.`,
    );
  }
}

export function getCurrentComponent(): ComponentNode | null {
  return ComponentNode.ref;
}

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
) {
  throwIfOutsideComponent('useInject');
  return ComponentNode.ref?.getContext(key as string) || defaultValue;
}

// export function useProps(props) {
//   const propsValue = props;
//   const propsAction = () => {};
//   const propsRef = () => {};
//   const propsChild = () => {};
// }

/**
 * Initializes a reference with a null value of type T or null.
 *
 * @template T - The type of the reference.
 * @return {T & { __is_ref: boolean; current: T | null }} A proxy object allowing custom get and set behavior.
 */
export function useRef<T>(): {
  __is_ref: boolean;
  current: T | null;
} {
  // 初始化 ref 为 null，类型为 T 或 null
  let refValue: T | null = null;

  // 使用 Proxy 创建一个代理对象，以便我们可以自定义 get 和 set 行为
  return new Proxy({} as any, {
    get(target, key: string | symbol) {
      // 特殊属性 __is_ref 始终返回 true
      if (key === '__is_ref') {
        return true;
      }
      // 直接返回 refValue
      return refValue;
    },
    set(target, prop: string | symbol, value: any) {
      if (prop === 'current') {
        refValue = value;
        return true;
      }
      refValue = value;
      return true;
    },
  });
}
