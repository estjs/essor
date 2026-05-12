import { INCREMENT_LABEL, INCREMENT_STEP } from './config';
import { demoState } from './state';

function setCount(nextValue: number, action: string) {
  demoState.count.value = nextValue;
  demoState.lastAction.value = action;
}

export function increment() {
  setCount(demoState.count.value + INCREMENT_STEP, `${INCREMENT_LABEL} +${INCREMENT_STEP}`);
}

export function decrement() {
  setCount(demoState.count.value - 1, 'Decrement -1');
}

export function reset() {
  setCount(0, 'Reset');
}
