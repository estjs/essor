export { h, Fragment, isJsxElement, isComponent, createTemplate as template } from './jsx-renderer';
export { onMount, onDestroy, useInject, useProvide, useRef } from './hooks';
export { renderToString, hydrate, ssg } from './hydration';

export type { InjectionKey } from './hooks';

//@ts-ignore
export * from '../types/jsx.d.ts';
