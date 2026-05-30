import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, hydrate, template } from '../src/renderer';
import { getRenderedElement, isHydrating, resetHydrationKey } from '../src/hydration';
import { onMount } from '../src/lifecycle';
import { onCleanup } from '../src/scope';
import { createComponent } from '../src/component';
import { insertNode } from '../src/dom';
import { inject, provide } from '../src/provide';
import { resetEnvironment } from './test-utils';

describe('renderer utilities', () => {
  beforeEach(() => {
    resetEnvironment();
    resetHydrationKey();
    vi.restoreAllMocks();
  });

  it('creates reusable templates', () => {
    const factory = template('<button>Click</button>');
    const first = factory();
    const second = factory();

    expect(first.isEqualNode(second)).toBe(true);
    expect(first).not.toBe(second);
  });

  it('throws when template is empty', () => {
    const factory = template('');
    expect(() => factory()).toThrow();
  });

  it('mounts application to target element', () => {
    const container = document.createElement('div');
    container.id = 'root';
    document.body.appendChild(container);

    const Root = () => {
      const div = document.createElement('div');
      div.textContent = 'hello';
      return div;
    };

    const instance = createApp(Root, '#root');
    expect(instance).toBeTruthy();
    expect(container.textContent).toBe('hello');
  });

  it('clears non-empty targets, warns in dev, and unmounts mounted content', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const container = document.createElement('div');
    container.innerHTML = '<p>stale</p>';
    document.body.appendChild(container);

    const Root = () => {
      const div = document.createElement('div');
      div.textContent = 'fresh';
      return div;
    };

    const instance = createApp(Root, container);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        '[Essor warn]: Target element is not empty, it will be cleared: [object HTMLDivElement]',
      ),
    );
    expect(container.textContent).toBe('fresh');

    instance?.unmount();

    expect(container.innerHTML).toBe('');
  });

  it('returns undefined when target is missing', () => {
    const result = createApp(() => document.createElement('div'), '#missing');
    expect(result).toBeUndefined();
  });

  it('hydrates an SSR node and leaves hydration mode afterwards', () => {
    const container = document.createElement('div');
    container.id = 'root';
    container.innerHTML = '<div data-hk="0">hello</div>';
    document.body.appendChild(container);

    const existing = container.firstElementChild;
    const Root = () => getRenderedElement('<div>hello</div>')();

    const instance = hydrate(Root, '#root');

    expect(instance).toBeTruthy();
    expect((instance as { root: unknown } | undefined)?.root).toBeDefined();
    expect(container.firstElementChild).toBe(existing);
    expect(isHydrating()).toBe(false);

    (instance as { unmount: () => void } | undefined)?.unmount();
    expect(container.innerHTML).toBe('');
  });

  it('returns undefined when the hydrate target is missing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = hydrate(() => document.createElement('div'), '#missing');

    expect(result).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[essor] hydrate: target element not found: #missing'),
    );
  });

  it('returns undefined when the createApp target is missing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = createApp(() => document.createElement('div'), '#missing');

    expect(result).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Target element not found: #missing'),
    );
  });
});

// ---------------------------------------------------------------------------
// Dependency injection & lifecycle (Solid-style — no app plugin system)
// ---------------------------------------------------------------------------

describe('dependency injection & lifecycle', () => {
  beforeEach(() => {
    resetEnvironment();
    resetHydrationKey();
    vi.restoreAllMocks();
  });

  function mkContainer(): HTMLElement {
    const c = document.createElement('div');
    document.body.appendChild(c);
    return c;
  }

  it('provide() in the root component is visible to a nested child via inject()', () => {
    let seen: number | undefined;

    const Child = () => {
      seen = inject<number>('answer');
      const span = document.createElement('span');
      span.textContent = String(seen);
      return span;
    };

    const Root = () => {
      provide('answer', 42);
      const div = document.createElement('div');
      insertNode(div, createComponent(Child));
      return div;
    };

    createApp(Root, mkContainer());
    expect(seen).toBe(42);
  });

  it('a provider component scopes values to its subtree', () => {
    let seen: string | undefined;

    const Leaf = () => {
      seen = inject<string>('theme');
      return document.createElement('span');
    };

    // ThemeProvider provides, then renders Leaf as a descendant.
    const ThemeProvider = () => {
      provide('theme', 'dark');
      const div = document.createElement('div');
      insertNode(div, createComponent(Leaf));
      return div;
    };

    createApp(ThemeProvider, mkContainer());
    expect(seen).toBe('dark');
  });

  it('inject() returns the default value when the key is absent', () => {
    let seen: string | undefined;
    const Root = () => {
      seen = inject<string>('missing', 'fallback');
      return document.createElement('div');
    };
    createApp(Root, mkContainer());
    expect(seen).toBe('fallback');
  });

  it('onMount in the root component fires after the component mounts', () => {
    const order: string[] = [];
    const Root = () => {
      order.push('render');
      onMount(() => {
        order.push('mount');
      });
      return document.createElement('div');
    };
    createApp(Root, mkContainer());
    expect(order).toEqual(['render', 'mount']);
  });

  it('onCleanup in the root component runs on unmount', () => {
    const cleaned = vi.fn();
    const Root = () => {
      onCleanup(cleaned);
      return document.createElement('div');
    };
    const app = createApp(Root, mkContainer());
    expect(cleaned).not.toHaveBeenCalled();

    app?.unmount();
    expect(cleaned).toHaveBeenCalledTimes(1);
  });
});
