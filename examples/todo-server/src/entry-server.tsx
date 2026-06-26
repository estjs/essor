import { renderToString } from '@estjs/server';
import { App } from './main';

export interface RenderResult {
  html: string;
}

export function render(): RenderResult {
  const html = renderToString(App);
  return { html };
}
