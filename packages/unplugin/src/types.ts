import type { FilterPattern } from 'vite';
export interface Options {
  include?: FilterPattern;
  exclude?: FilterPattern;
  mode?: 'ssg' | 'ssr' | 'client';
  autoProps?: boolean;
  symbol?: '$';
  hmr?: boolean;
}
