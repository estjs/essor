import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { signal } from '@estjs/signals';
import { Transition, isTransition } from '../../src/components/Transition';
import {
  cleanupContext,
  createContext,
  popContextStack,
  pushContextStack,
  resetEnvironment,
} from '../test-utils';

function flushMount(scope: any): void {
  scope.onMount?.forEach((cb: () => void) => cb());
  scope.children?.forEach((c: any) => flushMount(c));
}

describe('Transition (stub passthrough)', () => {
  let container: HTMLElement;

  beforeEach(() => {
    resetEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  });

  it('mounts the child when slot is truthy', async () => {
    const show = signal(true);
    const ctx = createContext(null);
    pushContextStack(ctx);
    const anchor = Transition({
      children: () => {
        if (!show.value) return undefined;
        const div = document.createElement('div');
        div.className = 'box';
        div.textContent = 'hi';
        return div;
      },
    });
    container.appendChild(anchor);
    flushMount(ctx);
    await Promise.resolve();
    expect(container.querySelector('.box')).not.toBeNull();
    popContextStack();
    cleanupContext(ctx);
  });

  it('removes the child when slot becomes falsy', async () => {
    const show = signal(true);
    const ctx = createContext(null);
    pushContextStack(ctx);
    const anchor = Transition({
      children: () => {
        if (!show.value) return undefined;
        const div = document.createElement('div');
        div.className = 'box';
        div.textContent = 'hi';
        return div;
      },
    });
    container.appendChild(anchor);
    flushMount(ctx);
    await Promise.resolve();
    expect(container.querySelector('.box')).not.toBeNull();

    show.value = false;
    await Promise.resolve();
    expect(container.querySelector('.box')).toBeNull();
    popContextStack();
    cleanupContext(ctx);
  });

  it('is marked with TRANSITION_COMPONENT symbol', () => {
    expect(isTransition(Transition)).toBe(true);
  });

  it('passes through a static child element', async () => {
    const child = document.createElement('span');
    child.className = 'static';
    const ctx = createContext(null);
    pushContextStack(ctx);
    const anchor = Transition({ children: child });
    container.appendChild(anchor);
    flushMount(ctx);
    await Promise.resolve();
    expect(container.querySelector('.static')).not.toBeNull();
    popContextStack();
    cleanupContext(ctx);
  });

  it('handles null/undefined children gracefully', async () => {
    const ctx = createContext(null);
    pushContextStack(ctx);
    const anchor = Transition({ children: undefined });
    container.appendChild(anchor);
    flushMount(ctx);
    await Promise.resolve();
    // No element children, but should not throw
    expect(container.querySelector('*')).toBeNull();
    popContextStack();
    cleanupContext(ctx);
  });
});
