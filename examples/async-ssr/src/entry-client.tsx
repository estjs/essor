import { hydrate, provide } from 'essor';
import { App, PageDataKey, type Todo } from './main';

declare global {
  interface Window {
    __ASYNC_SSR_DATA__?: Todo[];
  }
}

/**
 * Client root: mirrors the server's async root, but the data is already
 * resolved — the server serialized it into `window.__ASYNC_SSR_DATA__`.
 * Providing it before returning <App /> keeps the injected value identical
 * on both sides, so hydration reuses the server-rendered DOM.
 */
function ClientRoot() {
  provide(PageDataKey, window.__ASYNC_SSR_DATA__ ?? []);
  return <App />;
}

hydrate(ClientRoot, '#app');
