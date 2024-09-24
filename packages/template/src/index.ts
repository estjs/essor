export { h, Fragment, isJsxElement, isComponent, createTemplate as template } from './factory';
export { onMount, onDestroy, useInject, useProvide, useRef } from './hooks';
export { renderToString, hydrate, ssg } from './server';

export type { InjectionKey } from './hooks';

//@ts-ignore
export * from '../types/jsx.d.ts';
