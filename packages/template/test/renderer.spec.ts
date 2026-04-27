import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp, hydrate, template } from '../src/renderer';
import { getRenderedElement, isHydrating, resetHydrationKey } from '../src/hydration';
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
    expect(container.firstElementChild).toBe(existing);
    expect(isHydrating()).toBe(false);

    instance?.unmount();
    expect(container.innerHTML).toBe('');
  });

  it('returns undefined when the hydrate target is missing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = hydrate(() => document.createElement('div'), '#missing');

    expect(result).toBeUndefined();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Essor warn]: [essor] hydrate: target element not found: #missing'),
    );
  });
});
