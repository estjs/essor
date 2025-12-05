import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Suspense, isSuspense } from '../../src/components/Suspense';
import { mount } from '../test-utils';

describe('suspense component', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  describe('basic rendering', () => {
    it('should render sync children immediately', () => {
      const app = () => {
        return Suspense({
          children: document.createElement('div'),
        });
      };

      mount(app, container);

      // Container wrapper with child
      expect(container.querySelector('div')).not.toBeNull();
    });

    it('should render multiple sync children', () => {
      const app = () => {
        return Suspense({
          children: [document.createElement('span'), document.createElement('p')],
        });
      };

      mount(app, container);

      expect(container.querySelector('span')).not.toBeNull();
      expect(container.querySelector('p')).not.toBeNull();
    });

    it('should render fallback when no children provided', () => {
      const app = () => {
        const fallback = document.createElement('div');
        fallback.className = 'fallback';
        fallback.textContent = 'Loading...';

        return Suspense({
          fallback,
        });
      };

      mount(app, container);

      const fallbackEl = container.querySelector('.fallback');
      expect(fallbackEl).not.toBeNull();
      expect(fallbackEl?.textContent).toBe('Loading...');
    });

    it('should handle null children', () => {
      const app = () => {
        return Suspense({
          children: null as any,
        });
      };

      mount(app, container);

      // Should just have the container wrapper
      expect(container.firstElementChild).not.toBeNull();
    });
  });

  describe('async children handling', () => {
    it('should show fallback while Promise is pending', async () => {
      let resolveFn: (value: Node) => void;
      const promise = new Promise<Node>(resolve => {
        resolveFn = resolve;
      });

      const app = () => {
        const fallback = document.createElement('div');
        fallback.className = 'loading';
        fallback.textContent = 'Loading...';

        return Suspense({
          children: promise,
          fallback,
        });
      };

      mount(app, container);

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

      const app = () => {
        return Suspense({
          children: promise,
          fallback: document.createElement('div'),
        });
      };

      mount(app, container);

      // Wait for resolution
      await Promise.resolve();

      expect(container.querySelector('span')).not.toBeNull();
      expect(container.querySelector('p')).not.toBeNull();
    });

    it('should keep fallback on Promise rejection', async () => {
      const promise = Promise.reject(new Error('Load failed'));

      const app = () => {
        const fallback = document.createElement('div');
        fallback.className = 'error-fallback';

        return Suspense({
          children: promise,
          fallback,
        });
      };

      // Suppress console warning
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });

      mount(app, container);

      // Wait for rejection
      await Promise.resolve().then(() => Promise.resolve());

      // Fallback should still be shown
      expect(container.querySelector('.error-fallback')).not.toBeNull();

      warnSpy.mockRestore();
    });

    it('should clear container on error with no fallback', async () => {
      const promise = Promise.reject(new Error('Load failed'));

      const app = () => {
        return Suspense({
          children: promise,
        });
      };

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => { });

      mount(app, container);

      // Wait for rejection
      await Promise.resolve().then(() => Promise.resolve());

      // Container wrapper should exist but be empty
      const wrapper = container.firstElementChild as HTMLElement;
      expect(wrapper).not.toBeNull();
      expect(wrapper.childElementCount).toBe(0);

      warnSpy.mockRestore();
    });
  });

  describe('type checking', () => {
    it('should have SUSPENSE type marker', () => {
      expect(isSuspense(Suspense)).toBe(true);
    });

    it('should return false for non-Suspense values', () => {
      expect(isSuspense({})).toBe(false);
      expect(isSuspense(null)).toBe(false);
      expect(isSuspense(undefined)).toBe(false);
      expect(isSuspense(() => { })).toBe(false);
    });
  });

  describe('container wrapper', () => {
    it('should use display:contents for invisible wrapper', () => {
      const app = () => {
        return Suspense({
          children: document.createElement('span'),
        });
      };

      mount(app, container);

      const wrapper = container.firstElementChild as HTMLElement;
      expect(wrapper).not.toBeNull();
      expect(wrapper.style.display).toBe('contents');
    });
  });

  describe('nested Suspense', () => {
    it('should handle nested Suspense components', async () => {
      const innerPromise = Promise.resolve(document.createElement('span'));

      const app = () => {
        const innerSuspense = Suspense({
          children: innerPromise,
          fallback: document.createTextNode('Inner loading...'),
        });

        return Suspense({
          children: innerSuspense as Node,
          fallback: document.createTextNode('Outer loading...'),
        });
      };

      mount(app, container);

      // Wait for inner promise
      await Promise.resolve();

      expect(container.querySelector('span')).not.toBeNull();
    });
  });

  describe('edge cases', () => {
    it('should handle undefined children', () => {
      const app = () => {
        return Suspense({
          children: undefined,
        });
      };

      mount(app, container);

      expect(container.firstElementChild).not.toBeNull();
    });

    it('should handle text node children', () => {
      const app = () => {
        return Suspense({
          children: document.createTextNode('Hello World'),
        });
      };

      mount(app, container);

      expect(container.textContent).toContain('Hello World');
    });

    it('should handle mixed children with null values', () => {
      const app = () => {
        return Suspense({
          children: [document.createElement('div'), null, document.createElement('span')] as any,
        });
      };

      mount(app, container);

      expect(container.querySelector('div')).not.toBeNull();
      expect(container.querySelector('span')).not.toBeNull();
    });
  });
});
