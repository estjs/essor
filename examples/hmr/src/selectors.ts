import { demoState } from './state';

export function getDoubledCount() {
  return demoState.count.value * 2;
}

export function getParity() {
  return demoState.count.value % 2 === 0 ? 'even' : 'odd';
}
