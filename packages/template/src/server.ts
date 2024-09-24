import { h } from './factory';
import { RENDER_MODE, globalConfig, isSSG } from './render-config';
import { SSGRender } from './render/ssg';
import type { EssorComponent, Props } from '../types';

export function renderToString(component: EssorComponent, props?: Record<string, unknown>): string {
  globalConfig.renderMode = RENDER_MODE.SSG;
  const ssrNode = new SSGRender(component, props || {});
  const html = ssrNode.mount();
  globalConfig.renderMode = RENDER_MODE.CLIENT;
  return html;
}

export function hydrate(component: EssorComponent, container: string | Element): void {
  const rootElement = typeof container === 'string' ? document.querySelector(container) : container;
  if (!rootElement) {
    throw new Error(`Could not find container: ${container}`);
  }

  globalConfig.renderMode = RENDER_MODE.SSR;
  h(component, {}).mount(rootElement);
  globalConfig.renderMode = RENDER_MODE.CLIENT;
}

export function ssg(component, props?: Props) {
  if (isSSG()) {
    return new SSGRender(component, props);
  }
  return h(component, props);
}
