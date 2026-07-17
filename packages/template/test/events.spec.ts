import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addEventListener, clearDelegatedEvents, delegateEvents } from '../src/events';
import { createScope, disposeScope, runWithScope } from '../src/scope';
import { resetEnvironment } from './test-utils';

describe('event delegation', () => {
  beforeEach(() => {
    resetEnvironment();
    clearDelegatedEvents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('delegates events through document', () => {
    delegateEvents(['click']);

    const container = document.createElement('div');
    const button = document.createElement('button');
    const handler = vi.fn();

    // Set handler on the element using the event name as property
    (button as any)._$click = handler;
    container.appendChild(button);
    document.body.appendChild(container);

    button.dispatchEvent(new Event('click', { bubbles: true }));
    expect(handler).toHaveBeenCalledTimes(1);

    clearDelegatedEvents();
    button.dispatchEvent(new Event('click', { bubbles: true }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not register the same delegated listener twice', () => {
    const addSpy = vi.spyOn(document, 'addEventListener');

    delegateEvents(['click']);
    delegateEvents(['click', 'input']);

    expect(addSpy.mock.calls.filter(([name]) => name === 'click')).toHaveLength(1);
    expect(addSpy.mock.calls.filter(([name]) => name === 'input')).toHaveLength(1);
  });

  it('falls back to walking the DOM tree when composedPath is unavailable', () => {
    delegateEvents(['click']);

    const container = document.createElement('div');
    const button = document.createElement('button');
    const handler = vi.fn();

    (button as any)._$click = handler;
    container.appendChild(button);
    document.body.appendChild(container);

    const event = new Event('click', { bubbles: true });
    Object.defineProperty(event, 'composedPath', {
      configurable: true,
      value: undefined,
    });

    button.dispatchEvent(event);

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('retargets delegated events to host elements for ancestor handlers', () => {
    delegateEvents(['click']);

    const host = document.createElement('section');
    const container = document.createElement('div');
    const button = document.createElement('button');
    const handler = vi.fn((event: Event) => {
      expect(event.target).toBe(host);
      expect(event.currentTarget).toBe(container);
    });

    Object.defineProperty(button, 'host', {
      configurable: true,
      value: host,
    });
    (container as any)._$click = handler;
    container.appendChild(button);
    document.body.appendChild(container);

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('bubbles delegated events through _$host portal boundaries', () => {
    delegateEvents(['click']);

    const outer = document.createElement('div');
    const portalHost = document.createElement('div');
    const portalRoot = document.createElement('div');
    const button = document.createElement('button');
    const calls: string[] = [];

    (portalHost as any)._$click = vi.fn((event: Event) => {
      calls.push('portal-host');
      expect(event.currentTarget).toBe(portalHost);
    });
    (outer as any)._$click = vi.fn((event: Event) => {
      calls.push('outer');
      expect(event.currentTarget).toBe(outer);
    });
    (button as any)._$host = portalHost;

    outer.appendChild(portalHost);
    portalRoot.appendChild(button);
    document.body.append(outer, portalRoot);

    const event = new MouseEvent('click', { bubbles: true });
    Object.defineProperty(event, 'composedPath', {
      configurable: true,
      value: () => [button, portalRoot, document.body, document.documentElement, document, window],
    });

    button.dispatchEvent(event);

    expect(calls).toEqual(['portal-host', 'outer']);
  });

  it('skips delegated handlers on disabled nodes', () => {
    delegateEvents(['click']);

    const button = document.createElement('button');
    const handler = vi.fn();

    button.disabled = true;
    (button as any)._$click = handler;
    document.body.appendChild(button);

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(handler).not.toHaveBeenCalled();
  });

  it('scopes addEventListener cleanup to the active scope', () => {
    const button = document.createElement('button');
    const handler = vi.fn();
    const scope = createScope(null);

    runWithScope(scope, () => {
      addEventListener(button, 'click', handler);
    });

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(handler).toHaveBeenCalledTimes(1);

    disposeScope(scope);

    button.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('addEventListener returns an idempotent disposer (no scope) (BIND-04)', () => {
    const el = document.createElement('button');
    document.body.appendChild(el);
    let hits = 0;

    const dispose = addEventListener(el, 'click', () => {
      hits++;
    });
    el.dispatchEvent(new Event('click'));
    expect(hits).toBe(1);

    dispose();
    dispose(); // idempotent
    el.dispatchEvent(new Event('click'));
    expect(hits).toBe(1);
  });

  describe('evt-01: delegated dispatch restores currentTarget', () => {
    it('removes the simulated currentTarget getter once dispatch completes', () => {
      const container = document.createElement('div');
      const button = document.createElement('button');
      (button as any)._$click = () => {};
      container.appendChild(button);
      document.body.appendChild(container);
      delegateEvents(['click']);

      let duringDispatch: EventTarget | null = null;
      let capturedEvent: Event | null = null;
      (button as any)._$click = (e: Event) => {
        duringDispatch = e.currentTarget;
        capturedEvent = e;
      };

      button.dispatchEvent(new Event('click', { bubbles: true }));

      // Inside the handler the simulated currentTarget pointed at the node.
      expect(duringDispatch).toBe(button);
      // After dispatch the own-property getter must be gone — no stale own
      // descriptor shadowing the Event prototype (EVT-01).
      expect(Object.getOwnPropertyDescriptor(capturedEvent!, 'currentTarget')).toBeUndefined();
      // Prototype getter answers again (null outside dispatch, per DOM spec).
      expect(capturedEvent!.currentTarget).toBeNull();
    });

    it('later non-delegated listeners on the same event see the real currentTarget', () => {
      const container = document.createElement('div');
      const button = document.createElement('button');
      (button as any)._$click = () => {};
      container.appendChild(button);
      document.body.appendChild(container);
      delegateEvents(['click']);

      // A second native listener on document — runs after the delegated
      // handler for the same event object.
      let seen: EventTarget | null = null;
      const onDocClick = (e: Event): void => {
        seen = e.currentTarget;
      };
      document.addEventListener('click', onDocClick);

      button.dispatchEvent(new Event('click', { bubbles: true }));
      document.removeEventListener('click', onDocClick);

      // Without the restore, the leaked getter would report the last walked
      // node (or null→document fallback) instead of the true currentTarget.
      expect(seen).toBe(document);
    });
  });
});
