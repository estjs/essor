import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, signal } from '@estjs/signals';
import {
  Suspense,
  SuspenseContext,
  isSuspense,
  resolveNodeValue,
} from '../../src/components/Suspense';
import { createComponent } from '../../src/component';
import { inject } from '../../src/provide';
import { mount, unmount } from '../test-utils';

describe('suspense component', () => {
  let container: HTMLElement;

  const render = (factory: () => unknown): void => {
    mount(factory, container);
  };

  const createFallback = (className: string, text = 'Loading...'): HTMLDivElement => {
    const div = document.createElement('div');
    div.className = className;
    div.textContent = text;
    return div;
  };

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('basic rendering', () => {
    it('should resolve nested function children into renderable nodes', () => {
      render(() =>
        Suspense({
          children: [(() => () => 'Nested child') as any],
        }),
      );

      expect(container.textContent).toContain('Nested child');
    });

    it('should render sync children immediately', () => {
      render(() =>
        Suspense({
          children: document.createElement('div'),
        }),
      );

      // Container wrapper with child
      expect(container.querySelector('div')).not.toBeNull();
    });

    it('should render multiple sync children', () => {
      render(() =>
        Suspense({
          children: [document.createElement('span'), document.createElement('p')],
        }),
      );

      expect(container.querySelector('span')).not.toBeNull();
      expect(container.querySelector('p')).not.toBeNull();
    });

    it('should render fallback when no children provided', () => {
      render(() =>
        Suspense({
          fallback: createFallback('fallback'),
        }),
      );

      const fallbackEl = container.querySelector('.fallback');
      expect(fallbackEl).not.toBeNull();
      expect(fallbackEl?.textContent).toBe('Loading...');
    });

    it('should handle null children', () => {
      render(() =>
        Suspense({
          children: null as any,
        }),
      );

      // Wrapper-free: no element wrapper, just the boundary comment anchors.
      expect(container.firstElementChild).toBeNull();
      const comments = [...container.childNodes].filter((n) => n.nodeType === Node.COMMENT_NODE);
      expect(comments.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('async children handling', () => {
    it('should materialize fallback arrays recursively', () => {
      let resolveFn!: (value: Node) => void;
      const label = signal('A');
      const promise = new Promise<Node>((resolve) => {
        resolveFn = resolve;
      });

      render(() =>
        Suspense({
          children: promise,
          fallback: [() => label, document.createTextNode('B')] as any,
        }),
      );

      expect(container.textContent).toContain('AB');

      const content = document.createElement('span');
      content.textContent = 'done';
      resolveFn(content);
    });

    it('should materialize fallback values returned from functions and signals', () => {
      let resolveFn!: (value: Node) => void;
      const status = signal('Loading via signal');
      const promise = new Promise<Node>((resolve) => {
        resolveFn = resolve;
      });

      render(() =>
        Suspense({
          children: promise,
          fallback: (() => status) as any,
        }),
      );

      expect(container.textContent).toContain('Loading via signal');

      const content = document.createElement('span');
      content.textContent = 'Loaded from signal fallback';
      resolveFn(content);
    });

    it('should show fallback while Promise is pending', async () => {
      let resolveFn: (value: Node) => void;
      const promise = new Promise<Node>((resolve) => {
        resolveFn = resolve;
      });

      render(() =>
        Suspense({
          children: promise,
          fallback: createFallback('loading'),
        }),
      );

      // Fallback should be shown
      expect(container.querySelector('.loading')).not.toBeNull();
      expect(container.querySelector('.loading')?.textContent).toBe('Loading...');

      // Resolve promise
      const content = document.createElement('div');
      content.className = 'content';
      content.textContent = 'Loaded!';
      resolveFn!(content);

      // Wait for async resolution
      await Promise.resolve();

      // Content should replace fallback
      expect(container.querySelector('.content')).not.toBeNull();
      expect(container.querySelector('.content')?.textContent).toBe('Loaded!');
      expect(container.querySelector('.loading')).toBeNull();
    });

    it('should handle Promise resolving to array of nodes', async () => {
      const promise = Promise.resolve([
        document.createElement('span'),
        document.createElement('p'),
      ]);

      render(() =>
        Suspense({
          children: promise,
          fallback: document.createElement('div'),
        }),
      );

      // Wait for resolution
      await Promise.resolve();

      expect(container.querySelector('span')).not.toBeNull();
      expect(container.querySelector('p')).not.toBeNull();
    });

    it('should keep fallback on Promise rejection', async () => {
      const promise = Promise.reject(new Error('Load failed'));

      const app = () =>
        Suspense({
          children: promise,
          fallback: createFallback('error-fallback', ''),
        });

      // Suppress console warning
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      render(app);

      // Wait for rejection
      await Promise.resolve().then(() => Promise.resolve());

      // Fallback should still be shown
      expect(container.querySelector('.error-fallback')).not.toBeNull();

      warnSpy.mockRestore();
    });

    it('should clear container on error with no fallback', async () => {
      const promise = Promise.reject(new Error('Load failed'));

      const app = () =>
        Suspense({
          children: promise,
        });

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      render(app);

      // Wait for rejection
      await Promise.resolve().then(() => Promise.resolve());

      // Wrapper-free: no element nodes rendered (no fallback, content rejected).
      expect(container.querySelector('*')).toBeNull();

      warnSpy.mockRestore();
    });

    it('should wait for all registered resource promises before restoring children', async () => {
      let resolveA!: () => void;
      let resolveB!: () => void;
      const promiseA = new Promise<void>((resolve) => {
        resolveA = resolve;
      });
      const promiseB = new Promise<void>((resolve) => {
        resolveB = resolve;
      });

      const ResourceChild = () => {
        const ctx = inject<any>(SuspenseContext, null);
        ctx.register(promiseA);
        ctx.register(promiseB);
        const el = document.createElement('span');
        el.className = 'resource-child';
        el.textContent = 'ready';
        return el;
      };

      const resource = createComponent(ResourceChild);
      render(() =>
        Suspense({
          children: resource as any,
          fallback: createFallback('resource-loading'),
        }),
      );

      expect(container.querySelector('.resource-loading')).not.toBeNull();

      resolveA();
      await Promise.resolve();
      expect(container.querySelector('.resource-loading')).not.toBeNull();
      expect(container.querySelector('.resource-child')).toBeNull();

      resolveB();
      await Promise.resolve();

      expect(container.querySelector('.resource-loading')).toBeNull();
      expect(container.querySelector('.resource-child')?.textContent).toBe('ready');
    });

    it('should restore sync children after increment/decrement style resource tracking', async () => {
      const ResourceChild = () => {
        const ctx = inject<any>(SuspenseContext, null);
        ctx.increment();
        Promise.resolve().then(() => ctx.decrement());

        const el = document.createElement('span');
        el.className = 'increment-child';
        el.textContent = 'increment-ready';
        return el;
      };

      const resource = createComponent(ResourceChild);
      render(() =>
        Suspense({
          children: resource as any,
          fallback: createFallback('increment-loading'),
        }),
      );

      expect(container.querySelector('.increment-loading')).not.toBeNull();
      expect(container.querySelector('.increment-child')).toBeNull();

      await Promise.resolve();

      expect(container.querySelector('.increment-loading')).toBeNull();
      expect(container.querySelector('.increment-child')?.textContent).toBe('increment-ready');
    });

    it('pairs increment release handles so stale releases cannot resolve the boundary early', async () => {
      let releaseA!: () => void;
      let releaseB!: () => void;

      const ResourceChild = () => {
        const ctx = inject<any>(SuspenseContext, null);
        releaseA = ctx.increment();
        releaseB = ctx.increment();

        const el = document.createElement('span');
        el.className = 'paired-child';
        el.textContent = 'paired-ready';
        return el;
      };

      const resource = createComponent(ResourceChild);
      render(() =>
        Suspense({
          children: resource as any,
          fallback: createFallback('paired-loading'),
        }),
      );

      expect(container.querySelector('.paired-loading')).not.toBeNull();
      expect(container.querySelector('.paired-child')).toBeNull();
      expect(typeof releaseA).toBe('function');
      expect(typeof releaseB).toBe('function');

      releaseA();
      await Promise.resolve();
      expect(container.querySelector('.paired-loading')).not.toBeNull();
      expect(container.querySelector('.paired-child')).toBeNull();

      releaseA();
      await Promise.resolve();
      expect(container.querySelector('.paired-loading')).not.toBeNull();
      expect(container.querySelector('.paired-child')).toBeNull();

      releaseB();
      await Promise.resolve();
      expect(container.querySelector('.paired-loading')).toBeNull();
      expect(container.querySelector('.paired-child')?.textContent).toBe('paired-ready');
    });

    it('settles aborted resources without warning', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const ResourceChild = () => {
        const ctx = inject<any>(SuspenseContext, null);
        ctx.register(Promise.reject(new DOMException('Aborted', 'AbortError')));

        const el = document.createElement('span');
        el.className = 'aborted-child';
        el.textContent = 'aborted-ready';
        return el;
      };

      const resource = createComponent(ResourceChild);
      render(() =>
        Suspense({
          children: resource as any,
          fallback: createFallback('aborted-loading'),
        }),
      );

      expect(container.querySelector('.aborted-loading')).not.toBeNull();

      await Promise.resolve();
      await Promise.resolve();

      expect(warnSpy).not.toHaveBeenCalled();
      expect(container.querySelector('.aborted-loading')).toBeNull();
      expect(container.querySelector('.aborted-child')?.textContent).toBe('aborted-ready');

      warnSpy.mockRestore();
    });

    it('ignores stale children promise resolutions after children changes', async () => {
      let resolveFirst!: (value: Node) => void;
      let resolveSecond!: (value: Node) => void;
      const first = new Promise<Node>((resolve) => {
        resolveFirst = resolve;
      });
      const second = new Promise<Node>((resolve) => {
        resolveSecond = resolve;
      });
      const suspense = createComponent(Suspense, {
        children: first,
        fallback: createFallback('switch-loading'),
      } as any);
      const rootScope = mount(() => suspense, container);

      expect(container.querySelector('.switch-loading')).not.toBeNull();

      suspense.update({
        children: second,
        fallback: createFallback('switch-loading'),
      } as any);
      await Promise.resolve();

      const stale = document.createElement('span');
      stale.className = 'stale-content';
      stale.textContent = 'stale';
      resolveFirst(stale);
      await Promise.resolve();
      await Promise.resolve();

      expect(container.querySelector('.stale-content')).toBeNull();
      expect(container.querySelector('.switch-loading')).not.toBeNull();

      const fresh = document.createElement('span');
      fresh.className = 'fresh-content';
      fresh.textContent = 'fresh';
      resolveSecond(fresh);
      await Promise.resolve();
      await Promise.resolve();

      expect(container.querySelector('.switch-loading')).toBeNull();
      expect(container.querySelector('.fresh-content')?.textContent).toBe('fresh');

      unmount(rootScope);
    });

    it('restores fallback ability after sync children throw during update', async () => {
      const pending = new Promise<Node>(() => {});
      const suspense = createComponent(Suspense, {
        children: document.createTextNode('ready'),
        fallback: createFallback('recover-loading'),
      } as any);
      const rootScope = mount(() => suspense, container);
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const ThrowingChild = () => {
        throw new Error('sync child failed');
      };

      suspense.update({
        children: createComponent(ThrowingChild) as any,
        fallback: createFallback('recover-loading'),
      } as any);

      suspense.update({
        children: pending,
        fallback: createFallback('recover-loading'),
      } as any);
      await Promise.resolve();

      expect(container.querySelector('.recover-loading')).not.toBeNull();

      errorSpy.mockRestore();
      unmount(rootScope);
    });
  });

  describe('type checking', () => {
    it('should recursively unwrap function, signal, and computed values', () => {
      const value = signal('Resolved');
      const nested = computed(() => () => value);

      expect(resolveNodeValue(() => nested)).toBe('Resolved');
    });

    it('should have SUSPENSE type marker', () => {
      expect(isSuspense(Suspense)).toBe(true);
    });

    it('should return false for non-Suspense values', () => {
      expect(isSuspense({})).toBe(false);
      expect(isSuspense(null)).toBe(false);
      expect(isSuspense(undefined)).toBe(false);
      expect(isSuspense(() => {})).toBe(false);
    });
  });

  describe('wrapper-free boundary', () => {
    it('renders content directly without an element wrapper', () => {
      const span = document.createElement('span');
      span.textContent = 'content';
      render(() =>
        Suspense({
          children: span,
        }),
      );

      // No `display:contents` div — the content element is a direct child of
      // the container, bounded by comment anchors.
      expect(container.querySelector('div')).toBeNull();
      expect(container.querySelector('span')?.textContent).toBe('content');
      const comments = [...container.childNodes].filter((n) => n.nodeType === Node.COMMENT_NODE);
      expect(comments.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('nested Suspense', () => {
    it('should handle nested Suspense components', async () => {
      const innerPromise = Promise.resolve(document.createElement('span'));

      render(() => {
        const innerSuspense = Suspense({
          children: innerPromise,
          fallback: document.createTextNode('Inner loading...'),
        });

        return Suspense({
          children: innerSuspense as Node,
          fallback: document.createTextNode('Outer loading...'),
        });
      });

      // Wait for inner promise
      await Promise.resolve();

      expect(container.querySelector('span')).not.toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should return the fallback directly during SSR when document is unavailable', () => {
      const originalDocument = global.document;

      try {
        // @ts-expect-error – simulate SSR env
        delete global.document;

        expect(
          Suspense({
            children: Promise.resolve('ignored') as any,
            fallback: 'SSR fallback' as any,
          }),
        ).toBe('SSR fallback');
      } finally {
        global.document = originalDocument;
      }
    });

    it('should ignore async resolutions after the boundary is unmounted', async () => {
      let resolveFn!: (value: Node) => void;
      const promise = new Promise<Node>((resolve) => {
        resolveFn = resolve;
      });

      const scope = mount(
        () =>
          Suspense({
            children: promise,
            fallback: createFallback('teardown-loading'),
          }),
        container,
      );

      expect(container.querySelector('.teardown-loading')).not.toBeNull();

      unmount(scope);

      const content = document.createElement('div');
      content.className = 'late-content';
      content.textContent = 'late';
      resolveFn(content);
      await Promise.resolve();

      expect(container.querySelector('.late-content')).toBeNull();
      expect(container.childElementCount).toBe(0);
    });

    it('should handle undefined children', () => {
      render(() =>
        Suspense({
          children: undefined,
        }),
      );

      // Wrapper-free: only the boundary comment anchors, no element wrapper.
      expect(container.firstElementChild).toBeNull();
      const comments = [...container.childNodes].filter((n) => n.nodeType === Node.COMMENT_NODE);
      expect(comments.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle text node children', () => {
      render(() =>
        Suspense({
          children: document.createTextNode('Hello World'),
        }),
      );

      expect(container.textContent).toContain('Hello World');
    });

    it('should handle mixed children with null values', () => {
      render(() =>
        Suspense({
          children: [document.createElement('div'), null, document.createElement('span')] as any,
        }),
      );

      expect(container.querySelector('div')).not.toBeNull();
      expect(container.querySelector('span')).not.toBeNull();
    });
  });
});
