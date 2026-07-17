import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signal } from '@estjs/signals';
import { createComponent, isComponent } from '../src/component';
import { template } from '../src/renderer';
import { insert } from '../src/dom';
import { inject, provide } from '../src/provide';
import { createScope, disposeScope, onCleanup, runWithScope } from '../src/scope';

function expectComponent(node: ReturnType<typeof createComponent>) {
  if (!isComponent(node)) {
    throw new Error('Expected createComponent to return a component instance');
  }
  return node;
}

describe('provide/Inject Update Regression', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    document.body.innerHTML = '';
    vi.restoreAllMocks();
  });

  it('should maintain provided value during updates', async () => {
    const toggle = signal(false);
    const key = Symbol('test-key');

    const Child = () => {
      const value = inject(key, 'default');
      return template(`<div>${value}</div>`)();
    };

    const Parent = () => {
      provide(key, 'provided-value');
      const el = document.createElement('div');
      // Re-create child on toggle to simulate re-insertion/update
      insert(el, () => {
        toggle.value; // dependency
        return createComponent(Child);
      });
      return el;
    };

    const instance = expectComponent(createComponent(Parent));
    await instance.mount(root);

    // Initial render
    expect(root.textContent).toContain('provided-value');

    // Trigger update
    toggle.value = true;

    // Check if value is still provided
    expect(root.textContent).toContain('provided-value');
  });

  it('should handle deep nesting and shadowing', async () => {
    const toggle = signal(false);
    const key = Symbol('test-key');

    const GrandChild = () => {
      const value = inject(key, 'default');
      return template(`<div>${value}</div>`)();
    };

    const Child = () => {
      // Child doesn't provide, just passes through
      return createComponent(GrandChild);
    };

    const ShadowChild = () => {
      provide(key, 'shadowed-value');
      return createComponent(GrandChild);
    };

    const Parent = () => {
      provide(key, 'root-value');
      const el = document.createElement('div');

      insert(el, () => {
        toggle.value; // dependency
        return [createComponent(Child), createComponent(ShadowChild)];
      });
      return el;
    };

    const instance = expectComponent(createComponent(Parent));
    await instance.mount(root);

    // Initial render
    // Child -> GrandChild should see 'root-value'
    // ShadowChild -> GrandChild should see 'shadowed-value'
    expect(root.innerHTML).toContain('<div>root-value</div>');
    expect(root.innerHTML).toContain('<div>shadowed-value</div>');

    // Trigger update
    toggle.value = true;

    // Verify persistence after update
    expect(root.innerHTML).toContain('<div>root-value</div>');
    expect(root.innerHTML).toContain('<div>shadowed-value</div>');
  });
  it('should handle dynamic component switching with deep nesting', async () => {
    const router = signal('A');
    const key = Symbol('test-key');

    const ChildA = () => {
      const value = inject(key, 'default');
      return template(`<div>ChildA:${value}</div>`)();
    };

    const ChildB = () => {
      const value = inject(key, 'default');
      return template(`<div>ChildB:${value}</div>`)();
    };

    const Middle = () => {
      const el = document.createElement('div');
      insert(el, () => {
        return [router.value === 'A' ? createComponent(ChildA) : createComponent(ChildB)];
      });
      return el;
    };

    const Parent = () => {
      provide(key, 'root-value');
      return createComponent(Middle);
    };

    const instance = expectComponent(createComponent(Parent));
    await instance.mount(root);

    // Initial: ChildA
    expect(root.textContent).toContain('ChildA:root-value');

    // Switch to B
    router.value = 'B';
    expect(root.textContent).toContain('ChildB:root-value');
    expect(root.textContent?.includes('ChildA')).toBe(false);

    // Switch back to A
    router.value = 'A';
    expect(root.textContent).toContain('ChildA:root-value');
  });

  it('should handle complex mixed tree with dynamic providers', async () => {
    const showBranch2 = signal(true);
    const themeKey = Symbol('theme');
    const userKey = Symbol('user');

    const DeepChild = () => {
      const theme = inject(themeKey, 'no-theme');
      const user = inject(userKey, 'no-user');
      return template(`<div>Deep:${theme}-${user}</div>`)();
    };

    const DynamicProvider = () => {
      provide(userKey, 'user-alice');
      return createComponent(DeepChild);
    };

    const StaticBranch = () => {
      const theme = inject(themeKey, 'no-theme');
      return template(`<div>Static:${theme}</div>`)();
    };

    const Root = () => {
      provide(themeKey, 'dark');
      const el = document.createElement('div');

      insert(el, [
        createComponent(StaticBranch),
        () =>
          showBranch2.value
            ? [createComponent(DynamicProvider)]
            : template('<div>Fallback</div>')(),
      ]);
      return el;
    };

    const instance = expectComponent(createComponent(Root));
    await instance.mount(root);

    // Initial state
    expect(root.textContent).toContain('Static:dark');
    expect(root.textContent).toContain('Deep:dark-user-alice');

    // Toggle branch 2 off
    showBranch2.value = false;
    expect(root.textContent).toContain('Static:dark');
    expect(root.textContent).toContain('Fallback');
    expect(root.textContent?.includes('Deep')).toBe(false);

    // Toggle branch 2 on
    showBranch2.value = true;
    expect(root.textContent).toContain('Static:dark');
    expect(root.textContent).toContain('Deep:dark-user-alice');
  });

  it('should handle interleaved providers and dynamic updates', async () => {
    const level1Key = Symbol('l1');
    const level2Key = Symbol('l2');
    const updateSignal = signal(0);

    const Leaf = () => {
      const l1 = inject(level1Key, 'fail');
      const l2 = inject(level2Key, 'fail');
      // Dependency on signal to force re-render/effect run
      const el = document.createElement('div');
      insert(el, () => `Leaf:${l1}-${l2}-${updateSignal.value}`);
      return el;
    };

    const Level2 = () => {
      provide(level2Key, 'val2');
      return createComponent(Leaf);
    };

    const Level1 = () => {
      provide(level1Key, 'val1');
      const el = document.createElement('div');
      // Dynamic insert of Level2
      insert(el, () => [createComponent(Level2)]);
      return el;
    };

    const instance = expectComponent(createComponent(Level1));
    await instance.mount(root);

    expect(root.textContent).toContain('Leaf:val1-val2-0');

    // Trigger update in Leaf
    updateSignal.value++;
    expect(root.textContent).toContain('Leaf:val1-val2-1');
  });

  it('should return the default value when a key is absent in the current scope chain', () => {
    const scope = createScope(null);

    runWithScope(scope, () => {
      expect(inject('missing-key', 'fallback')).toBe('fallback');
    });
  });

  it('should guard provide/inject usage outside a scope', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    provide('theme', 'dark');
    expect(inject('theme', 'fallback')).toBe('fallback');

    expect(errorSpy).toHaveBeenCalledTimes(2);
    expect(errorSpy.mock.calls[0]?.[0]).toContain('provide() must be called within a scope');
    expect(errorSpy.mock.calls[1]?.[0]).toContain('inject() must be called within a scope');
  });

  // scope-01: destroy hooks / cleanups still see ancestor scopes via inject()
  // — the parent link is severed only after user callbacks run.
  it('onCleanup sees ancestor provides (SCOPE-01)', () => {
    const key = Symbol('theme');
    const parent = createScope(null);
    let observed: string | undefined;

    runWithScope(parent, () => {
      provide(key, 'dark');
      const child = createScope();
      runWithScope(child, () => {
        onCleanup(() => {
          observed = inject(key, 'missing');
        });
      });
      disposeScope(child);
    });

    expect(observed).toBe('dark');
    disposeScope(parent);
  });

  it('ancestor-driven disposal also preserves inject() during child cleanup (SCOPE-01)', () => {
    const key = Symbol('lang');
    const parent = createScope(null);
    let observed: string | undefined;

    runWithScope(parent, () => {
      provide(key, 'zh');
      const child = createScope();
      runWithScope(child, () => {
        onCleanup(() => {
          observed = inject(key, 'missing');
        });
      });
    });

    // Dispose the PARENT — the child's cleanup runs during the recursive
    // child disposal, before the child is detached from the parent.
    disposeScope(parent);
    expect(observed).toBe('zh');
  });
});
