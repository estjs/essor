import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  beginHydration,
  claimHydrationNode,
  claimHydratedNodes,
  endHydration,
  getHydrationKey,
  getRenderedElement,
  hydrationAnchor,
  hydrationRange,
  isHydrating,
  patchAttrHydrate,
  patchClassHydrate,
  patchStyleHydrate,
  resetHydrationKey,
  runWithHydrationRange,
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

  describe('hyd-03: key claim validates the root tag', () => {
    it('adopts the SSR node when key AND tag match', () => {
      const root = document.createElement('div');
      root.innerHTML = `<div data-hk="0">ok</div>`;
      document.body.appendChild(root);
      beginHydration(root);

      const factory = getRenderedElement('<div>ok</div>');
      expect(factory()).toBe(root.children[0]);

      root.remove();
    });

    it('falls back to CSR and removes the SSR node when the tag mismatches', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const root = document.createElement('div');
      root.innerHTML = `<span data-hk="0">wrong</span>`;
      document.body.appendChild(root);
      const ssrNode = root.children[0];
      beginHydration(root);

      // Template expects a <div>, the registry holds a <span> under key 0.
      const factory = getRenderedElement('<div>right</div>');
      const el = factory();

      expect(el.tagName).toBe('DIV');
      expect(el).not.toBe(ssrNode);
      // The wrong SSR node must not linger next to the CSR replacement.
      expect(ssrNode.isConnected).toBe(false);
      expect(warnSpy).toHaveBeenCalled();

      root.remove();
    });

    it('is case-insensitive on tag names', () => {
      const root = document.createElement('div');
      root.innerHTML = `<section data-hk="0">x</section>`;
      document.body.appendChild(root);
      beginHydration(root);

      const factory = getRenderedElement('<SECTION>x</SECTION>');
      expect(factory()).toBe(root.children[0]);

      root.remove();
    });

    it('adopts an SSR SVG root despite foreign-namespace tagName casing', () => {
      // SVG (and other non-HTML-namespace) elements keep their original
      // lowercase tagName ('svg', not 'SVG'). The root-tag validation must
      // not misread that as a structural mismatch and rebuild the subtree.
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const root = document.createElement('div');
      root.innerHTML = `<svg data-hk="0"><circle r="5"></circle></svg>`;
      document.body.appendChild(root);
      const ssrSvg = root.firstElementChild!;
      expect(ssrSvg.tagName).toBe('svg'); // sanity: foreign namespace casing
      beginHydration(root);

      const factory = getRenderedElement('<svg><circle r="5"></circle></svg>');
      expect(factory()).toBe(ssrSvg);
      expect(ssrSvg.isConnected).toBe(true);
      expect(warnSpy).not.toHaveBeenCalled();

      root.remove();
    });
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

  it('finds only the range start matching the root key, slot, and boundary kind', () => {
    const root = document.createElement('div');
    root.dataset.hk = '7';
    root.append(
      document.createComment('user comment'),
      document.createComment('7-0'),
      document.createComment('@essor:start:c:wrong:0'),
      document.createComment('@essor:start:e:7:0'),
      document.createComment('@essor:start:c:7:1'),
    );
    const matching = document.createComment('@essor:start:c:7:0');
    root.appendChild(matching);
    document.body.appendChild(root);
    beginHydration(root);

    expect(hydrationRange(root, 0, 'comment')).toBe(matching);
    expect(hydrationRange(root, 0, 'tail')).toBeUndefined();
  });

  it('claims a keyed range when the root hydration key contains colons', () => {
    const root = document.createElement('div');
    root.dataset.hk = 'root:child';
    const start = document.createComment('@essor:start:c:root:child:0');
    const ssrNode = document.createElement('strong');
    const rightBoundary = document.createComment('root:child-0');
    root.append(start, ssrNode, rightBoundary);
    document.body.appendChild(root);
    beginHydration(root);

    const rangeStart = hydrationRange(root, 0, 'comment');
    expect(rangeStart).toBe(start);
    const claimed = runWithHydrationRange(root, rightBoundary, rangeStart!, () =>
      claimHydrationNode(document.createElement('strong')),
    );
    expect(claimed).toBe(ssrNode);
    expect(start.isConnected).toBe(false);
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

  it('patches SVG class after hydration via the isSVG flag', () => {
    // Regression: a post-hydration reactive class update on an SVG element hits
    // patchClass(el, ...), whose default `el.className =` path throws because an
    // SVG element's className is a read-only SVGAnimatedString. The compiler now
    // forwards isSVG=true so the runtime routes through setAttribute('class').
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    document.body.appendChild(svg);

    beginHydration(document.body);
    // Suppressed during hydration — matches server markup, no throw.
    expect(() => patchClassHydrate(svg, null, 'icon', true)).not.toThrow();
    endHydration();

    // Post-hydration reactive update: without the flag this throws.
    expect(() => patchClassHydrate(svg, null, 'icon')).toThrow();
    expect(() => patchClassHydrate(svg, null, 'icon', true)).not.toThrow();
    expect(svg.getAttribute('class')).toBe('icon');
  });

  describe('claimHydratedNodes', () => {
    it('keeps legacy empty-text claiming when no paired start is provided', () => {
      const root = document.createElement('div');
      const existing = document.createTextNode('');
      root.appendChild(existing);
      document.body.appendChild(root);
      beginHydration(root);

      const claimed = claimHydratedNodes(root, [document.createTextNode('')]);

      expect(claimed).toEqual([existing]);
      expect([...root.childNodes]).toEqual([existing]);
    });

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

    it('claims empty text nodes inside browser-merged adjacent text', () => {
      const root = document.createElement('div');
      document.body.appendChild(root);

      const merged = document.createTextNode('HelloWorld');
      root.appendChild(merged);

      beginHydration(root);

      const expected = [
        document.createTextNode(''),
        document.createTextNode('Hello'),
        document.createTextNode(''),
        document.createTextNode('World'),
      ];

      const claimed = claimHydratedNodes(root, expected, undefined);

      expect(claimed).not.toBeNull();
      expect(claimed).toHaveLength(4);
      expect(claimed!.map((node) => node.textContent)).toEqual(['', 'Hello', '', 'World']);
      expect([...root.childNodes].map((node) => node.textContent)).toEqual([
        '',
        'Hello',
        '',
        'World',
      ]);

      endHydration();
    });

    // hyd-02: a failed claim removes the ALREADY-CLAIMED tail nodes so the
    // CSR fallback does not duplicate content. The mismatching cursor node is
    // deliberately NOT removed: the backward walk has no left boundary, so on
    // a mismatch the cursor may already sit outside this insert's SSR window
    // (a preceding static sibling, or content owned by an earlier insert) —
    // removing it would destroy nodes this call never owned.
    it('keeps the unclaimed cursor node on a full mismatch (HYD-02)', () => {
      const root = document.createElement('div');
      // SSR rendered a <span>; the client render expects a <div>.
      const ssrSpan = document.createElement('span');
      ssrSpan.textContent = 'ssr';
      root.appendChild(ssrSpan);
      document.body.appendChild(root);
      beginHydration(root);

      const expected = [document.createElement('div')];
      const claimed = claimHydratedNodes(root, expected, undefined);

      expect(claimed).toBeNull();
      // Assertion updated for the cursor-safety fix: the cursor node was
      // never claimed by this call, so it must survive — it may not even
      // belong to this insert's SSR window.
      expect(ssrSpan.isConnected).toBe(true);

      root.remove();
    });

    it('removes already-matched tail nodes on a mid-window mismatch (HYD-02)', () => {
      const root = document.createElement('div');
      // Client expects [div, em]; SSR has [span, em] — em matches (tail) and
      // was claimed, so it is cleaned up. The span is the unclaimed cursor
      // and must survive (assertion updated for the cursor-safety fix).
      const ssrSpan = document.createElement('span');
      const ssrEm = document.createElement('em');
      root.append(ssrSpan, ssrEm);
      document.body.appendChild(root);
      beginHydration(root);

      const expected = [document.createElement('div'), document.createElement('em')];
      const claimed = claimHydratedNodes(root, expected, undefined);

      expect(claimed).toBeNull();
      expect(ssrEm.isConnected).toBe(false);
      expect(ssrSpan.isConnected).toBe(true);

      root.remove();
    });

    it('does not remove preceding static siblings outside the SSR window on mismatch', () => {
      const root = document.createElement('div');
      // A static text node precedes the SSR slot content. The client expects
      // MORE nodes than the SSR window contains, so the backward walk crosses
      // the window's left edge and lands on the static node when it fails.
      const staticText = document.createTextNode('static');
      const ssrSpan = document.createElement('span');
      root.append(staticText, ssrSpan);
      document.body.appendChild(root);
      beginHydration(root);

      const expected = [document.createElement('span'), document.createElement('span')];
      const claimed = claimHydratedNodes(root, expected, undefined);

      expect(claimed).toBeNull();
      // The claimed tail is cleaned up so the CSR fallback cannot duplicate it…
      expect(ssrSpan.isConnected).toBe(false);
      // …but the static neighbor the walk strayed onto is untouched.
      expect(staticText.parentNode).toBe(root);
      expect(root.textContent).toContain('static');

      root.remove();
    });
  });
});
