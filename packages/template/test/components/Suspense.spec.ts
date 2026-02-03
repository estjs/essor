import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Suspense,
  SuspenseContext,
  type SuspenseContextType,
  isSuspense,
} from '../../src/components/Suspense';
import { inject } from '../../src/provide';
import { createComponent } from '../../src/component';
import { mount, unmount } from '../test-utils';

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
          children: null,
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
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

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

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

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
      expect(isSuspense(() => {})).toBe(false);
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
          children: [document.createElement('div'), null, document.createElement('span')],
        });
      };

      mount(app, container);

      expect(container.querySelector('div')).not.toBeNull();
      expect(container.querySelector('span')).not.toBeNull();
    });
  });

  describe('suspense context increment/decrement', () => {
    it('should show fallback when increment is called and show children when decrement reaches zero', () => {
      let suspenseCtx: SuspenseContextType | null = null;

      // Create a child component that captures the suspense context
      const ChildComponent = () => {
        suspenseCtx = inject(SuspenseContext, null) as unknown as SuspenseContextType;
        const div = document.createElement('div');
        div.className = 'child-content';
        div.textContent = 'Child Content';
        return div;
      };

      const app = () => {
        const fallback = document.createElement('div');
        fallback.className = 'fallback';
        fallback.textContent = 'Loading...';

        return Suspense({
          children: createComponent(ChildComponent),
          fallback,
        });
      };

      mount(app, container);

      // Child should be rendered initially (sync children)
      expect(container.querySelector('.child-content')).not.toBeNull();
      expect(suspenseCtx).not.toBeNull();

      // Call increment to trigger fallback
      suspenseCtx!.increment();

      // Fallback should be shown
      expect(container.querySelector('.fallback')).not.toBeNull();

      // Call decrement to show children again
      suspenseCtx!.decrement();

      // Children should be shown again
      expect(container.querySelector('.fallback')).toBeNull();
    });

    it('should handle multiple increment/decrement calls', () => {
      let suspenseCtx: SuspenseContextType | null = null;

      const ChildComponent = () => {
        suspenseCtx = inject(SuspenseContext, null) as unknown as SuspenseContextType;
        const div = document.createElement('div');
        div.className = 'child-content';
        return div;
      };

      const app = () => {
        const fallback = document.createElement('div');
        fallback.className = 'fallback';

        return Suspense({
          children: createComponent(ChildComponent),
          fallback,
        });
      };

      mount(app, container);

      expect(suspenseCtx).not.toBeNull();

      // Increment twice
      suspenseCtx!.increment();
      suspenseCtx!.increment();

      // Fallback should be shown
      expect(container.querySelector('.fallback')).not.toBeNull();

      // Decrement once - still pending
      suspenseCtx!.decrement();
      expect(container.querySelector('.fallback')).not.toBeNull();

      // Decrement again - should show children
      suspenseCtx!.decrement();
      expect(container.querySelector('.fallback')).toBeNull();
    });
  });

  describe('suspense context register', () => {
    it('should handle promise resolution through register', async () => {
      let suspenseCtx: SuspenseContextType | null = null;
      let resolvePromise: () => void;
      const promise = new Promise<void>(resolve => {
        resolvePromise = resolve;
      });

      const ChildComponent = () => {
        suspenseCtx = inject(SuspenseContext, null) as unknown as SuspenseContextType;
        const div = document.createElement('div');
        div.className = 'child-content';
        return div;
      };

      const app = () => {
        const fallback = document.createElement('div');
        fallback.className = 'fallback';

        return Suspense({
          children: createComponent(ChildComponent),
          fallback,
        });
      };

      mount(app, container);

      expect(suspenseCtx).not.toBeNull();

      // Register a promise
      suspenseCtx!.register(promise);

      // Fallback should be shown
      expect(container.querySelector('.fallback')).not.toBeNull();

      // Resolve the promise
      resolvePromise!();
      await Promise.resolve();

      // Children should be shown
      expect(container.querySelector('.fallback')).toBeNull();
    });

    it('should handle promise rejection through register', async () => {
      let suspenseCtx: SuspenseContextType | null = null;
      let rejectPromise: (error: Error) => void;
      const promise = new Promise<void>((_, reject) => {
        rejectPromise = reject;
      });

      const ChildComponent = () => {
        suspenseCtx = inject(SuspenseContext, null) as unknown as SuspenseContextType;
        const div = document.createElement('div');
        div.className = 'child-content';
        return div;
      };

      const app = () => {
        const fallback = document.createElement('div');
        fallback.className = 'fallback';

        return Suspense({
          children: createComponent(ChildComponent),
          fallback,
        });
      };

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      mount(app, container);

      expect(suspenseCtx).not.toBeNull();

      // Register a promise
      suspenseCtx!.register(promise);

      // Fallback should be shown
      expect(container.querySelector('.fallback')).not.toBeNull();

      // Reject the promise
      rejectPromise!(new Error('Test error'));
      await Promise.resolve().then(() => Promise.resolve());

      // Should still try to show children after error (fallback may remain if no resolved children)
      // The behavior depends on whether there are resolved children
      warnSpy.mockRestore();
    });

    it('should not update after unmount when promise resolves', async () => {
      let resolvePromise: () => void;
      const promise = new Promise<void>(resolve => {
        resolvePromise = resolve;
      });

      let suspenseCtx: SuspenseContextType | null = null;

      const ChildComponent = () => {
        suspenseCtx = inject(SuspenseContext, null) as unknown as SuspenseContextType;
        const div = document.createElement('div');
        div.className = 'child-content';
        return div;
      };

      const app = () => {
        const fallback = document.createElement('div');
        fallback.className = 'fallback';

        return Suspense({
          children: createComponent(ChildComponent),
          fallback,
        });
      };

      const cleanup = mount(app, container);

      expect(suspenseCtx).not.toBeNull();

      // Register a promise
      suspenseCtx!.register(promise);

      // Unmount before promise resolves
      unmount(cleanup);

      // Resolve the promise after unmount
      resolvePromise!();
      await Promise.resolve();

      // Should not throw or cause issues
    });

    it('should not update after unmount when promise rejects', async () => {
      let rejectPromise: (error: Error) => void;
      const promise = new Promise<void>((_, reject) => {
        rejectPromise = reject;
      });

      let suspenseCtx: SuspenseContextType | null = null;

      const ChildComponent = () => {
        suspenseCtx = inject(SuspenseContext, null) as unknown as SuspenseContextType;
        const div = document.createElement('div');
        div.className = 'child-content';
        return div;
      };

      const app = () => {
        const fallback = document.createElement('div');
        fallback.className = 'fallback';

        return Suspense({
          children: createComponent(ChildComponent),
          fallback,
        });
      };

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const cleanup = mount(app, container);

      expect(suspenseCtx).not.toBeNull();

      // Register a promise
      suspenseCtx!.register(promise);

      // Unmount before promise rejects
      unmount(cleanup);

      // Reject the promise after unmount
      rejectPromise!(new Error('Test error'));
      await Promise.resolve().then(() => Promise.resolve());

      // Should not throw or cause issues
      warnSpy.mockRestore();
    });
  });

  describe('cleanup on unmount', () => {
    it('should clear container when component is destroyed', () => {
      const app = () => {
        const content = document.createElement('div');
        content.className = 'content';

        return Suspense({
          children: content,
        });
      };

      const cleanup = mount(app, container);

      // Content should be rendered
      expect(container.querySelector('.content')).not.toBeNull();

      // Unmount
      unmount(cleanup);

      // Container should be cleared (the suspense wrapper is removed)
      const wrapper = container.firstElementChild as HTMLElement;
      if (wrapper) {
        expect(wrapper.childElementCount).toBe(0);
      }
    });
  });

  describe('resolved promise rendering', () => {
    it('should render resolved promise content correctly', async () => {
      const content = document.createElement('div');
      content.className = 'resolved-content';
      content.textContent = 'Resolved!';

      const promise = Promise.resolve(content);

      const app = () => {
        const fallback = document.createElement('div');
        fallback.className = 'fallback';

        return Suspense({
          children: promise,
          fallback,
        });
      };

      mount(app, container);

      // Wait for promise resolution
      await Promise.resolve();

      // Content should be rendered
      expect(container.querySelector('.resolved-content')).not.toBeNull();
      expect(container.querySelector('.resolved-content')?.textContent).toBe('Resolved!');
    });

    it('should handle promise resolving to null', async () => {
      const promise = Promise.resolve(null);

      const app = () => {
        const fallback = document.createElement('div');
        fallback.className = 'fallback';

        return Suspense({
          children: promise,
          fallback,
        });
      };

      mount(app, container);

      // Wait for promise resolution
      await Promise.resolve();

      // Fallback should remain since resolved value is null
      expect(container.querySelector('.fallback')).not.toBeNull();
    });
  });

  describe('multiple async children', () => {
    it('should handle array of promises', async () => {
      const content1 = document.createElement('span');
      content1.className = 'content-1';
      const content2 = document.createElement('span');
      content2.className = 'content-2';

      const promise = Promise.resolve([content1, content2]);

      const app = () => {
        const fallback = document.createElement('div');
        fallback.className = 'fallback';

        return Suspense({
          children: promise,
          fallback,
        });
      };

      mount(app, container);

      // Wait for promise resolution
      await Promise.resolve();

      // Both contents should be rendered
      expect(container.querySelector('.content-1')).not.toBeNull();
      expect(container.querySelector('.content-2')).not.toBeNull();
    });
  });

  describe('fallback updates', () => {
    it('should show fallback when showFallback is called multiple times', () => {
      let suspenseCtx: SuspenseContextType | null = null;

      const ChildComponent = () => {
        suspenseCtx = inject(SuspenseContext, null) as unknown as SuspenseContextType;
        const div = document.createElement('div');
        div.className = 'child-content';
        return div;
      };

      const app = () => {
        const fallback = document.createElement('div');
        fallback.className = 'fallback';
        fallback.textContent = 'Loading...';

        return Suspense({
          children: createComponent(ChildComponent),
          fallback,
        });
      };

      mount(app, container);

      expect(suspenseCtx).not.toBeNull();

      // Call increment multiple times (each calls showFallback internally)
      suspenseCtx!.increment();

      // Fallback should be shown
      expect(container.querySelector('.fallback')).not.toBeNull();
      expect(container.querySelector('.fallback')?.textContent).toBe('Loading...');

      // Calling increment again should not duplicate fallback
      suspenseCtx!.increment();

      const fallbacks = container.querySelectorAll('.fallback');
      expect(fallbacks.length).toBe(1);
    });
  });

  describe('showChildren edge cases', () => {
    it('should not show children when not in fallback mode', () => {
      const app = () => {
        const content = document.createElement('div');
        content.className = 'content';

        return Suspense({
          children: content,
        });
      };

      mount(app, container);

      // Content should be rendered (not in fallback mode)
      expect(container.querySelector('.content')).not.toBeNull();
    });

    it('should handle showChildren when resolvedChildren is set', async () => {
      let resolvePromise: (value: Node) => void;
      const promise = new Promise<Node>(resolve => {
        resolvePromise = resolve;
      });

      const app = () => {
        const fallback = document.createElement('div');
        fallback.className = 'fallback';

        return Suspense({
          children: promise,
          fallback,
        });
      };

      mount(app, container);

      // Fallback should be shown
      expect(container.querySelector('.fallback')).not.toBeNull();

      // Resolve with content
      const content = document.createElement('div');
      content.className = 'resolved';
      resolvePromise!(content);

      await Promise.resolve();

      // Resolved content should be shown
      expect(container.querySelector('.resolved')).not.toBeNull();
      expect(container.querySelector('.fallback')).toBeNull();
    });

    it('should show non-promise children when decrement is called', () => {
      let suspenseCtx: SuspenseContextType | null = null;

      const ChildComponent = () => {
        suspenseCtx = inject(SuspenseContext, null) as unknown as SuspenseContextType;
        const div = document.createElement('div');
        div.className = 'sync-child';
        return div;
      };

      const app = () => {
        const fallback = document.createElement('div');
        fallback.className = 'fallback';

        return Suspense({
          children: createComponent(ChildComponent),
          fallback,
        });
      };

      mount(app, container);

      expect(suspenseCtx).not.toBeNull();

      // Increment to show fallback
      suspenseCtx!.increment();
      expect(container.querySelector('.fallback')).not.toBeNull();

      // Decrement to show children (non-promise path in showChildren)
      suspenseCtx!.decrement();
      expect(container.querySelector('.fallback')).toBeNull();
    });
  });

  describe('renderChildren edge cases', () => {
    it('should handle null children in renderChildren', () => {
      // This tests the early return in renderChildren when children is null
      const app = () => {
        return Suspense({
          children: [null, document.createElement('div')],
        });
      };

      mount(app, container);

      // Should render the non-null child
      expect(container.querySelector('div')).not.toBeNull();
    });

    it('should handle component children with parentContext reparenting', () => {
      const ChildComponent = () => {
        const div = document.createElement('div');
        div.className = 'component-child';
        return div;
      };

      const app = () => {
        return Suspense({
          children: createComponent(ChildComponent),
        });
      };

      mount(app, container);

      // Component child should be rendered
      expect(container.querySelector('.component-child')).not.toBeNull();
    });

    it('should handle fallback mode during renderChildren', async () => {
      // This tests the isShowingFallback check at the end of renderChildren
      // We need to trigger a scenario where renderChildren is called while isShowingFallback is true
      let suspenseCtx: SuspenseContextType | null = null;
      let resolvePromise: () => void;
      const promise = new Promise<void>(resolve => {
        resolvePromise = resolve;
      });

      const ChildComponent = () => {
        suspenseCtx = inject(SuspenseContext, null) as unknown as SuspenseContextType;
        // Register a promise during render to trigger fallback mode
        if (suspenseCtx) {
          suspenseCtx.register(promise);
        }
        const div = document.createElement('div');
        div.className = 'async-child';
        return div;
      };

      const app = () => {
        const fallback = document.createElement('div');
        fallback.className = 'fallback';

        return Suspense({
          children: createComponent(ChildComponent),
          fallback,
        });
      };

      mount(app, container);

      // Fallback should be shown because the child registered a promise
      expect(container.querySelector('.fallback')).not.toBeNull();

      // Resolve the promise
      resolvePromise!();
      await Promise.resolve();

      // Now children should be shown
      expect(container.querySelector('.fallback')).toBeNull();
    });
  });
});
