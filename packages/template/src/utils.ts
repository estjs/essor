/**
 * Shallow compare two objects
 * @param {any} a - The first object to compare
 * @param {any} b - The second object to compare
 * @returns {boolean} - Returns true if the objects are equal, false otherwise
 */
export function shallowCompare(a: any, b: any): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;

  for (const key in a) {
    if (a[key] !== b[key]) return false;
  }

  for (const key in b) {
    if (!(key in a)) return false;
  }

  return true;
}

/**
 * Omits props from a target object using a proxy.
 *
 * @param target - The target object.
 * @param keys - The keys to omit.
 * @returns A proxy that omits specified keys.
 */
export function omitProps<T extends object, K extends keyof T>(target: T, keys: K[]): Omit<T, K> {
  const excludeSet = new Set(keys);

  return new Proxy(target, {
    /**
     * Returns a property unless it is excluded by the proxy.
     */
    get(obj, prop) {
      if (excludeSet.has(prop as K)) {
        return undefined;
      }
      return Reflect.get(obj, prop);
    },
    /**
     * Returns the enumerable keys that are not excluded from the proxy.
     */
    ownKeys(obj) {
      return Reflect.ownKeys(obj).filter((key) => !excludeSet.has(key as K));
    },
    /**
     * Returns the property descriptor unless the key is excluded.
     */
    getOwnPropertyDescriptor(obj, prop) {
      if (excludeSet.has(prop as K)) {
        return undefined;
      }
      return Reflect.getOwnPropertyDescriptor(obj, prop);
    },
    /**
     * Returns whether the requested value exists.
     */
    has(obj, prop) {
      if (excludeSet.has(prop as K)) {
        return false;
      }
      return Reflect.has(obj, prop);
    },
  });
}
