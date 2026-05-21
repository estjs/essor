import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { signal } from '@estjs/signals';
import {
  Transition,
  getTransitionInfo,
  isTransition,
  resolveTransitionClasses,
} from '../../src/components/Transition';
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

describe('resolveTransitionClasses', () => {
  it('defaults to v-* prefix when no name given', () => {
    expect(resolveTransitionClasses({})).toEqual({
      enterFrom: 'v-enter-from',
      enterActive: 'v-enter-active',
      enterTo: 'v-enter-to',
      leaveFrom: 'v-leave-from',
      leaveActive: 'v-leave-active',
      leaveTo: 'v-leave-to',
      appearFrom: 'v-enter-from',
      appearActive: 'v-enter-active',
      appearTo: 'v-enter-to',
    });
  });

  it('uses name= as prefix', () => {
    expect(resolveTransitionClasses({ name: 'fade' }).enterFrom).toBe('fade-enter-from');
    expect(resolveTransitionClasses({ name: 'fade' }).leaveActive).toBe('fade-leave-active');
  });

  it('uses dedicated appear* classes when provided', () => {
    const r = resolveTransitionClasses({
      name: 'fade',
      appearFromClass: 'custom-appear-from',
      appearActiveClass: 'custom-appear-active',
      appearToClass: 'custom-appear-to',
    });
    expect(r.appearFrom).toBe('custom-appear-from');
    expect(r.appearActive).toBe('custom-appear-active');
    expect(r.appearTo).toBe('custom-appear-to');
  });

  it('falls appear* back to enter* when not specified', () => {
    const r = resolveTransitionClasses({ name: 'fade' });
    expect(r.appearFrom).toBe('fade-enter-from');
    expect(r.appearActive).toBe('fade-enter-active');
    expect(r.appearTo).toBe('fade-enter-to');
  });

  it('individual class prop overrides the name-based default', () => {
    const r = resolveTransitionClasses({ name: 'fade', enterFromClass: 'eopen' });
    expect(r.enterFrom).toBe('eopen');
    expect(r.enterActive).toBe('fade-enter-active');
    expect(r.appearFrom).toBe('eopen'); // appear falls back to overridden enterFrom
  });
});

describe('getTransitionInfo', () => {
  let host: HTMLElement;
  beforeEach(() => {
    host = document.createElement('div');
    document.body.appendChild(host);
  });
  afterEach(() => {
    host.remove();
  });

  it('returns null when there is no transition or animation', () => {
    expect(getTransitionInfo(host)).toBeNull();
  });

  it('picks transitionend when only transition is set', () => {
    host.style.transitionDuration = '100ms';
    host.style.transitionDelay = '0s';
    const info = getTransitionInfo(host);
    expect(info?.event).toBe('transitionend');
    expect(info?.timeout).toBeGreaterThanOrEqual(100);
  });

  it('honors type override = animation (returns null if no animation)', () => {
    host.style.transitionDuration = '100ms';
    host.style.transitionDelay = '0s';
    expect(getTransitionInfo(host, 'animation')).toBeNull();
  });

  it('honors type override = transition (returns null if no transition)', () => {
    host.style.animationDuration = '200ms';
    host.style.animationDelay = '0s';
    expect(getTransitionInfo(host, 'transition')).toBeNull();
  });
});
