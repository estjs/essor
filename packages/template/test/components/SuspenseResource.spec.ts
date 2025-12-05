import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effect } from '@estjs/signals';
import { Suspense } from '../../src/components/Suspense';
import { createResource } from '../../src/components/createResource';
import { createComponent } from '../../src/component';
import { mount } from '../test-utils';

describe('suspense with createResource', () => {
  let container: HTMLElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
    vi.useRealTimers();
  });

  it('should show fallback when resource is loading', async () => {
    vi.useFakeTimers();

    let resolveResource: (val: string) => void;
    const fetcher = () =>
      new Promise<string>(resolve => {
        resolveResource = resolve;
      });

    const Child = () => {
      const [data] = createResource(fetcher);
      return () => {
        const div = document.createElement('div');
        div.className = 'child';

        effect(() => {
          div.textContent = data() || '';
        });

        return div;
      };
    };

    const App = () => {
      return Suspense({
        fallback: (() => {
          const div = document.createElement('div');
          div.className = 'fallback';
          div.textContent = 'Loading...';
          return div;
        })(),
        children: createComponent(Child),
      });
    };

    mount(App, container);

    // Should show fallback initially
    expect(container.querySelector('.fallback')).not.toBeNull();
    expect(container.querySelector('.child')).toBeNull();

    // Resolve resource
    resolveResource!('Loaded Data');

    // Wait for promise resolution
    await vi.runAllTimersAsync();

    // Should show child
    expect(container.querySelector('.fallback')).toBeNull();
    expect(container.querySelector('.child')).not.toBeNull();
    expect(container.querySelector('.child')?.textContent).toBe('Loaded Data');
  });

  it('should handle multiple resources', async () => {
    vi.useFakeTimers();

    let resolve1: (val: string) => void;
    let resolve2: (val: string) => void;

    const fetcher1 = () => new Promise<string>(r => (resolve1 = r));
    const fetcher2 = () => new Promise<string>(r => (resolve2 = r));

    const Child = () => {
      const [data1] = createResource(fetcher1);
      const [data2] = createResource(fetcher2);

      return () => {
        const div = document.createElement('div');
        div.className = 'child';

        effect(() => {
          div.textContent = `${data1() || ''} ${data2() || ''}`;
        });

        return div;
      };
    };

    const App = () => {
      return Suspense({
        fallback: document.createTextNode('Loading...'),
        children: createComponent(Child),
      });
    };

    mount(App, container);

    expect(container.textContent).toBe('Loading...');

    resolve1!('Hello');
    await vi.runAllTimersAsync();
    // Still loading because resource 2 is pending
    expect(container.textContent).toBe('Loading...');

    resolve2!('World');
    await vi.runAllTimersAsync();

    expect(container.textContent).toBe('Hello World');
  });
});
