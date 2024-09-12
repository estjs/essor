import { createSSRApp } from 'essor';
import { App } from './main.js';

export function createApp() {
  return createSSRApp(App);
}
