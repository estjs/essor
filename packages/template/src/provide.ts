import { error } from '@estjs/shared';
import { type Scope, getActiveScope } from './scope';

/**
 * InjectionKey is a unique identifier for provided values.
 * Using Symbol ensures type safety and prevents key collisions.
 */
// eslint-disable-next-line @typescript-eslint/no-wrapper-object-types, unused-imports/no-unused-vars
export interface InjectionKey<T> extends Symbol {}

/**
 * Provide a value in the current scope.
 * The value can be injected by this scope or any descendant scope.
 *
 * @param key - The injection key
 * @param value - The value to provide
 */
export function provide<T>(key: InjectionKey<T> | string | number, value: T): void {
  const scope = getActiveScope();

  if (!scope) {
    if (__DEV__) {
      error('provide() must be called within a scope');
    }
    return;
  }

  // Lazy initialize provides map
  if (!scope.provides) {
    scope.provides = new Map();
  }

  scope.provides.set(key, value);
}

/**
 * Inject a value from the scope hierarchy.
 * Traverses up the parent chain until finding a matching key.
 *
 * @param key - The injection key
 * @param defaultValue - Default value if key is not found
 * @returns The injected value or default value
 */
export function inject<T>(key: InjectionKey<T> | string | number, defaultValue?: T): T {
  const scope = getActiveScope();

  if (!scope) {
    if (__DEV__) {
      error('inject() must be called within a scope');
    }
    return defaultValue as T;
  }

  // Traverse up the hierarchy
  let current: Scope | null = scope;
  while (current) {
    if (current.provides) {
      const value = current.provides.get(key);
      if (value) {
        return value as T;
      }
    }
    current = current.parent;
  }

  return defaultValue as T;
}
