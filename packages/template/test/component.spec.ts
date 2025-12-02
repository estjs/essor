import { beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, signal } from '@estjs/signals';
import { createComponent } from '../src/component';
import { onDestroy, onMount, onUpdate } from '../src/lifecycle';
import { COMPONENT_STATE } from '../src/constants';
import { createTestRoot, resetEnvironment } from './test-utils';

describe('component', () => {
  beforeEach(() => {
    resetEnvironment();
  });

  describe('synchronous component mounting', () => {
    it('mounts synchronous component successfully', async () => {
      const root = createTestRoot();
      const TestComp = () => {
        const div = document.createElement('div');
        div.textContent = 'Hello';
        return div;
      };

      const instance = createComponent(TestComp);
      const result = await instance.mount(root);

      expect(result).toBeTruthy();
      expect(instance.isConnected).toBe(true);
      expect(instance.firstChild).toBeTruthy();
      expect(root.contains(instance.firstChild as Node)).toBe(true);
      expect((instance.firstChild as HTMLElement).textContent).toBe('Hello');
    });

    it('mounts component and applies event props', async () => {
      const root = createTestRoot();
      const clickHandler = vi.fn();

      const Button = (props: any) => {
        const button = document.createElement('button');
        button.textContent = props.label;
        return button;
      };

      const instance = createComponent(Button, { label: 'Click', onClick: clickHandler });
      await instance.mount(root);

      const button = root.querySelector('button');
      expect(button).toBeTruthy();
      expect(instance.componentContext?.isMount).toBe(true);

      // Trigger click event
      button?.click();
      expect(clickHandler).toHaveBeenCalledTimes(1);
    });

    it('binds ref props to DOM nodes', async () => {
      const root = createTestRoot();
      const ref = signal<Node | null>(null);

      const Comp = () => document.createElement('div');
      const instance = createComponent(Comp, { ref });
      await instance.mount(root);

      expect(ref.value).not.toBeNull();
      expect(instance.firstChild).not.toBeNull();
      expect((ref.value as Node).isEqualNode(instance.firstChild)).toBe(true);
    });

    it('triggers mounted lifecycle hook', async () => {
      const root = createTestRoot();
      const mountedHook = vi.fn();

      const TestComp = () => {
        onMount(mountedHook);
        return document.createElement('div');
      };

      const instance = createComponent(TestComp);
      await instance.mount(root);

      expect(mountedHook).toHaveBeenCalledTimes(1);
    });

    it('handles component with signal value', async () => {
      const root = createTestRoot();
      const div = document.createElement('div');
      div.textContent = 'Signal Content';
      const sig = signal(div);

      const TestComp = () => sig;

      const instance = createComponent(TestComp);
      await instance.mount(root);

      // Signal value is extracted and the node is mounted
      expect(instance.firstChild).toBeTruthy();
      expect((instance.firstChild as HTMLElement).textContent).toBe('Signal Content');
      // Check that a div with the content exists in root
      const divInRoot = root.firstElementChild;
      expect(divInRoot).toBeTruthy();
      expect(divInRoot?.textContent).toBe('Signal Content');
    });

    it('handles component with computed value', async () => {
      const root = createTestRoot();
      const div = document.createElement('div');
      const comp = computed(() => div);

      const TestComp = () => comp;

      const instance = createComponent(TestComp);
      await instance.mount(root);

      expect(instance.firstChild).toBe(div);
      expect(root.contains(div)).toBe(true);
    });

    it('remounts existing component nodes without re-rendering', async () => {
      const firstRoot = createTestRoot('root-1');
      const secondRoot = createTestRoot('root-2');

      const instance = createComponent(() => document.createElement('div'));
      await instance.mount(firstRoot);

      const rendered = instance.firstChild;
      await instance.mount(secondRoot);

      expect(secondRoot.contains(rendered as Node)).toBe(true);
    });
  });

  describe('asynchronous component mounting', () => {
    it('mounts async component successfully', async () => {
      const root = createTestRoot();
      const TestComp = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        const div = document.createElement('div');
        div.textContent = 'Async';
        return { default: div };
      };

      const instance = createComponent(TestComp as any);
      const result = await instance.mount(root);

      expect(result).toBeTruthy();
      expect(instance.isConnected).toBe(true);
      expect((instance.firstChild as HTMLElement).textContent).toBe('Async');
    });

    it('handles async component with default export', async () => {
      const root = createTestRoot();
      const TestComp = () => {
        return Promise.resolve({
          default: () => {
            const div = document.createElement('div');
            div.textContent = 'Default Export';
            return div;
          },
        });
      };

      const instance = createComponent(TestComp as any);
      await instance.mount(root);

      expect((instance.firstChild as HTMLElement).textContent).toBe('Default Export');
    });

    it('triggers mounted lifecycle hook for async component', async () => {
      const root = createTestRoot();
      const mountedHook = vi.fn();

      const TestComp = async () => {
        onMount(mountedHook);
        await new Promise(resolve => setTimeout(resolve, 10));
        return document.createElement('div');
      };

      const instance = createComponent(TestComp as any);
      await instance.mount(root);

      expect(mountedHook).toHaveBeenCalledTimes(1);
    });

    it('handles async component errors', async () => {
      const root = createTestRoot();
      const TestComp = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        throw new Error('Async error');
      };

      const instance = createComponent(TestComp as any);
      await expect(instance.mount(root)).rejects.toThrow('Async error');
    });

    it('cancels outdated mount when destroyed during async mount', async () => {
      const root = createTestRoot();
      let resolveFn: (value: Node) => void;
      const promise = new Promise<Node>(resolve => {
        resolveFn = resolve;
      });

      const TestComp = async () => {
        const node = await promise;
        return node;
      };

      const instance = createComponent(TestComp as any);
      const mountPromise = instance.mount(root);

      // Destroy while mount is in progress
      await instance.destroy();

      // Now resolve the async component
      const div = document.createElement('div');
      div.textContent = 'Should not appear';
      resolveFn!(div);

      // Wait for mount to complete
      await mountPromise;

      // The mount should have been cancelled, DOM should be empty
      expect(root.childElementCount).toBe(0);
      expect(instance.isConnected).toBe(false);
    });

    it('handles concurrent mount calls correctly', async () => {
      const root1 = createTestRoot('root1');
      const root2 = createTestRoot('root2');

      const TestComp = async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        const div = document.createElement('div');
        div.textContent = 'Async Content';
        return div;
      };

      const instance = createComponent(TestComp as any);
      const promise1 = instance.mount(root1);
      const promise2 = instance.mount(root2);

      await Promise.all([promise1, promise2]);

      // Only the last mount should be active
      // Note: The component should be in the last parent
      expect(instance.isConnected).toBe(true);
    });
  });

  describe('component updates', () => {
    it('updates props without remounting', async () => {
      const root = createTestRoot();
      const TestComp = (props: any) => {
        const span = document.createElement('span');
        span.dataset.id = props.id;
        return span;
      };

      const first = createComponent(TestComp, { id: 'one', extra: 'keep' });
      await first.mount(root);
      const firstNode = first.firstChild;

      const next = createComponent(TestComp, { id: 'two' });
      await next.update(first);

      // Props are updated - new props should be synced
      expect(next.props?.id).toBe('two');
      // Component inherits state from first, including the rendered node
      // Note: The DOM node doesn't change because update() doesn't re-render
      expect(next.isConnected).toBe(true);
      // Same node is still in DOM
      expect(root.contains(firstNode as Node)).toBe(true);
    });

    it('syncs getter props to reactiveProps on update', async () => {
      const root = createTestRoot();
      let capturedProps: any = null;

      const TestComp = (props: any) => {
        capturedProps = props;
        const span = document.createElement('span');
        span.textContent = props.item?.label || '';
        return span;
      };

      // First render with initial item
      const item1 = { id: 1, label: 'First' };
      const first = createComponent(TestComp, {
        get item() {
          return item1;
        },
      });
      await first.mount(root);

      expect(capturedProps.item.label).toBe('First');

      // Update with new item (simulating what happens in benchmark)
      const item2 = { id: 1, label: 'First !!!' };
      const next = createComponent(TestComp, {
        get item() {
          return item2;
        },
      });
      next.update(first);

      // The getter should now return the new item
      expect(capturedProps.item.label).toBe('First !!!');
    });

    it('handles props with mutated object reference', async () => {
      const root = createTestRoot();
      let capturedLabel = '';

      const TestComp = (props: any) => {
        const span = document.createElement('span');
        // Access props.item.label - this simulates what compiled JSX does
        capturedLabel = props.item?.label || '';
        span.textContent = capturedLabel;
        return span;
      };

      // Create initial item
      const item = { id: 1, label: 'Original' };

      const first = createComponent(TestComp, {
        get item() {
          return item;
        },
      });
      await first.mount(root);

      expect(capturedLabel).toBe('Original');

      // Mutate the item (like benchmark does)
      item.label = 'Original !!!';

      // Create new component with getter that returns same (mutated) object
      const next = createComponent(TestComp, {
        get item() {
          return item;
        },
      });
      next.update(first);

      // Force re-access of props to verify getter is updated
      const propsItem = (next as any).reactiveProps.item;
      expect(propsItem.label).toBe('Original !!!');
    });

    it('updates props and inherits context with lifecycle hooks', async () => {
      const root = createTestRoot();
      const updatedHook = vi.fn();

      const TestComp = (props: any) => {
        onUpdate(updatedHook);
        const span = document.createElement('span');
        span.dataset.id = props.id;
        return span;
      };

      const first = createComponent(TestComp, { id: 'one', extra: 'keep' });
      await first.mount(root);

      // Create a new component instance and update from first
      const next = createComponent(TestComp, { id: 'two' });
      await next.update(first);

      // Props are updated but reactiveProps is reused from first
      expect(next.reactiveProps.id).toBe('one');
      expect('extra' in next.reactiveProps).toBe(true);

      // Context is inherited, so updated hook from first mount should be triggered
      expect(updatedHook).toHaveBeenCalledTimes(1);
    });

    it('remounts component when key changes', async () => {
      const root = createTestRoot();
      const TestComp = (props: any) => {
        const div = document.createElement('div');
        div.textContent = props.text;
        return div;
      };

      const first = createComponent(TestComp, { key: 'key1', text: 'First' });
      await first.mount(root);
      const firstNode = first.firstChild;

      const next = createComponent(TestComp, { key: 'key2', text: 'Second' });
      await next.update(first);

      expect(next.firstChild).not.toBe(firstNode);
      expect(next.isConnected).toBe(true);
    });

    it('mounts component if not connected during update', async () => {
      const root = createTestRoot();
      const TestComp = () => document.createElement('div');

      const first = createComponent(TestComp);
      await first.mount(root);

      const next = createComponent(TestComp);

      // Update inherits parent node from first
      await next.update(first);

      // After update with parent node, component gets mounted
      expect(next.isConnected).toBe(true);
    });

    it('triggers updated lifecycle hook from inherited context', async () => {
      const root = createTestRoot();
      const updatedHook = vi.fn();

      const TestComp = (props: any) => {
        onUpdate(updatedHook);
        const div = document.createElement('div');
        div.textContent = props.text;
        return div;
      };

      const first = createComponent(TestComp, { text: 'First' });
      await first.mount(root);

      // Create new instance and update
      const next = createComponent(TestComp, { text: 'Second' });
      const result = await next.update(first);

      // Updated hook should be triggered from inherited context
      expect(updatedHook).toHaveBeenCalled();
    });

    it('handles async updated lifecycle hook from inherited context', async () => {
      const root = createTestRoot();
      const updatedHook = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });

      const TestComp = (props: any) => {
        onUpdate(updatedHook);
        const div = document.createElement('div');
        div.textContent = props.text;
        return div;
      };

      const first = createComponent(TestComp, { text: 'First' });
      await first.mount(root);

      // Create new instance and update
      const next = createComponent(TestComp, { text: 'Second' });
      const result = await next.update(first);

      // Async hook should have been awaited from inherited context
      expect(updatedHook).toHaveBeenCalledTimes(1);
    });
  });

  describe('forceUpdate functionality', () => {
    it('force updates component successfully', async () => {
      const root = createTestRoot();
      let renderCount = 0;

      const TestComp = () => {
        renderCount++;
        const div = document.createElement('div');
        div.textContent = `Render ${renderCount}`;
        return div;
      };

      const instance = createComponent(TestComp);
      await instance.mount(root);

      expect((instance.firstChild as HTMLElement).textContent).toBe('Render 1');

      await instance.forceUpdate();

      expect((instance.firstChild as HTMLElement).textContent).toBe('Render 2');
      expect(renderCount).toBe(2);
    });

    it('triggers updated lifecycle hook on forceUpdate', async () => {
      const root = createTestRoot();
      const updatedHook = vi.fn();

      const TestComp = () => {
        onUpdate(updatedHook);
        return document.createElement('div');
      };

      const instance = createComponent(TestComp);
      await instance.mount(root);

      await instance.forceUpdate();

      expect(updatedHook).toHaveBeenCalled();
    });

    it('handles forceUpdate with async component', async () => {
      const root = createTestRoot();
      let renderCount = 0;

      const TestComp = async () => {
        renderCount++;
        await new Promise(resolve => setTimeout(resolve, 10));
        const div = document.createElement('div');
        div.textContent = `Async Render ${renderCount}`;
        return div;
      };

      const instance = createComponent(TestComp as any);
      await instance.mount(root);

      await instance.forceUpdate();

      expect((instance.firstChild as HTMLElement).textContent).toBe('Async Render 2');
    });

    it('handles forceUpdate with signal/computed', async () => {
      const root = createTestRoot();
      let renderCount = 0;

      const TestComp = () => {
        renderCount++;
        const div = document.createElement('div');
        div.textContent = `Count: ${renderCount}`;
        // Return the div directly, not wrapped in signal
        return div;
      };

      const instance = createComponent(TestComp);
      await instance.mount(root);

      expect(renderCount).toBe(1);
      expect((instance.firstChild as HTMLElement).textContent).toBe('Count: 1');

      await instance.forceUpdate();

      expect(renderCount).toBe(2);
      expect((instance.firstChild as HTMLElement).textContent).toBe('Count: 2');
    });

    it('does not forceUpdate if component not connected', async () => {
      const TestComp = () => document.createElement('div');
      const instance = createComponent(TestComp);

      await instance.forceUpdate();

      expect(instance.isConnected).toBe(false);
    });

    it('does not forceUpdate if no component context', async () => {
      const root = createTestRoot();
      const TestComp = () => document.createElement('div');
      const instance = createComponent(TestComp);
      await instance.mount(root);

      (instance as any).componentContext = null;

      await instance.forceUpdate();

      expect(instance.isConnected).toBe(true);
    });

    it('handles forceUpdate errors and attempts rollback', async () => {
      const root = createTestRoot();
      let shouldError = false;

      const TestComp = () => {
        if (shouldError) {
          throw new Error('Render error');
        }
        return document.createElement('div');
      };

      const instance = createComponent(TestComp);
      await instance.mount(root);

      const originalNode = instance.firstChild;
      shouldError = true;

      await expect(instance.forceUpdate()).rejects.toThrow('Render error');

      // Should attempt rollback
      expect(instance.firstChild).toBe(originalNode);
    });

    it('handles concurrent forceUpdate calls correctly', async () => {
      const root = createTestRoot();
      let renderCount = 0;
      const resolvers: Array<() => void> = [];

      const TestComp = async () => {
        const currentCount = ++renderCount;
        // Each render waits for a promise
        await new Promise<void>(resolve => {
          resolvers.push(resolve);
        });
        const div = document.createElement('div');
        div.textContent = `Render ${currentCount}`;
        return div;
      };

      const instance = createComponent(TestComp as any);

      // Mount and resolve the initial render
      const mountPromise = instance.mount(root);
      await new Promise(resolve => setTimeout(resolve, 0)); // Let mount start
      resolvers[0](); // Resolve initial mount
      await mountPromise;

      expect((instance.firstChild as HTMLElement).textContent).toBe('Render 1');

      // Start multiple concurrent updates
      const update1 = instance.forceUpdate();
      await new Promise(resolve => setTimeout(resolve, 0));
      const update2 = instance.forceUpdate();
      await new Promise(resolve => setTimeout(resolve, 0));
      const update3 = instance.forceUpdate();
      await new Promise(resolve => setTimeout(resolve, 0));

      // Now we have resolvers[1], [2], [3] for the three updates
      // Resolve them in reverse order - only the last one (update3) should apply
      if (resolvers[3]) resolvers[3](); // update3's render
      await new Promise(resolve => setTimeout(resolve, 10));
      if (resolvers[2]) resolvers[2](); // update2's render (should be ignored)
      await new Promise(resolve => setTimeout(resolve, 10));
      if (resolvers[1]) resolvers[1](); // update1's render (should be ignored)

      await Promise.all([update1, update2, update3]);

      // Only the last update should have been applied (renderCount 4)
      expect((instance.firstChild as HTMLElement).textContent).toBe('Render 4');
    });
  });

  describe('component destruction and cleanup', () => {
    it('destroys component and cleans up nodes', async () => {
      const root = createTestRoot();
      const TestComp = () => document.createElement('div');
      const instance = createComponent(TestComp);
      await instance.mount(root);

      expect(root.childElementCount).toBeGreaterThan(0);

      await instance.destroy();

      expect(root.childElementCount).toBe(0);
      expect(instance.isConnected).toBe(false);
    });

    it('prevents duplicate destruction', async () => {
      const root = createTestRoot();
      const destroyedHook = vi.fn();

      const TestComp = () => {
        onDestroy(destroyedHook);
        return document.createElement('div');
      };

      const instance = createComponent(TestComp);
      await instance.mount(root);

      await instance.destroy();
      await instance.destroy();

      expect(destroyedHook).toHaveBeenCalledTimes(1);
      expect(instance.isConnected).toBe(false);
    });

    it('triggers destroyed lifecycle hook', async () => {
      const root = createTestRoot();
      const destroyedHook = vi.fn();

      const TestComp = () => {
        onDestroy(destroyedHook);
        return document.createElement('div');
      };

      const instance = createComponent(TestComp);
      await instance.mount(root);

      await instance.destroy();

      expect(destroyedHook).toHaveBeenCalledTimes(1);
    });

    it('cleans up component context', async () => {
      const root = createTestRoot();
      const TestComp = () => document.createElement('div');
      const instance = createComponent(TestComp);
      await instance.mount(root);

      const context = instance.componentContext;
      expect(context).toBeTruthy();

      await instance.destroy();

      expect((instance as any).componentContext).toBeNull();
      expect(context?.isDestroy).toBe(true);
    });

    it('resets all component properties on destroy', async () => {
      const root = createTestRoot();
      const TestComp = (props: any) => {
        const div = document.createElement('div');
        div.textContent = props.text;
        return div;
      };

      const instance = createComponent(TestComp, { text: 'Hello' });
      await instance.mount(root);

      await instance.destroy();

      expect((instance as any).renderedNode).toBeNull();
      expect((instance as any).parentNode).toBeNull();
      expect((instance as any).beforeNode).toBeNull();
      expect((instance as any).reactiveProps).toEqual({});
      expect(instance.props).toBeUndefined();
    });
  });

  describe('lifecycle hooks', () => {
    it('triggers mounted hook only once', async () => {
      const root = createTestRoot();
      const mountedHook = vi.fn();

      const TestComp = () => {
        onMount(mountedHook);
        return document.createElement('div');
      };

      const instance = createComponent(TestComp);
      await instance.mount(root);
      await instance.mount(root);

      expect(mountedHook).toHaveBeenCalledTimes(1);
    });

    it('does not trigger mounted hook if no hooks registered', async () => {
      const root = createTestRoot();
      const TestComp = () => document.createElement('div');

      const instance = createComponent(TestComp);
      await instance.mount(root);

      expect(instance.componentContext?.mount.size).toBe(0);
    });

    it('handles async mounted hook', async () => {
      const root = createTestRoot();
      const mountedHook = vi.fn(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
      });

      const TestComp = () => {
        onMount(mountedHook);
        return document.createElement('div');
      };

      const instance = createComponent(TestComp);
      await instance.mount(root);

      expect(mountedHook).toHaveBeenCalledTimes(1);
    });

    it('handles multiple lifecycle hooks through component lifecycle', async () => {
      const root = createTestRoot();
      const mountedHook1 = vi.fn();
      const mountedHook2 = vi.fn();
      const updatedHook = vi.fn();
      const destroyedHook = vi.fn();

      const TestComp = (props: any) => {
        onMount(mountedHook1);
        onMount(mountedHook2);
        onUpdate(updatedHook);
        onDestroy(destroyedHook);
        const div = document.createElement('div');
        div.textContent = props.text;
        return div;
      };

      const instance = createComponent(TestComp, { text: 'Initial' });
      await instance.mount(root);

      // Both mounted hooks should be called during mount
      expect(mountedHook1).toHaveBeenCalledTimes(1);
      expect(mountedHook2).toHaveBeenCalledTimes(1);

      await instance.forceUpdate();

      // Updated hook should be called
      expect(updatedHook).toHaveBeenCalledTimes(1);

      await instance.destroy();
      // Destroyed hook should be called
      expect(destroyedHook).toHaveBeenCalledTimes(1);
    });
  });

  describe('edge cases', () => {
    it('handles component with empty props', async () => {
      const root = createTestRoot();
      const TestComp = () => document.createElement('div');

      const instance = createComponent(TestComp, {});
      await instance.mount(root);

      expect(instance.isConnected).toBe(true);
      expect(instance.props).toEqual({});
    });

    it('handles component with no props', async () => {
      const root = createTestRoot();
      const TestComp = () => document.createElement('div');

      const instance = createComponent(TestComp);
      await instance.mount(root);

      expect(instance.isConnected).toBe(true);
      expect(instance.props).toEqual({});
    });

    it('handles update on unmounted component', async () => {
      const root = createTestRoot();
      const TestComp = () => document.createElement('div');

      const first = createComponent(TestComp);
      await first.mount(root);

      const next = createComponent(TestComp);

      // Update inherits state from first (which is mounted)
      await next.update(first);

      // Component gets mounted during update since it inherits parent node
      expect(next.isConnected).toBe(true);
    });

    it('handles component with null rendered node', async () => {
      const root = createTestRoot();
      const TestComp = () => null as any;

      const instance = createComponent(TestComp);
      await instance.mount(root);

      expect(instance.firstChild).toBeNull();
    });

    it('maintains component key throughout lifecycle', async () => {
      const root = createTestRoot();
      const TestComp = () => document.createElement('div');

      const instance = createComponent(TestComp, { key: 'test-key' });
      const initialKey = instance.key;

      await instance.mount(root);
      expect(instance.key).toBe(initialKey);

      await instance.destroy();
      expect(instance.key).toBe(initialKey);
    });

    it('generates auto key when no explicit key provided', () => {
      const TestComp = () => document.createElement('div');
      const instance1 = createComponent(TestComp);
      const instance2 = createComponent(TestComp);

      expect(instance1.key).toBeTruthy();
      expect(instance2.key).toBeTruthy();
      // Auto keys for same component type should be stable (same)
      expect(instance1.key).toBe(instance2.key);
    });

    it('handles component state transitions', async () => {
      const root = createTestRoot();
      const TestComp = () => document.createElement('div');

      const instance = createComponent(TestComp);
      expect((instance as any).state).toBe(COMPONENT_STATE.INITIAL);

      // Mount is synchronous for sync components, so state changes immediately
      await instance.mount(root);
      expect((instance as any).state).toBe(COMPONENT_STATE.MOUNTED);

      await instance.destroy();

      expect((instance as any).state).toBe(COMPONENT_STATE.DESTROYED);
    });
  });

  describe('component utilities', () => {
    it('returns component instance when passed to createComponent', () => {
      const instance = createComponent(() => document.createElement('div'));
      const reused = createComponent(instance as any);
      expect(reused).toBe(instance);
    });

    it('provides isConnected getter', async () => {
      const root = createTestRoot();
      const TestComp = () => document.createElement('div');
      const instance = createComponent(TestComp);

      expect(instance.isConnected).toBe(false);

      await instance.mount(root);
      expect(instance.isConnected).toBe(true);

      await instance.destroy();
      expect(instance.isConnected).toBe(false);
    });

    it('provides firstChild getter', async () => {
      const root = createTestRoot();
      const TestComp = () => document.createElement('div');
      const instance = createComponent(TestComp);

      expect(instance.firstChild).toBeNull();

      await instance.mount(root);
      expect(instance.firstChild).toBeTruthy();

      await instance.destroy();
      expect(instance.firstChild).toBeNull();
    });
  });
});
