import { renderToStringAsync } from '@estjs/server';
import { provide } from 'essor';
import { App, PageDataKey, type Todo, fakeFetchTodos } from './main';
import type { ComponentFn } from 'essor';

export interface RenderResult {
  html: string;
  /** Resolved page data, serialized into the document for client hydration. */
  data: Todo[];
}

/**
 * Async SSR entry. The root component awaits its data source and calls
 * `provide()` AFTER the await — `renderToStringAsync` keeps the request's
 * reactive scope alive across await boundaries, so descendants can still
 * `inject()` the value. The whole tree is awaited before any HTML is
 * produced (TTFB = slowest data dependency).
 */
export async function render(): Promise<RenderResult> {
  let pageData: Todo[] = [];

  const AsyncRoot = async () => {
    pageData = await fakeFetchTodos();
    provide(PageDataKey, pageData); // after await — still request-scoped
    return <App />;
  };

  // `ComponentFn` does not model async components yet — renderToStringAsync
  // supports them at runtime (see packages/server/test/async.spec.ts).
  const html = await renderToStringAsync(AsyncRoot as unknown as ComponentFn);
  return { html, data: pageData };
}
