import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  beginHydration,
  claimHydratedNodes,
  endHydration,
  getHydrationKey,
  getRenderedElement,
  hydrationAnchor,
  isHydrating,
  patchAttrHydrate,
  patchClassHydrate,
  patchStyleHydrate,
  resetHydrationKey,
} from '../src/hydration';
import { resetEnvironment } from './test-utils';

describe('hydration utilities', () => {
  beforeEach(() => {
    resetEnvironment();
    resetHydrationKey();
    endHydration();
  });

  afterEach(() => {
    endHydration();
    resetHydrationKey();
    vi.restoreAllMocks();
  });

  it('increments and resets hydration keys', () => {
    expect(getHydrationKey()).toBe('0');
    expect(getHydrationKey()).toBe('1');

    resetHydrationKey();

    expect(getHydrationKey()).toBe('0');
  });

  it('reuses SSR nodes during hydration and keeps the first duplicate key', () => {
    const root = document.createElement('div');
    root.innerHTML = `
      <div data-hk="0">first</div>
      <div data-hk="0">second</div>
      <span data-hk="1">third</span>
    `;
    document.body.appendChild(root);

    beginHydration(root);

    const firstFactory = getRenderedElement('<div>client-first</div>');
    const secondFactory = getRenderedElement('<span>client-second</span>');

    expect(isHydrating()).toBe(true);
    expect(firstFactory()).toBe(root.children[0]);
    expect(secondFactory()).toBe(root.children[2]);
  });

  it('falls back to CSR creation and warns when a hydration key is missing', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const root = document.createElement('div');
    root.innerHTML = '<div data-hk="0">server</div>';
    document.body.appendChild(root);

    beginHydration(root);

    const firstFactory = getRenderedElement('<div>server</div>');
    const missingFactory = getRenderedElement('<button class="client">client</button>');

    expect(firstFactory()).toBe(root.firstElementChild);

    const fallback = missingFactory();
    expect(fallback.tagName).toBe('BUTTON');
    expect(fallback.className).toBe('client');
    expect(fallback.textContent).toBe('client');
    expect(fallback).not.toBe(root.firstElementChild);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        '[Essor warn]: [essor] hydration mismatch: no SSR element for key "1"',
      ),
    );
  });

  it('creates reusable CSR templates when not hydrating', () => {
    const factory = getRenderedElement('<button data-role="action">Click</button>');

    const first = factory();
    const second = factory();

    expect(first.tagName).toBe('BUTTON');
    expect((first as HTMLElement).dataset.role).toBe('action');
    expect(first.isEqualNode(second)).toBe(true);
    expect(first).not.toBe(second);
  });

  it('finds markerless hydration anchors with the internal attribute', () => {
    const root = document.createElement('div');
    root.innerHTML = '<div data-hk="0"><form data-idx="row" data-hk-idx="0-0"></form></div>';
    document.body.appendChild(root);

    beginHydration(root);

    const wrapper = root.firstElementChild;
    const form = wrapper?.firstElementChild;
    expect(hydrationAnchor(wrapper, 0)).toBe(form);
  });

  it('suppresses DOM writes during hydration and resumes them afterwards', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);

    beginHydration(document.body);

    patchClassHydrate(el, '', 'active');
    patchAttrHydrate(el, 'title', null, 'hello');
    patchStyleHydrate(el, null, { color: 'red' });

    expect(el.className).toBe('');
    expect(el.getAttribute('title')).toBeNull();
    expect(el.style.color).toBe('');

    endHydration();

    patchClassHydrate(el, '', 'active');
    patchAttrHydrate(el, 'title', null, 'hello');
    patchStyleHydrate(el, null, { color: 'red' });

    expect(el.className).toBe('active');
    expect(el.getAttribute('title')).toBe('hello');
    expect(el.style.color).toBe('red');
  });

  describe('claimHydratedNodes', () => {
    it('splits browser-merged text nodes back to expected boundaries', () => {
      const root = document.createElement('div');
      document.body.appendChild(root);

      // Simulate SSR producing three adjacent text nodes that the browser
      // merges into a single text node: "Hello, beautiful World"
      const merged = document.createTextNode('Hello, beautiful World');
      root.appendChild(merged);

      beginHydration(root);

      const expected = [
        document.createTextNode('Hello, '),
        document.createTextNode('beautiful '),
        document.createTextNode('World'),
      ];

      const claimed = claimHydratedNodes(root, expected, undefined);
      expect(claimed).not.toBeNull();
      expect(claimed).toHaveLength(3);
      expect(claimed![0].textContent).toBe('Hello, ');
      expect(claimed![1].textContent).toBe('beautiful ');
      expect(claimed![2].textContent).toBe('World');

      // All three should be real DOM nodes under the parent
      expect(claimed![0].parentNode).toBe(root);
      expect(claimed![1].parentNode).toBe(root);
      expect(claimed![2].parentNode).toBe(root);

      // DOM order should be preserved
      expect(claimed![0].nextSibling).toBe(claimed![1]);
      expect(claimed![1].nextSibling).toBe(claimed![2]);

      endHydration();
    });
  });
});
