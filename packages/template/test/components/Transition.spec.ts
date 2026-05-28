import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signal } from '@estjs/signals';
import {
  Transition,
  getTransitionInfo,
  isTransition,
  resolveTransitionClasses,
} from '../../src/components/Transition';
import { createComponent } from '../../src/component';
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

describe('transition (stub passthrough)', () => {
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

describe('transition enter flow', () => {
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

describe('transition leave flow', () => {
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

describe('transition JS hooks (T9)', () => {
  let container: HTMLElement;
  beforeEach(() => {
    resetEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    if (container.parentNode) container.parentNode.removeChild(container);
  });
  function rafTick() {
    return new Promise<void>((r) => requestAnimationFrame(() => r()));
  }

  it('fires enter hooks in order: before → enter → after', async () => {
    const show = signal(false);
    const calls: string[] = [];
    const ctx = createContext(null);
    pushContextStack(ctx);
    const anchor = Transition({
      name: 'fade',
      onBeforeEnter: () => calls.push('before'),
      onEnter: (_el, done) => {
        calls.push('enter');
        done();
      },
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
      onLeave: (_el, done) => {
        calls.push('leave');
        done();
      },
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
      onEnter: (_el, done) => {
        done();
        done();
        done();
      },
      onAfterEnter: () => {
        afterCount++;
      },
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

describe('transition css: false (T10)', () => {
  let container: HTMLElement;
  beforeEach(() => {
    resetEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    if (container.parentNode) container.parentNode.removeChild(container);
  });
  function rafTick() {
    return new Promise<void>((r) => requestAnimationFrame(() => r()));
  }

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

describe('transition duration (T11)', () => {
  let container: HTMLElement;
  beforeEach(() => {
    resetEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    if (container.parentNode) container.parentNode.removeChild(container);
  });
  function rafTick() {
    return new Promise<void>((r) => requestAnimationFrame(() => r()));
  }

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

describe('transition appear (T12)', () => {
  let container: HTMLElement;
  beforeEach(() => {
    resetEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    if (container.parentNode) container.parentNode.removeChild(container);
  });
  function rafTick() {
    return new Promise<void>((r) => requestAnimationFrame(() => r()));
  }

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

describe('transition cancellation: enter→leave (T13)', () => {
  let container: HTMLElement;
  beforeEach(() => {
    resetEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    if (container.parentNode) container.parentNode.removeChild(container);
  });
  function rafTick() {
    return new Promise<void>((r) => requestAnimationFrame(() => r()));
  }

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

describe('transition cancellation: leave→enter (T14)', () => {
  let container: HTMLElement;
  beforeEach(() => {
    resetEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    if (container.parentNode) container.parentNode.removeChild(container);
  });
  function rafTick() {
    return new Promise<void>((r) => requestAnimationFrame(() => r()));
  }

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

describe('transition disposal (T15)', () => {
  let container: HTMLElement;
  beforeEach(() => {
    resetEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    if (container.parentNode) container.parentNode.removeChild(container);
  });

  it('removes the element synchronously when Transition scope is cleaned up mid-leave', async () => {
    const show = signal(true);
    const after = vi.fn();
    const ctx = createContext(null);
    pushContextStack(ctx);
    const anchor = Transition({
      name: 'fade',
      onAfterLeave: after,
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
    await Promise.resolve();
    show.value = false;
    await Promise.resolve();
    expect(container.querySelector('.box')).not.toBeNull();
    popContextStack();
    cleanupContext(ctx); // destroys Transition's scope mid-leave
    expect(container.querySelector('.box')).toBeNull();
  });
});

describe('transition validation (T16)', () => {
  let container: HTMLElement;
  beforeEach(() => {
    resetEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    if (container.parentNode) container.parentNode.removeChild(container);
  });

  it('throws in __DEV__ when slot resolves to multiple elements', async () => {
    const ctx = createContext(null);
    pushContextStack(ctx);
    const anchor = Transition({
      children: () => [document.createElement('div'), document.createElement('div')],
    });
    container.appendChild(anchor);
    expect(() => flushMount(ctx)).toThrow(/single root child/);
    popContextStack();
    cleanupContext(ctx);
  });

  it('warns in __DEV__ when slot resolves to a text node / primitive', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const ctx = createContext(null);
    pushContextStack(ctx);
    const anchor = Transition({ children: () => 'plain text' as any });
    container.appendChild(anchor);
    flushMount(ctx);
    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/non-element/i));
    warn.mockRestore();
    popContextStack();
    cleanupContext(ctx);
  });

  // -------------------------------------------------------------------------
  // Component-instance slots: <Transition>{() => <ChildComponent/>}</Transition>
  //
  // The slot evaluator may produce a Component instance (the babel/JSX path
  // for `<Foo/>` returns a Component). `validateSlot` mounts it into a
  // detached fragment and animates the component's first rendered Element.
  // -------------------------------------------------------------------------

  it('mounts a single-root Component slot and animates its rendered element', () => {
    const Inner = () => {
      const div = document.createElement('div');
      div.className = 'inner-box';
      div.textContent = 'inner';
      return div;
    };
    const ctx = createContext(null);
    pushContextStack(ctx);
    const anchor = Transition({ children: () => createComponent(Inner, {}) });
    container.appendChild(anchor);
    flushMount(ctx);

    const box = container.querySelector('.inner-box');
    expect(box).not.toBeNull();
    // It must live in the live tree, not the detached fragment that
    // `validateSlot` used as a staging area.
    expect(box?.parentNode).toBe(container);

    popContextStack();
    cleanupContext(ctx);
  });

  it('warns and animates only the first root when a Component slot has multiple roots', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const Multi = () => {
      const a = document.createElement('div');
      a.className = 'multi-a';
      const b = document.createElement('div');
      b.className = 'multi-b';
      return [a, b];
    };
    const ctx = createContext(null);
    pushContextStack(ctx);
    const anchor = Transition({ children: () => createComponent(Multi, {}) });
    container.appendChild(anchor);
    flushMount(ctx);

    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/multiple root/i));
    // First root is in the live tree; trailing roots stay in the staging
    // fragment (the documented "first participates" semantic).
    expect(container.querySelector('.multi-a')).not.toBeNull();
    expect(container.querySelector('.multi-b')).toBeNull();

    warn.mockRestore();
    popContextStack();
    cleanupContext(ctx);
  });

  it('warns when a Component slot does not render any Element root', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const TextOnly = () => document.createTextNode('hello') as unknown as Element;
    const ctx = createContext(null);
    pushContextStack(ctx);
    const anchor = Transition({ children: () => createComponent(TextOnly, {}) });
    container.appendChild(anchor);
    flushMount(ctx);

    expect(warn).toHaveBeenCalledWith(expect.stringMatching(/did not render an Element root/i));
    warn.mockRestore();
    popContextStack();
    cleanupContext(ctx);
  });
});

// ---------------------------------------------------------------------------
// Group A — rapid toggle sequences
// ---------------------------------------------------------------------------

describe('transition rapid toggle sequences (A)', () => {
  let container: HTMLElement;
  beforeEach(() => {
    resetEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    if (container.parentNode) container.parentNode.removeChild(container);
  });
  function rafTick() {
    return new Promise<void>((r) => requestAnimationFrame(() => r()));
  }

  it('a1: true→false→true→false within microtasks ends with no element and no leftover classes', async () => {
    const show = signal(false);
    const ctx = createContext(null);
    pushContextStack(ctx);
    const anchor = Transition({
      name: 'v',
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

    // Rapid toggle: true→false→true→false all within microtasks
    show.value = true;
    await Promise.resolve();
    show.value = false;
    await Promise.resolve();
    show.value = true;
    await Promise.resolve();
    show.value = false;
    await Promise.resolve();

    // Flush rAFs to settle any pending animation frames
    await rafTick();
    await rafTick();

    // Final state: show is false → no .box element
    expect(container.querySelector('.box')).toBeNull();

    // No leftover classes on any element in body
    const allEls = Array.from(document.body.querySelectorAll('*'));
    for (const el of allEls) {
      expect(el.classList.contains('v-enter-from')).toBe(false);
      expect(el.classList.contains('v-enter-active')).toBe(false);
      expect(el.classList.contains('v-leave-from')).toBe(false);
      expect(el.classList.contains('v-leave-active')).toBe(false);
    }

    popContextStack();
    cleanupContext(ctx);
  });

  it('a2: 5x rapid toggles end in correct final state with at most 1 element', async () => {
    const show = signal(false);
    const ctx = createContext(null);
    pushContextStack(ctx);
    const anchor = Transition({
      name: 'v',
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

    // 5 rapid toggles starting from false: F→T→F→T→F→T (final value = true)
    show.value = true;
    await Promise.resolve();
    show.value = false;
    await Promise.resolve();
    show.value = true;
    await Promise.resolve();
    show.value = false;
    await Promise.resolve();
    show.value = true;
    await Promise.resolve();

    await rafTick();
    await rafTick();

    // Final show.value = true → exactly 1 element present, not multiple duplicates
    const boxes = container.querySelectorAll('.box');
    expect(boxes.length).toBeLessThanOrEqual(1);
    expect(container.querySelector('.box')).not.toBeNull();

    popContextStack();
    cleanupContext(ctx);
  });

  it('a3: false→true→false without awaiting between toggles then flush rAFs leaves no element and no lingering classes', async () => {
    const show = signal(false);
    const ctx = createContext(null);
    pushContextStack(ctx);
    const anchor = Transition({
      name: 'v',
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

    // Toggle without awaiting between toggles — final value = false
    show.value = true;
    show.value = false;
    // Await once to let the effect system settle the final value
    await Promise.resolve();

    // Flush rAFs
    await rafTick();
    await rafTick();

    // Final state: show is false → no element
    expect(container.querySelector('.box')).toBeNull();

    // No lingering enter/leave classes on any node in body
    const allEls = Array.from(document.body.querySelectorAll('*'));
    for (const el of allEls) {
      expect(el.classList.contains('v-enter-from')).toBe(false);
      expect(el.classList.contains('v-enter-active')).toBe(false);
      expect(el.classList.contains('v-enter-to')).toBe(false);
      expect(el.classList.contains('v-leave-from')).toBe(false);
      expect(el.classList.contains('v-leave-active')).toBe(false);
      expect(el.classList.contains('v-leave-to')).toBe(false);
    }

    popContextStack();
    cleanupContext(ctx);
  });
});

// ---------------------------------------------------------------------------
// Group B — animationend vs transitionend
// ---------------------------------------------------------------------------

describe('transition animationend vs transitionend (B)', () => {
  let container: HTMLElement;
  beforeEach(() => {
    resetEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    if (container.parentNode) container.parentNode.removeChild(container);
  });
  function rafTick() {
    return new Promise<void>((r) => requestAnimationFrame(() => r()));
  }

  it('b1: element with animationDuration uses animationend to complete — onAfterEnter fires on animationend', async () => {
    const show = signal(false);
    const afterEnter = vi.fn();
    const ctx = createContext(null);
    pushContextStack(ctx);
    const anchor = Transition({
      name: 'fade',
      onAfterEnter: afterEnter,
      children: () => {
        if (!show.value) return undefined;
        const el = document.createElement('div');
        el.className = 'box';
        // Set animation but no transition — getTransitionInfo should pick animationend
        el.style.animationDuration = '200ms';
        el.style.animationDelay = '0s';
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
    // Not completed yet — waiting for animationend
    expect(afterEnter).not.toHaveBeenCalled();

    // transitionend should NOT trigger completion
    el.dispatchEvent(new Event('transitionend'));
    expect(afterEnter).not.toHaveBeenCalled();

    // animationend should trigger completion
    el.dispatchEvent(new Event('animationend'));
    expect(afterEnter).toHaveBeenCalledTimes(1);

    popContextStack();
    cleanupContext(ctx);
  });

  it('b2: type="transition" forces transitionend — with only animation set, done() fires immediately (no listener)', async () => {
    const show = signal(false);
    const afterEnter = vi.fn();
    const ctx = createContext(null);
    pushContextStack(ctx);
    const anchor = Transition({
      name: 'fade',
      type: 'transition',
      onAfterEnter: afterEnter,
      children: () => {
        if (!show.value) return undefined;
        const el = document.createElement('div');
        el.className = 'box';
        // Only animation, no transition — type='transition' makes getTransitionInfo return null
        el.style.animationDuration = '200ms';
        el.style.animationDelay = '0s';
        return el;
      },
    });
    container.appendChild(anchor);
    flushMount(ctx);

    show.value = true;
    await Promise.resolve();
    await rafTick();
    await rafTick();

    // With type='transition' and no CSS transition, getTransitionInfo returns null → done() called immediately
    expect(afterEnter).toHaveBeenCalledTimes(1);

    // animationend after the fact has no effect
    const el = container.querySelector('.box') as HTMLElement;
    el.dispatchEvent(new Event('animationend'));
    expect(afterEnter).toHaveBeenCalledTimes(1);

    popContextStack();
    cleanupContext(ctx);
  });

  it('b3: type="animation" forces animationend listener — transitionend alone does not complete', async () => {
    const show = signal(false);
    const afterEnter = vi.fn();
    const ctx = createContext(null);
    pushContextStack(ctx);
    const anchor = Transition({
      name: 'fade',
      type: 'animation',
      onAfterEnter: afterEnter,
      children: () => {
        if (!show.value) return undefined;
        const el = document.createElement('div');
        el.className = 'box';
        el.style.animationDuration = '300ms';
        el.style.animationDelay = '0s';
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
    // Not yet completed
    expect(afterEnter).not.toHaveBeenCalled();

    // transitionend does NOT complete it when type='animation'
    el.dispatchEvent(new Event('transitionend'));
    expect(afterEnter).not.toHaveBeenCalled();

    // animationend completes it
    el.dispatchEvent(new Event('animationend'));
    expect(afterEnter).toHaveBeenCalledTimes(1);

    popContextStack();
    cleanupContext(ctx);
  });
});

// ---------------------------------------------------------------------------
// Group C — missing done() in JS hook (no auto-complete)
// ---------------------------------------------------------------------------

describe('transition missing done() in JS hook (C)', () => {
  let container: HTMLElement;
  beforeEach(() => {
    resetEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    if (container.parentNode) container.parentNode.removeChild(container);
  });
  function rafTick() {
    return new Promise<void>((r) => requestAnimationFrame(() => r()));
  }

  it('c1: onEnter that never calls done() keeps state entering indefinitely — onAfterEnter not fired', async () => {
    const show = signal(false);
    const afterEnter = vi.fn();
    const ctx = createContext(null);
    pushContextStack(ctx);
    const anchor = Transition({
      name: 'fade',
      onEnter: (_el, _done) => {
        /* intentionally never calls done */
      },
      onAfterEnter: afterEnter,
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

    // Wait 100ms — framework must NOT auto-complete the unfinished JS hook
    await new Promise<void>((r) => setTimeout(r, 100));

    expect(afterEnter).not.toHaveBeenCalled();

    popContextStack();
    cleanupContext(ctx);
  });

  it('c2: manually calling the captured done() fires onAfterEnter exactly once', async () => {
    const show = signal(false);
    const afterEnter = vi.fn();
    let capturedDone: (() => void) | null = null;
    const ctx = createContext(null);
    pushContextStack(ctx);
    const anchor = Transition({
      name: 'fade',
      onEnter: (_el, done) => {
        capturedDone = done; /* never auto-calls done */
      },
      onAfterEnter: afterEnter,
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

    expect(afterEnter).not.toHaveBeenCalled();
    expect(capturedDone).not.toBeNull();

    // Manually trigger done
    capturedDone!();
    expect(afterEnter).toHaveBeenCalledTimes(1);

    // Calling done again is idempotent
    capturedDone!();
    expect(afterEnter).toHaveBeenCalledTimes(1);

    popContextStack();
    cleanupContext(ctx);
  });
});

// ---------------------------------------------------------------------------
// Group D — custom class names
// ---------------------------------------------------------------------------

describe('transition custom class names (D)', () => {
  let container: HTMLElement;
  beforeEach(() => {
    resetEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    if (container.parentNode) container.parentNode.removeChild(container);
  });
  function rafTick() {
    return new Promise<void>((r) => requestAnimationFrame(() => r()));
  }

  it('d1: enterFromClass override applies custom class; non-overridden enterActive uses default', async () => {
    const show = signal(false);
    const ctx = createContext(null);
    pushContextStack(ctx);
    const anchor = Transition({
      // No name → defaults to 'v-*'
      enterFromClass: 'x-from',
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

    const el = container.querySelector('.box') as HTMLElement;
    expect(el).not.toBeNull();
    // Custom enterFrom class applied
    expect(el.classList.contains('x-from')).toBe(true);
    // Default enterActive still applied (not overridden)
    expect(el.classList.contains('v-enter-active')).toBe(true);
    // Original default enterFrom NOT present
    expect(el.classList.contains('v-enter-from')).toBe(false);

    popContextStack();
    cleanupContext(ctx);
  });

  it('d2: all 9 class overrides — only custom names appear in each phase, zero v-* classes leak', async () => {
    const show = signal(false);
    const ctx = createContext(null);
    pushContextStack(ctx);
    const anchor = Transition({
      enterFromClass: 'c-ef',
      enterActiveClass: 'c-ea',
      enterToClass: 'c-et',
      appearFromClass: 'c-af',
      appearActiveClass: 'c-aa',
      appearToClass: 'c-at',
      leaveFromClass: 'c-lf',
      leaveActiveClass: 'c-la',
      leaveToClass: 'c-lt',
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

    // --- Enter phase ---
    show.value = true;
    await Promise.resolve();

    const el = container.querySelector('.box') as HTMLElement;
    expect(el).not.toBeNull();

    // Custom enterFrom and enterActive applied
    expect(el.classList.contains('c-ef')).toBe(true);
    expect(el.classList.contains('c-ea')).toBe(true);
    // No default v-* classes leaked
    expect(el.classList.contains('v-enter-from')).toBe(false);
    expect(el.classList.contains('v-enter-active')).toBe(false);

    // After rAFs: enterFrom → enterTo swap
    await rafTick();
    await rafTick();
    expect(el.classList.contains('c-ef')).toBe(false);
    expect(el.classList.contains('c-et')).toBe(true);
    expect(el.classList.contains('c-ea')).toBe(true);
    expect(el.classList.contains('v-enter-to')).toBe(false);

    // Complete enter via transitionend
    el.dispatchEvent(new Event('transitionend'));
    expect(el.classList.contains('c-ea')).toBe(false);
    expect(el.classList.contains('c-et')).toBe(false);

    // --- Leave phase ---
    show.value = false;
    await Promise.resolve();

    expect(el.classList.contains('c-lf')).toBe(true);
    expect(el.classList.contains('c-la')).toBe(true);
    expect(el.classList.contains('v-leave-from')).toBe(false);
    expect(el.classList.contains('v-leave-active')).toBe(false);

    await rafTick();
    await rafTick();
    expect(el.classList.contains('c-lf')).toBe(false);
    expect(el.classList.contains('c-lt')).toBe(true);
    expect(el.classList.contains('v-leave-to')).toBe(false);

    el.dispatchEvent(new Event('transitionend'));
    expect(el.classList.contains('c-la')).toBe(false);
    expect(el.classList.contains('c-lt')).toBe(false);

    popContextStack();
    cleanupContext(ctx);
  });
});

// ---------------------------------------------------------------------------
// Group E — slot returns the same Element identity across runs
// ---------------------------------------------------------------------------

describe('transition stable element reference (E)', () => {
  let container: HTMLElement;
  beforeEach(() => {
    resetEnvironment();
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    if (container.parentNode) container.parentNode.removeChild(container);
  });
  function rafTick() {
    return new Promise<void>((r) => requestAnimationFrame(() => r()));
  }

  it('e1: slot returning same Element reference is a no-op — no enter/leave animation fired', async () => {
    const show = signal(true);
    const stableEl = document.createElement('div');
    stableEl.className = 'stable';
    const afterEnter = vi.fn();
    const afterLeave = vi.fn();
    const ctx = createContext(null);
    pushContextStack(ctx);
    const anchor = Transition({
      name: 'fade',
      onAfterEnter: afterEnter,
      onAfterLeave: afterLeave,
      children: () => {
        if (!show.value) return undefined;
        return stableEl; // always returns the same DOM reference
      },
    });
    container.appendChild(anchor);
    flushMount(ctx);
    await Promise.resolve();

    // Initial mount without appear — stableEl inserted, no animation
    expect(container.querySelector('.stable')).not.toBeNull();
    expect(stableEl.classList.contains('fade-enter-from')).toBe(false);
    expect(stableEl.classList.contains('fade-enter-active')).toBe(false);

    // Simulate a re-render that returns the exact same element — should be a no-op
    // (The effect only re-runs if signals change; here we use show toggle to force re-run)
    show.value = false;
    await Promise.resolve();
    show.value = true;
    await Promise.resolve();
    await rafTick();
    await rafTick();

    // stableEl is back in DOM (leave was synchronous since no CSS)
    expect(container.querySelector('.stable')).not.toBeNull();

    popContextStack();
    cleanupContext(ctx);
  });

  it('e2: swapping to a different element triggers normal enter cycle after leave completes', async () => {
    const show = signal(true);
    let currentRef: HTMLElement = document.createElement('div');
    currentRef.className = 'el-a';
    // No transitionDuration so leave completes synchronously
    const afterEnter = vi.fn();
    const ctx = createContext(null);
    pushContextStack(ctx);
    const anchor = Transition({
      name: 'fade',
      onAfterEnter: afterEnter,
      children: () => {
        if (!show.value) return undefined;
        return currentRef;
      },
    });
    container.appendChild(anchor);
    flushMount(ctx);
    await Promise.resolve();

    // el-a mounted without animation (no appear)
    expect(container.querySelector('.el-a')).not.toBeNull();
    expect(currentRef.classList.contains('fade-enter-active')).toBe(false);

    // Fully leave el-a (synchronous since no CSS transition)
    show.value = false;
    await Promise.resolve();
    expect(container.querySelector('.el-a')).toBeNull(); // synchronous removal confirmed

    // Swap reference to a new element
    const newEl = document.createElement('div');
    newEl.className = 'el-b';
    newEl.style.transitionDuration = '100ms';
    newEl.style.transitionDelay = '0ms';
    currentRef = newEl;

    // Now enter with the new element
    show.value = true;
    await Promise.resolve();

    // el-b should be in DOM and enter animation should have started
    const elB = container.querySelector('.el-b') as HTMLElement;
    expect(elB).not.toBeNull();
    // enter-from and enter-active applied (before rAFs)
    expect(elB.classList.contains('fade-enter-from')).toBe(true);
    expect(elB.classList.contains('fade-enter-active')).toBe(true);

    // After rAFs: enter-from → enter-to swap
    await rafTick();
    await rafTick();
    expect(elB.classList.contains('fade-enter-from')).toBe(false);
    expect(elB.classList.contains('fade-enter-to')).toBe(true);

    popContextStack();
    cleanupContext(ctx);
  });
});
