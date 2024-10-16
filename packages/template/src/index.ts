// Export core rendering functions and components
export { h, Fragment, isJsxElement, isComponent, createTemplate as template } from './jsx-renderer';

// Export hooks
export { onMount, onDestroy, useInject, useProvide, useRef } from './hooks';

// Export types
export type { InjectionKey } from './hooks';

// Export server-side rendering functions
export { renderToString, hydrate, ssg } from './server';

// Export JSX types
//@ts-ignore
export * from '../types/jsx.d.ts';
