import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Portal, isPortal } from '../../src/components/Portal';
import {
  beginHydration,
  consumeTeleportAnchor,
  consumeTeleportBlock,
  endHydration,
} from '../../src/hydration';
import {
  cleanupContext,
  createContext,
  popContextStack,
  pushContextStack,
  resetEnvironment,
} from '../test-utils';

function withHydration<T>(html: string, fn: () => T): T {
  document.body.innerHTML = html;
  beginHydration(document.body);
  try {
    return fn();
  } finally {
    endHydration();
  }
}

function ssrBlocks(...contents: string[]): string {
  return contents.map((c) => `<!--teleport-start-->${c}<!--teleport-end-->`).join('');
}

describe('portal — hydration', () => {
  beforeEach(() => {
    resetEnvironment();
  });

  afterEach(() => {
    endHydration();
  });

  // --- Anchor scanning ---

  describe('anchor scanning', () => {
    it('classifies call-site anchors and target blocks separately', () => {
      withHydration(
        `<section><!--teleport-anchor--></section>` +
          `<div id="modal">${ssrBlocks('<p>A</p>')}</div>`,
        () => {
          const anchor = consumeTeleportAnchor();
          expect(anchor).not.toBeNull();
          expect((anchor as Comment).data).toBe('teleport-anchor');

          const modal = document.querySelector('#modal') as Element;
          const block = consumeTeleportBlock(modal);
          expect(block).not.toBeNull();
          expect(block!.nodes).toHaveLength(1);
          expect((block!.nodes[0] as Element).outerHTML).toBe('<p>A</p>');
        },
      );
    });

    it('keeps multiple Portals to the same target independently delimited', () => {
      withHydration(
        `<!--teleport-anchor--><!--teleport-anchor-->` +
          `<div id="root">${ssrBlocks('<i>1</i>', '<i>2</i>')}</div>`,
        () => {
          expect(consumeTeleportAnchor()).not.toBeNull();
          expect(consumeTeleportAnchor()).not.toBeNull();
          expect(consumeTeleportAnchor()).toBeNull();

          const root = document.querySelector('#root') as Element;
          const b1 = consumeTeleportBlock(root);
          const b2 = consumeTeleportBlock(root);
          expect((b1!.nodes[0] as Element).outerHTML).toBe('<i>1</i>');
          expect((b2!.nodes[0] as Element).outerHTML).toBe('<i>2</i>');
          expect(consumeTeleportBlock(root)).toBeNull();
        },
      );
    });

    it('empty Portal is unambiguous (anchor vs empty block)', () => {
      withHydration(`<!--teleport-anchor--><div id="t">${ssrBlocks('')}</div>`, () => {
        expect(consumeTeleportAnchor()).not.toBeNull();
        expect(consumeTeleportAnchor()).toBeNull();

        const t = document.querySelector('#t') as Element;
        const block = consumeTeleportBlock(t);
        expect(block).not.toBeNull();
        expect(block!.nodes).toHaveLength(0);
      });
    });

    it('handles nested Portal anchor inside an outer block', () => {
      withHydration(
        `<!--teleport-anchor-->` +
          `<div id="outer"><!--teleport-start--><div><!--teleport-anchor--></div><!--teleport-end--></div>` +
          `<div id="inner">${ssrBlocks('<span>i</span>')}</div>`,
        () => {
          expect(consumeTeleportAnchor()).not.toBeNull();
          expect(consumeTeleportAnchor()).not.toBeNull();
          expect(consumeTeleportAnchor()).toBeNull();

          const outer = document.querySelector('#outer') as Element;
          const inner = document.querySelector('#inner') as Element;
          const outerBlock = consumeTeleportBlock(outer);
          const innerBlock = consumeTeleportBlock(inner);
          expect(outerBlock).not.toBeNull();
          expect(outerBlock!.nodes).toHaveLength(1);
          expect((innerBlock!.nodes[0] as Element).outerHTML).toBe('<span>i</span>');
        },
      );
    });

    it('clears anchor queues on endHydration', () => {
      document.body.innerHTML = `<!--teleport-anchor-->`;
      beginHydration(document.body);
      expect(consumeTeleportAnchor()).not.toBeNull();
      endHydration();
      document.body.innerHTML = `<!--teleport-anchor-->`;
      expect(consumeTeleportAnchor()).toBeNull();
    });
  });

  // --- Portal hydrate path ---

  describe('portal hydrate path', () => {
    it('adopts the call-site anchor as placeholder', () => {
      withHydration(
        `<section id="origin"><!--teleport-anchor--></section>` +
          `<div id="t">${ssrBlocks('<p>existing</p>')}</div>`,
        () => {
          const ssrAnchor = document.querySelector('#origin')!.firstChild as Comment;
          expect(ssrAnchor.data).toBe('teleport-anchor');

          const ctx = createContext(null);
          pushContextStack(ctx);
          const placeholder = Portal({
            target: '#t',
            children: document.createElement('p'),
          }) as Comment;
          popContextStack();

          expect(placeholder).toBe(ssrAnchor);
          expect(isPortal(placeholder)).toBe(true);

          const t = document.querySelector('#t')!;
          const paragraphs = t.querySelectorAll('p');
          expect(paragraphs).toHaveLength(1);
          expect(paragraphs[0].textContent).toBe('existing');

          cleanupContext(ctx);
        },
      );
    });

    it('multi-Portal pairs anchors with target blocks by document order', () => {
      withHydration(
        `<section id="origin"><!--teleport-anchor--><!--teleport-anchor--></section>` +
          `<div id="t">${ssrBlocks('<i>A</i>', '<i>B</i>')}</div>`,
        () => {
          const [anchorA, anchorB] = Array.from(
            document.querySelector('#origin')!.childNodes,
          ) as Comment[];

          const ctx = createContext(null);
          pushContextStack(ctx);
          const p1 = Portal({ target: '#t', children: document.createElement('i') }) as Comment;
          const p2 = Portal({ target: '#t', children: document.createElement('i') }) as Comment;
          popContextStack();

          expect(p1).toBe(anchorA);
          expect(p2).toBe(anchorB);

          const items = (document.querySelector('#t') as Element).querySelectorAll('i');
          expect(Array.from(items).map((el) => el.textContent)).toEqual(['A', 'B']);
        },
      );
    });

    it('falls back to CSR mount when no anchor is present (mismatch)', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      withHydration(`<div id="t"></div>`, () => {
        const ctx = createContext(null);
        pushContextStack(ctx);
        const child = document.createElement('span');
        child.textContent = 'csr';
        const placeholder = Portal({ target: '#t', children: child }) as Comment;
        ctx.onMount?.forEach((cb) => cb());
        popContextStack();

        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('hydration mismatch: no <!--teleport-anchor-->'),
        );
        expect(placeholder.data).toBe('portal');
        expect((document.querySelector('#t') as Element).contains(child)).toBe(true);

        cleanupContext(ctx);
      });
      warnSpy.mockRestore();
    });

    it('disabled portals do not consume anchors during hydration', () => {
      withHydration(
        `<section id="origin"><!--teleport-anchor--></section>` +
          `<div id="t">${ssrBlocks('<b>kept</b>')}</div>`,
        () => {
          const ctx = createContext(null);
          pushContextStack(ctx);

          const disabledPlaceholder = Portal({
            target: '#t',
            disabled: true,
            children: document.createTextNode('inline'),
          }) as Comment;
          expect(disabledPlaceholder.data).toBe('portal');

          const normalPlaceholder = Portal({
            target: '#t',
            children: document.createElement('b'),
          }) as Comment;
          expect(normalPlaceholder.data).toBe('teleport-anchor');

          popContextStack();
          cleanupContext(ctx);
        },
      );
    });
  });
});
