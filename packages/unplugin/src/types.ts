import type { FilterPattern } from 'vite';
export interface Options {
  include?: FilterPattern;
  exclude?: FilterPattern;
  server?: boolean;
  props?: boolean;
  symbol?: '$';
}
