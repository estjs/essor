import { error, isNil } from '@estjs/shared';
import { type Context, getActiveContext } from './context';

// eslint-disable-next-line @typescript-eslint/no-wrapper-object-types, unused-imports/no-unused-vars
export interface InjectionKey<T> extends Symbol {}

/**
 * provide a value to the context
 * @param {InjectionKey<T>|string|number} key - the key to provide the value to
 * @param {T} value - the value to provide
 */
export function provide<T>(key: InjectionKey<T> | string | number, value: T) {
  const context = getActiveContext();
  if (!context) {
    error('provide must be called within a template');
    return;
  }

  context.provides.set(key, value);
}

/**
 * inject a value from the context
 * @param {InjectionKey<T>|string|number} key - the key to inject the value from
 * @param {T} defaultValue - the default value to return if the key is not found
 * @returns {T} the value injected
 */
export function inject<T>(key: InjectionKey<T> | string | number, defaultValue?: T): T {
  const context = getActiveContext();
  if (!context) {
    error('inject must be called within a template');
    return defaultValue as T;
  }

  // Find value in context hierarchy
  let currentContext: Context | null = context;
  while (currentContext) {
    const value = currentContext.provides.get(key);
    if (!isNil(value)) {
      // Cache the found value
      return value as T;
    }
    currentContext = currentContext.parent;
  }

  // Cache default value if not found
  return defaultValue as T;
}
