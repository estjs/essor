/**
 * Create a reactive proxy that excludes specified properties
 *
 * @param target - The original reactive object
 * @param keys - List of property names to exclude
 * @returns A reactive proxy with specified properties excluded
 */
export function omitProps<T extends object, K extends keyof T>(target: T, keys: K[]): Omit<T, K> {
  const excludeSet = new Set(keys);

  return new Proxy(target, {
    // Intercept property reads
    get(obj, prop) {
      if (excludeSet.has(prop as K)) {
        return undefined;
      }
      return Reflect.get(obj, prop);
    },

    // Intercept property enumeration (for...in, Object.keys, etc.)
    ownKeys(obj) {
      return Reflect.ownKeys(obj).filter(key => !excludeSet.has(key as K));
    },

    // Intercept property descriptor retrieval
    getOwnPropertyDescriptor(obj, prop) {
      if (excludeSet.has(prop as K)) {
        return undefined;
      }
      return Reflect.getOwnPropertyDescriptor(obj, prop);
    },

    // Intercept the 'in' operator
    has(obj, prop) {
      if (excludeSet.has(prop as K)) {
        return false;
      }
      return Reflect.has(obj, prop);
    },
  });
}
