import type { FilterPattern } from 'vite';
export interface Options {
  include?: FilterPattern;
  exclude?: FilterPattern;
  ssg?: boolean;
  props?: boolean;
  symbol?: '$';
}
