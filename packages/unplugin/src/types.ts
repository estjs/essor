import type { FilterPattern } from 'vite';
export interface Options {
  include?: FilterPattern;
  exclude?: FilterPattern;
  ssr?: boolean;
  symbol?: '$';
}
