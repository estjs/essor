import type { FilterPattern } from 'vite';
export interface Options {
  include?: FilterPattern;
  exclude?: FilterPattern;
  mode?: 'ssg' | 'ssr' | 'client';
  props?: boolean;
  symbol?: '$';
  hmr?: boolean;
}
