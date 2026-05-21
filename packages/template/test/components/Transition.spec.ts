import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

describe('Transition enter flow', () => {
  let container: HTMLElement;
  beforeEach(() => {
    resetEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    if (container.parentNode) container.parentNode.removeChild(container);
  });

  function rafTick(): Promise<void> {
    return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }

  it('applies enter-from + enter-active, swaps to enter-to, clears on transitionend', async () => {
    const show = signal(false);
    const ctx = createContext(null);
    pushContextStack(ctx);
    const anchor = Transition({
      name: 'fade',
      children: () => {
        if (!show.value) return undefined;
        const el = document.createElement('div');
        el.className = 'box';
        el.style.transitionDuration = '100ms';
        el.style.transitionDelay = '0ms';
        return el;
      },
    });
    container.appendChild(anchor);
    flushMount(ctx);

    show.value = true;
    await Promise.resolve();

    const el = container.querySelector('.box') as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.classList.contains('fade-enter-from')).toBe(true);
    expect(el.classList.contains('fade-enter-active')).toBe(true);

    // advance through both rAFs that nextFrame schedules
    await rafTick();
    await rafTick();

    expect(el.classList.contains('fade-enter-from')).toBe(false);
    expect(el.classList.contains('fade-enter-to')).toBe(true);
    expect(el.classList.contains('fade-enter-active')).toBe(true);

    el.dispatchEvent(new Event('transitionend'));
    expect(el.classList.contains('fade-enter-active')).toBe(false);
    expect(el.classList.contains('fade-enter-to')).toBe(false);

    popContextStack();
    cleanupContext(ctx);
  });
});

describe('Transition leave flow', () => {
  let container: HTMLElement;
  beforeEach(() => {
    resetEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    if (container.parentNode) container.parentNode.removeChild(container);
  });

  function rafTick(): Promise<void> {
    return new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  }

  it('keeps the element in the DOM until transitionend fires', async () => {
    const show = signal(true);
    const ctx = createContext(null);
    pushContextStack(ctx);
    const anchor = Transition({
      name: 'fade',
      children: () => {
        if (!show.value) return undefined;
        const el = document.createElement('div');
        el.className = 'box';
        el.style.transitionDuration = '100ms';
        el.style.transitionDelay = '0ms';
        return el;
      },
    });
    container.appendChild(anchor);
    flushMount(ctx);
    await Promise.resolve();
    await rafTick();
    await rafTick();
    // initial mount might apply enter-* classes; trigger transitionend to clean them
    const elInit = container.querySelector('.box') as HTMLElement;
    if (elInit) elInit.dispatchEvent(new Event('transitionend'));

    show.value = false;
    await Promise.resolve();

    const el = container.querySelector('.box') as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.classList.contains('fade-leave-from')).toBe(true);
    expect(el.classList.contains('fade-leave-active')).toBe(true);
    expect(container.contains(el)).toBe(true);

    await rafTick();
    await rafTick();

    expect(el.classList.contains('fade-leave-from')).toBe(false);
    expect(el.classList.contains('fade-leave-to')).toBe(true);
    expect(container.contains(el)).toBe(true); // still in DOM

    el.dispatchEvent(new Event('transitionend'));
    expect(container.contains(el)).toBe(false);

    popContextStack();
    cleanupContext(ctx);
  });
});

describe('Transition JS hooks (T9)', () => {
  let container: HTMLElement;
  beforeEach(() => {
    resetEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    if (container.parentNode) container.parentNode.removeChild(container);
  });
  function rafTick() { return new Promise<void>((r) => requestAnimationFrame(() => r())); }

  it('fires enter hooks in order: before → enter → after', async () => {
    const show = signal(false);
    const calls: string[] = [];
    const ctx = createContext(null);
    pushContextStack(ctx);
    const anchor = Transition({
      name: 'fade',
      onBeforeEnter: () => calls.push('before'),
      onEnter: (_el, done) => { calls.push('enter'); done(); },
      onAfterEnter: () => calls.push('after'),
      children: () => {
        if (!show.value) return undefined;
        const el = document.createElement('div');
        el.className = 'box';
        return el;
      },
    });
    container.appendChild(anchor);
    flushMount(ctx);
    show.value = true;
    await Promise.resolve();
    await rafTick();
    await rafTick();
    expect(calls).toEqual(['before', 'enter', 'after']);
    popContextStack();
    cleanupContext(ctx);
  });

  it('fires leave hooks in order: before → leave → after', async () => {
    const show = signal(true);
    const calls: string[] = [];
    const ctx = createContext(null);
    pushContextStack(ctx);
    const anchor = Transition({
      name: 'fade',
      onBeforeLeave: () => calls.push('before'),
      onLeave: (_el, done) => { calls.push('leave'); done(); },
      onAfterLeave: () => calls.push('after'),
      children: () => {
        if (!show.value) return undefined;
        const el = document.createElement('div');
        el.className = 'box';
        return el;
      },
    });
    container.appendChild(anchor);
    flushMount(ctx);
    await Promise.resolve();
    await rafTick();
    await rafTick();
    show.value = false;
    await Promise.resolve();
    await rafTick();
    await rafTick();
    expect(calls).toEqual(['before', 'leave', 'after']);
    popContextStack();
    cleanupContext(ctx);
  });

  it('done() is idempotent — repeated calls do not retrigger onAfterEnter', async () => {
    const show = signal(false);
    let afterCount = 0;
    const ctx = createContext(null);
    pushContextStack(ctx);
    const anchor = Transition({
      name: 'fade',
      onEnter: (_el, done) => { done(); done(); done(); },
      onAfterEnter: () => { afterCount++; },
      children: () => {
        if (!show.value) return undefined;
        const el = document.createElement('div');
        el.className = 'box';
        return el;
      },
    });
    container.appendChild(anchor);
    flushMount(ctx);
    show.value = true;
    await Promise.resolve();
    await rafTick();
    await rafTick();
    expect(afterCount).toBe(1);
    popContextStack();
    cleanupContext(ctx);
  });
});

describe('Transition css: false (T10)', () => {
  let container: HTMLElement;
  beforeEach(() => {
    resetEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    if (container.parentNode) container.parentNode.removeChild(container);
  });
  function rafTick() { return new Promise<void>((r) => requestAnimationFrame(() => r())); }

  it('does not apply any CSS classes when css=false', async () => {
    const show = signal(false);
    const ctx = createContext(null);
    pushContextStack(ctx);
    const anchor = Transition({
      name: 'fade',
      css: false,
      onEnter: (_el, done) => done(),
      onLeave: (_el, done) => done(),
      children: () => {
        if (!show.value) return undefined;
        const el = document.createElement('div');
        el.className = 'box';
        return el;
      },
    });
    container.appendChild(anchor);
    flushMount(ctx);
    show.value = true;
    await Promise.resolve();
    await rafTick();
    await rafTick();
    const el = container.querySelector('.box') as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.classList.contains('fade-enter-from')).toBe(false);
    expect(el.classList.contains('fade-enter-active')).toBe(false);
    expect(el.classList.contains('fade-enter-to')).toBe(false);
    popContextStack();
    cleanupContext(ctx);
  });
});

describe('Transition duration (T11)', () => {
  let container: HTMLElement;
  beforeEach(() => {
    resetEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    if (container.parentNode) container.parentNode.removeChild(container);
  });
  function rafTick() { return new Promise<void>((r) => requestAnimationFrame(() => r())); }

  it('uses setTimeout when duration is a number', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'requestAnimationFrame'] });
    try {
      const show = signal(false);
      const after = vi.fn();
      const ctx = createContext(null);
      pushContextStack(ctx);
      const anchor = Transition({
        name: 'fade',
        duration: 150,
        onAfterEnter: after,
        children: () => {
          if (!show.value) return undefined;
          const el = document.createElement('div');
          el.className = 'box';
          return el;
        },
      });
      container.appendChild(anchor);
      flushMount(ctx);
      show.value = true;
      await Promise.resolve();
      // flush both rAFs that nextFrame schedules (each rAF = ~16ms in fake timers)
      vi.advanceTimersByTime(34);
      await Promise.resolve();
      // now advance past the duration setTimeout
      vi.advanceTimersByTime(150);
      await Promise.resolve();
      expect(after).toHaveBeenCalled();
      popContextStack();
      cleanupContext(ctx);
    } finally {
      vi.useRealTimers();
    }
  });

  it('honors { enter, leave } per-direction durations', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'requestAnimationFrame'] });
    try {
      const show = signal(true);
      const after = vi.fn();
      const ctx = createContext(null);
      pushContextStack(ctx);
      const anchor = Transition({
        name: 'fade',
        duration: { enter: 100, leave: 500 },
        onAfterLeave: after,
        children: () => {
          if (!show.value) return undefined;
          const el = document.createElement('div');
          el.className = 'box';
          return el;
        },
      });
      container.appendChild(anchor);
      flushMount(ctx);
      // flush initial enter: 2 rAF ticks (32ms) + enter duration (100ms) = 132ms
      await Promise.resolve();
      vi.advanceTimersByTime(200);
      await Promise.resolve();

      show.value = false;
      await Promise.resolve();
      // flush 2 rAF ticks for leave nextFrame (32ms), then advance to just before 500ms leave duration
      vi.advanceTimersByTime(32); // flush the 2 rAFs, leave setTimeout(done, 500) now registered
      await Promise.resolve();
      // leave setTimeout fires 500ms after it was registered; advance only 400ms — should NOT fire
      vi.advanceTimersByTime(400);
      await Promise.resolve();
      expect(after).not.toHaveBeenCalled();
      // advance the remaining 101ms — total past 500ms — should fire
      vi.advanceTimersByTime(101);
      await Promise.resolve();
      expect(after).toHaveBeenCalled();
      popContextStack();
      cleanupContext(ctx);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('Transition appear (T12)', () => {
  let container: HTMLElement;
  beforeEach(() => {
    resetEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    if (container.parentNode) container.parentNode.removeChild(container);
  });
  function rafTick() { return new Promise<void>((r) => requestAnimationFrame(() => r())); }

  it('runs enter classes on initial mount when appear=true', async () => {
    const show = signal(true);
    const ctx = createContext(null);
    pushContextStack(ctx);
    const anchor = Transition({
      name: 'fade',
      appear: true,
      children: () => {
        if (!show.value) return undefined;
        const el = document.createElement('div');
        el.className = 'box';
        el.style.transitionDuration = '100ms';
        el.style.transitionDelay = '0ms';
        return el;
      },
    });
    container.appendChild(anchor);
    flushMount(ctx);
    await Promise.resolve();
    const el = container.querySelector('.box') as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.classList.contains('fade-enter-active')).toBe(true);
    popContextStack();
    cleanupContext(ctx);
  });

  it('uses appear-* classes when explicitly set', async () => {
    const show = signal(true);
    const ctx = createContext(null);
    pushContextStack(ctx);
    const anchor = Transition({
      name: 'fade',
      appear: true,
      appearActiveClass: 'magic-appear',
      children: () => {
        if (!show.value) return undefined;
        const el = document.createElement('div');
        el.className = 'box';
        return el;
      },
    });
    container.appendChild(anchor);
    flushMount(ctx);
    await Promise.resolve();
    const el = container.querySelector('.box') as HTMLElement;
    expect(el.classList.contains('magic-appear')).toBe(true);
    expect(el.classList.contains('fade-enter-active')).toBe(false);
    popContextStack();
    cleanupContext(ctx);
  });

  it('does NOT animate on initial mount when appear is omitted', async () => {
    const show = signal(true);
    const ctx = createContext(null);
    pushContextStack(ctx);
    const anchor = Transition({
      name: 'fade',
      children: () => {
        if (!show.value) return undefined;
        const el = document.createElement('div');
        el.className = 'box';
        return el;
      },
    });
    container.appendChild(anchor);
    flushMount(ctx);
    await Promise.resolve();
    const el = container.querySelector('.box') as HTMLElement;
    expect(el).not.toBeNull();
    expect(el.classList.contains('fade-enter-active')).toBe(false);
    expect(el.classList.contains('fade-enter-from')).toBe(false);
    popContextStack();
    cleanupContext(ctx);
  });
});

describe('Transition cancellation: enter→leave (T13)', () => {
  let container: HTMLElement;
  beforeEach(() => {
    resetEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    if (container.parentNode) container.parentNode.removeChild(container);
  });
  function rafTick() { return new Promise<void>((r) => requestAnimationFrame(() => r())); }

  it('fires onEnterCancelled when leave starts during enter', async () => {
    const show = signal(false);
    const cancel = vi.fn();
    const afterLeave = vi.fn();
    const ctx = createContext(null);
    pushContextStack(ctx);
    const anchor = Transition({
      name: 'fade',
      onEnterCancelled: cancel,
      onAfterLeave: afterLeave,
      children: () => {
        if (!show.value) return undefined;
        const el = document.createElement('div');
        el.className = 'box';
        el.style.transitionDuration = '100ms';
        el.style.transitionDelay = '0ms';
        return el;
      },
    });
    container.appendChild(anchor);
    flushMount(ctx);
    show.value = true;
    await Promise.resolve();
    // mid-enter — flip back to false BEFORE rAFs complete
    show.value = false;
    await Promise.resolve();
    expect(cancel).toHaveBeenCalledTimes(1);
    // let leave finish
    await rafTick();
    await rafTick();
    const el = container.querySelector('.box') as HTMLElement;
    if (el) el.dispatchEvent(new Event('transitionend'));
    expect(afterLeave).toHaveBeenCalledTimes(1);
    popContextStack();
    cleanupContext(ctx);
  });

  it('strips enter classes when cancelled', async () => {
    const show = signal(false);
    const ctx = createContext(null);
    pushContextStack(ctx);
    const anchor = Transition({
      name: 'fade',
      children: () => {
        if (!show.value) return undefined;
        const el = document.createElement('div');
        el.className = 'box';
        el.style.transitionDuration = '100ms';
        return el;
      },
    });
    container.appendChild(anchor);
    flushMount(ctx);
    show.value = true;
    await Promise.resolve();
    const elBefore = container.querySelector('.box') as HTMLElement;
    expect(elBefore.classList.contains('fade-enter-from')).toBe(true);
    show.value = false;
    await Promise.resolve();
    // enter classes scrubbed; leave classes (or removed) replace them
    expect(elBefore.classList.contains('fade-enter-from')).toBe(false);
    expect(elBefore.classList.contains('fade-enter-active')).toBe(false);
    expect(elBefore.classList.contains('fade-enter-to')).toBe(false);
    popContextStack();
    cleanupContext(ctx);
  });
});

describe('Transition cancellation: leave→enter (T14)', () => {
  let container: HTMLElement;
  beforeEach(() => {
    resetEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    if (container.parentNode) container.parentNode.removeChild(container);
  });
  function rafTick() { return new Promise<void>((r) => requestAnimationFrame(() => r())); }

  it('fires onLeaveCancelled and preserves the element when enter restarts during leave', async () => {
    const show = signal(true);
    const cancel = vi.fn();
    const ctx = createContext(null);
    pushContextStack(ctx);
    const anchor = Transition({
      name: 'fade',
      onLeaveCancelled: cancel,
      children: () => {
        if (!show.value) return undefined;
        const el = document.createElement('div');
        el.className = 'box';
        el.style.transitionDuration = '100ms';
        el.style.transitionDelay = '0ms';
        return el;
      },
    });
    container.appendChild(anchor);
    flushMount(ctx);
    await Promise.resolve();
    const elInitial = container.querySelector('.box');
    show.value = false;
    await Promise.resolve();
    show.value = true;
    await Promise.resolve();
    const elAfter = container.querySelector('.box');
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(elAfter).toBe(elInitial);
    popContextStack();
    cleanupContext(ctx);
  });
});
