import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, definePlugin, hydrate, template } from '../src/renderer';
import { getRenderedElement, isHydrating, resetHydrationKey } from '../src/hydration';
import { resetEnvironment } from './test-utils';
import type { Plugin } from '../src/types';

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

  it('returns undefined when the createApp target is missing (different prefix from hydrate)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = createApp(() => document.createElement('div'), '#missing');

    expect(result).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[essor] createApp: target element not found: #missing'),
    );
  });
});

// ---------------------------------------------------------------------------
// Plugin system (config-object form)
// ---------------------------------------------------------------------------

describe('plugin system', () => {
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

  const Root = () => {
    const div = document.createElement('div');
    div.textContent = 'root';
    return div;
  };

  function syncMount(opts: Parameters<typeof createApp<{}>>[1]): void {
    // Helper: createApp(Root, opts).mount(c) — must be sync when no async setup is used.
    const result = createApp(Root, opts as object).mount(mkContainer());
    if (result instanceof Promise) throw new Error('Expected sync mount but got Promise');
  }

  it('runs a plugin with options', () => {
    const seen: unknown[] = [];
    const plugin = definePlugin<{ token: string }>({
      name: 'auth',
      setup(_ctx, options) {
        seen.push(options);
      },
    });

    syncMount({ plugins: [[plugin, { token: 'abc' }]] });
    expect(seen).toEqual([{ token: 'abc' }]);
  });

  it('runs a bare plugin (no options)', () => {
    const seen: unknown[] = [];
    const plugin = definePlugin({
      name: 'simple',
      setup(_ctx, options) {
        seen.push(options);
      },
    });

    syncMount({ plugins: [plugin] });
    expect(seen).toEqual([undefined]);
  });

  it('skips duplicate plugin name with a dev warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const installs = vi.fn();
    const plugin: Plugin = { name: 'dup', setup: installs };

    syncMount({ plugins: [plugin, plugin] });

    expect(installs).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Plugin "dup" is already registered, skipping'),
    );
  });

  it('skips two distinct plugin objects sharing a name', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const a: Plugin = { name: 'shared', setup: vi.fn() };
    const b: Plugin = { name: 'shared', setup: vi.fn() };

    syncMount({ plugins: [a, b] });

    expect(a.setup).toHaveBeenCalledTimes(1);
    expect(b.setup).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Plugin "shared" is already registered, skipping'),
    );
  });

  it('different-name plugins both install', () => {
    const installsA = vi.fn();
    const installsB = vi.fn();
    syncMount({
      plugins: [
        { name: 'a', setup: installsA },
        { name: 'b', setup: installsB },
      ],
    });
    expect(installsA).toHaveBeenCalledTimes(1);
    expect(installsB).toHaveBeenCalledTimes(1);
  });

  it('enforce buckets: pre runs before default runs before post', () => {
    const order: string[] = [];
    syncMount({
      plugins: [
        { name: 'p1', enforce: 'post', setup: () => order.push('post') },
        { name: 'p2', setup: () => order.push('default') },
        { name: 'p3', enforce: 'pre', setup: () => order.push('pre') },
      ],
    });
    expect(order).toEqual(['pre', 'default', 'post']);
  });

  it('within a bucket, array order is preserved (stable sort)', () => {
    const order: string[] = [];
    syncMount({
      plugins: [
        { name: 'a', enforce: 'pre', setup: () => order.push('a') },
        { name: 'b', enforce: 'pre', setup: () => order.push('b') },
        { name: 'c', enforce: 'pre', setup: () => order.push('c') },
      ],
    });
    expect(order).toEqual(['a', 'b', 'c']);
  });

  it('routes plugin install errors to config.errorHandler with structured info', () => {
    const errorHandler = vi.fn();
    const boom: Plugin = {
      name: 'boom',
      setup() {
        throw new Error('boom!');
      },
    };
    syncMount({ plugins: [boom], config: { errorHandler } });

    expect(errorHandler).toHaveBeenCalledTimes(1);
    const [info, err] = errorHandler.mock.calls[0];
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('boom!');
    expect(info).toEqual({ phase: 'install', plugin: 'boom' });
  });

  it('re-throws install errors when no errorHandler is configured', () => {
    const boom: Plugin = {
      name: 'boom',
      setup() {
        throw new Error('boom!');
      },
    };
    expect(() => syncMount({ plugins: [boom] })).toThrow('boom!');
  });

  it('ctx.error throws and aborts the plugin', () => {
    const errorHandler = vi.fn();
    const plugin: Plugin = {
      name: 'fail',
      setup(ctx) {
        ctx.error('cannot start');
      },
    };
    syncMount({ plugins: [plugin], config: { errorHandler } });

    expect(errorHandler).toHaveBeenCalledTimes(1);
    const [info, err] = errorHandler.mock.calls[0];
    expect((err as Error).message).toBe('cannot start');
    expect(info).toEqual({ phase: 'install', plugin: 'fail' });
  });

  it('ctx.warn routes to config.warnHandler with plugin attribution', () => {
    const warnHandler = vi.fn();
    const plugin: Plugin = {
      name: 'noisy',
      setup(ctx) {
        ctx.warn('something off');
      },
    };
    syncMount({ plugins: [plugin], config: { warnHandler } });

    expect(warnHandler).toHaveBeenCalledTimes(1);
    expect(warnHandler).toHaveBeenCalledWith({ plugin: 'noisy' }, 'something off');
  });

  it('definePlugin is the identity function at runtime', () => {
    const plugin = { name: 'x', setup() {} };
    expect(definePlugin(plugin)).toBe(plugin);
  });

  it('an enforce:pre plugin can ctx.provide values that later plugins read', () => {
    let injected: number | undefined;
    const provider: Plugin = {
      name: 'provider',
      enforce: 'pre',
      setup(ctx) {
        ctx.provide('answer', 42);
      },
    };
    const reader: Plugin = {
      name: 'reader',
      setup(ctx) {
        injected = ctx.inject<number>('answer');
      },
    };
    syncMount({ plugins: [reader, provider] });
    expect(injected).toBe(42);
  });

  it('async setup is awaited, mount returns a Promise', async () => {
    const order: string[] = [];
    const slow: Plugin = {
      name: 'slow',
      async setup() {
        order.push('start');
        await Promise.resolve();
        order.push('end');
      },
    };
    const fast: Plugin = {
      name: 'fast',
      setup() {
        order.push('fast');
      },
    };

    const result = createApp(Root, { plugins: [slow, fast] }).mount(mkContainer());
    expect(result).toBeInstanceOf(Promise);
    await result;
    expect(order).toEqual(['start', 'end', 'fast']);
  });

  it('hydrate with async plugin: setups run BEFORE hydration mode opens', async () => {
    // Regression: an earlier version called beginHydration() before any plugin
    // setup, which made async plugin work race against hydration cursor state.
    const seen: boolean[] = [];
    const plugin: Plugin = {
      name: 'observer',
      async setup() {
        seen.push(isHydrating());
        await Promise.resolve();
        seen.push(isHydrating());
      },
    };
    const container = document.createElement('div');
    container.id = 'hroot';
    container.innerHTML = '<div data-hk="0">x</div>';
    document.body.appendChild(container);
    const Hydratable = () => getRenderedElement('<div>x</div>')();

    const result = createApp(Hydratable, { plugins: [plugin] }).hydrate('#hroot');
    expect(result).toBeInstanceOf(Promise);
    await result;
    expect(seen).toEqual([false, false]); // hydration mode never on during setup
    expect(isHydrating()).toBe(false);    // and not stuck on afterwards
  });

  it('ctx.version reflects the build-injected __VERSION__', () => {
    let captured: string | undefined;
    const plugin: Plugin = {
      name: 'inspect',
      setup(ctx) {
        captured = ctx.version;
      },
    };
    syncMount({ plugins: [plugin] });
    // vitest.config.ts sets __VERSION__ to '0.0.0'
    expect(captured).toBe('0.0.0');
  });

  it('onMount callbacks run after the root component mounts', () => {
    const order: string[] = [];
    const plugin: Plugin = {
      name: 'lifecycle',
      setup(ctx) {
        order.push('setup');
        ctx.onMount(() => order.push('mount'));
      },
    };
    syncMount({ plugins: [plugin] });
    expect(order).toEqual(['setup', 'mount']);
  });

  it('onMount errors are routed to errorHandler with phase=mount', () => {
    const errorHandler = vi.fn();
    const plugin: Plugin = {
      name: 'broken',
      setup(ctx) {
        ctx.onMount(() => {
          throw new Error('mount-fail');
        });
      },
    };
    syncMount({ plugins: [plugin], config: { errorHandler } });

    expect(errorHandler).toHaveBeenCalledTimes(1);
    const [info, err] = errorHandler.mock.calls[0];
    expect((err as Error).message).toBe('mount-fail');
    expect(info).toEqual({ phase: 'mount' });
  });
});
