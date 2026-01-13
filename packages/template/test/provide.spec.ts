import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signal } from '@estjs/signals';
import { createComponent } from '../src/component';
import { template } from '../src/renderer';
import { insert } from '../src/binding';
import { inject, provide } from '../src/provide';
import { createScope, runWithScope, setActiveScope } from '../src/scope';

describe('provide/Inject Update Regression', () => {
  let root: HTMLElement;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
  });

  afterEach(() => {
    document.body.innerHTML = '';
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

    const instance = createComponent(Parent);
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

    const instance = createComponent(Parent);
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

    const instance = createComponent(Parent);
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

    const instance = createComponent(Root);
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

    const instance = createComponent(Level1);
    await instance.mount(root);

    expect(root.textContent).toContain('Leaf:val1-val2-0');

    // Trigger update in Leaf
    updateSignal.value++;
    expect(root.textContent).toContain('Leaf:val1-val2-1');
  });
});

describe('provide/inject edge cases', () => {
  beforeEach(() => {
    // Ensure no active scope before each test
    setActiveScope(null);
  });

  afterEach(() => {
    setActiveScope(null);
  });

  describe('inject default value fallback', () => {
    it('should return default value when key is not found in scope hierarchy', () => {
      const scope = createScope(null);
      const key = Symbol('missing-key');

      const result = runWithScope(scope, () => {
        return inject(key, 'default-value');
      });

      expect(result).toBe('default-value');
    });

    it('should return undefined when key is not found and no default provided', () => {
      const scope = createScope(null);
      const key = Symbol('missing-key');

      const result = runWithScope(scope, () => {
        return inject(key);
      });

      expect(result).toBeUndefined();
    });

    it('should return default value when scope has provides but key is missing', () => {
      const scope = createScope(null);
      const existingKey = Symbol('existing');
      const missingKey = Symbol('missing');

      const result = runWithScope(scope, () => {
        provide(existingKey, 'existing-value');
        return inject(missingKey, 'fallback');
      });

      expect(result).toBe('fallback');
    });
  });

  describe('symbol key lookup', () => {
    it('should find value with symbol key', () => {
      const scope = createScope(null);
      const symbolKey = Symbol('test-symbol');

      const result = runWithScope(scope, () => {
        provide(symbolKey, 'symbol-value');
        return inject(symbolKey);
      });

      expect(result).toBe('symbol-value');
    });

    it('should find value with string key', () => {
      const scope = createScope(null);

      const result = runWithScope(scope, () => {
        provide('string-key', 'string-value');
        return inject('string-key');
      });

      expect(result).toBe('string-value');
    });

    it('should find value with number key', () => {
      const scope = createScope(null);

      const result = runWithScope(scope, () => {
        provide(42, 'number-value');
        return inject(42);
      });

      expect(result).toBe('number-value');
    });
  });

  describe('provide/inject outside component', () => {
    it('should return default value when inject is called without active scope', () => {
      // Ensure no active scope
      setActiveScope(null);

      const result = inject(Symbol('key'), 'default');
      expect(result).toBe('default');
    });

    it('should return undefined when inject is called without active scope and no default', () => {
      setActiveScope(null);

      const result = inject(Symbol('key'));
      expect(result).toBeUndefined();
    });

    it('should not throw when provide is called without active scope', () => {
      setActiveScope(null);

      // Should not throw, just return early
      expect(() => provide(Symbol('key'), 'value')).not.toThrow();
    });
  });

  describe('nested provider shadowing', () => {
    it('should use closest provider value when same key is provided at multiple levels', () => {
      const parentScope = createScope(null);
      const key = Symbol('shadowed-key');

      const result = runWithScope(parentScope, () => {
        provide(key, 'parent-value');

        const childScope = createScope(parentScope);
        return runWithScope(childScope, () => {
          provide(key, 'child-value');
          return inject(key);
        });
      });

      expect(result).toBe('child-value');
    });

    it('should fall back to parent provider when child does not provide', () => {
      const parentScope = createScope(null);
      const key = Symbol('inherited-key');

      const result = runWithScope(parentScope, () => {
        provide(key, 'parent-value');

        const childScope = createScope(parentScope);
        return runWithScope(childScope, () => {
          // Child does not provide, should inherit from parent
          return inject(key);
        });
      });

      expect(result).toBe('parent-value');
    });

    it('should traverse multiple levels to find provider', () => {
      const rootScope = createScope(null);
      const key = Symbol('deep-key');

      const result = runWithScope(rootScope, () => {
        provide(key, 'root-value');

        const level1 = createScope(rootScope);
        return runWithScope(level1, () => {
          const level2 = createScope(level1);
          return runWithScope(level2, () => {
            const level3 = createScope(level2);
            return runWithScope(level3, () => {
              // Should find value from root
              return inject(key);
            });
          });
        });
      });

      expect(result).toBe('root-value');
    });

    it('should return default when no provider exists in hierarchy', () => {
      const rootScope = createScope(null);
      const key = Symbol('nonexistent-key');

      const result = runWithScope(rootScope, () => {
        const childScope = createScope(rootScope);
        return runWithScope(childScope, () => {
          return inject(key, 'default-fallback');
        });
      });

      expect(result).toBe('default-fallback');
    });
  });
});
