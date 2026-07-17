import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signal } from '@estjs/signals';
import { Portal, isPortal } from '../../src/components/Portal';
import { onCleanup } from '../../src/scope';
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

    it('returns null for malformed blocks missing teleport-end', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      withHydration(`<div id="t"><!--teleport-start--><p>orphaned</p></div>`, () => {
        const t = document.querySelector('#t') as Element;
        const block = consumeTeleportBlock(t);
        expect(block).toBeNull();
        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('orphaned <!--teleport-start-->'),
        );
      });
      warnSpy.mockRestore();
    });

    it('handles multiple blocks with varying content sizes', () => {
      const html =
        `<!--teleport-anchor--><!--teleport-anchor--><!--teleport-anchor-->` +
        `<div id="t">${ssrBlocks(
          '<span>one</span>',
          '<span>two</span><span>three</span>',
          '',
        )}</div>`;

      withHydration(html, () => {
        // Consume all three anchors
        expect(consumeTeleportAnchor()).not.toBeNull();
        expect(consumeTeleportAnchor()).not.toBeNull();
        expect(consumeTeleportAnchor()).not.toBeNull();
        expect(consumeTeleportAnchor()).toBeNull();

        const t = document.querySelector('#t') as Element;
        const b1 = consumeTeleportBlock(t);
        const b2 = consumeTeleportBlock(t);
        const b3 = consumeTeleportBlock(t);

        expect(b1!.nodes).toHaveLength(1);
        expect(b2!.nodes).toHaveLength(2);
        expect(b3!.nodes).toHaveLength(0);
        expect(consumeTeleportBlock(t)).toBeNull();
      });
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

    it('warns when target is not found during hydration', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      withHydration(`<section><!--teleport-anchor--></section>`, () => {
        const ctx = createContext(null);
        pushContextStack(ctx);
        const placeholder = Portal({
          target: '#nonexistent',
          children: document.createElement('div'),
        }) as Comment;
        popContextStack();

        expect(warnSpy).toHaveBeenCalledWith(
          expect.stringContaining('hydration mismatch: target not found'),
        );
        // Falls back to CSR placeholder
        expect(placeholder.data).toBe('portal');

        cleanupContext(ctx);
      });
      warnSpy.mockRestore();
    });

    it('warns when target has no teleport-start block', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      withHydration(
        `<section><!--teleport-anchor--></section>` +
          `<div id="t"><!-- no teleport blocks here --></div>`,
        () => {
          const ctx = createContext(null);
          pushContextStack(ctx);
          const placeholder = Portal({
            target: '#t',
            children: document.createElement('div'),
          }) as Comment;
          popContextStack();

          expect(warnSpy).toHaveBeenCalledWith(
            expect.stringContaining('hydration mismatch: no <!--teleport-start-->'),
          );
          // Falls back to CSR placeholder
          expect(placeholder.data).toBe('portal');

          cleanupContext(ctx);
        },
      );
      warnSpy.mockRestore();
    });
  });

  // --- HYD-01: hydrated Portal ownership ---
  //
  // A hydrated Portal must have a real owner — scope, reactive effect and
  // cleanup — not just claim the SSR markers and bail. Unmount must remove
  // the teleported DOM; reactive `target`/`disabled` changes must re-mount.

  describe('hyd-01: hydrated Portal ownership', () => {
    function ssrBlock(content: string): string {
      return `<!--teleport-start-->${content}<!--teleport-end-->`;
    }

    /** Run `fn` inside a scope with hydration active; returns the scope. */
    function hydratePortal(html: string, fn: () => void) {
      document.body.innerHTML = html;
      beginHydration(document.body);
      const ctx = createContext(null);
      pushContextStack(ctx);
      try {
        fn();
        // Flush onMount hooks the way createApp would.
        ctx.onMount?.forEach((cb) => cb());
      } finally {
        popContextStack();
        endHydration();
      }
      return ctx;
    }

    it('adopts SSR children in place (no duplication) and keeps them after mount', () => {
      const child = document.createElement('p');
      child.textContent = 'modal';

      hydratePortal(
        `<section><!--teleport-anchor--></section><div id="t">${ssrBlock('<p>modal</p>')}</div>`,
        () => {
          Portal({ target: '#t', children: child });
        },
      );

      const t = document.querySelector('#t')!;
      expect(t.querySelectorAll('p')).toHaveLength(1);
    });

    it('removes the teleported DOM when the owning scope is disposed (no leak)', () => {
      const child = document.createElement('p');
      child.textContent = 'modal';

      const ctx = hydratePortal(
        `<section><!--teleport-anchor--></section><div id="t">${ssrBlock('<p>modal</p>')}</div>`,
        () => {
          Portal({ target: '#t', children: child });
        },
      );

      const t = document.querySelector('#t')!;
      expect(t.querySelectorAll('p')).toHaveLength(1);

      // Unmount — before the fix, the adopted SSR children stayed forever.
      cleanupContext(ctx);

      expect(t.querySelectorAll('p')).toHaveLength(0);
      // The SSR block markers are cleaned up too.
      expect(t.innerHTML).not.toContain('teleport-start');
      expect(t.innerHTML).not.toContain('teleport-end');
    });

    it('reacts to a target change after hydration', () => {
      const child = document.createElement('p');
      child.textContent = 'movable';
      const target = signal('#t1');

      const ctx = hydratePortal(
        `<section><!--teleport-anchor--></section>` +
          `<div id="t1">${ssrBlock('<p>movable</p>')}</div><div id="t2"></div>`,
        () => {
          Portal({ target: () => target.value, children: child });
        },
      );

      expect(document.querySelector('#t1 p')).not.toBeNull();
      expect(document.querySelector('#t2 p')).toBeNull();

      // Reactive target change — before the fix this was silently ignored.
      target.value = '#t2';

      expect(document.querySelector('#t1 p')).toBeNull();
      expect(document.querySelector('#t2 p')).not.toBeNull();

      cleanupContext(ctx);
      expect(document.querySelector('#t2 p')).toBeNull();
    });

    it('reacts to disabled toggling after hydration', () => {
      const child = document.createElement('p');
      child.textContent = 'toggle';
      const disabled = signal(false);

      const ctx = hydratePortal(
        `<section id="origin"><!--teleport-anchor--></section>` +
          `<div id="t">${ssrBlock('<p>toggle</p>')}</div>`,
        () => {
          const anchor = Portal({ target: '#t', children: child });
          // Re-parent check needs the anchor connected — it already is (SSR).
          expect(anchor.isConnected).toBe(true);
          return anchor;
        },
      );

      expect(document.querySelector('#t p')).not.toBeNull();

      // This Portal has a static disabled — verify the effect exists by moving
      // to a reactive one below.
      cleanupContext(ctx);

      // Reactive disabled portal.
      const child2 = document.createElement('p');
      child2.textContent = 'toggle2';
      const ctx2 = hydratePortal(
        `<section id="origin2"><!--teleport-anchor--></section>` +
          `<div id="t2">${ssrBlock('<p>toggle2</p>')}</div>`,
        () => {
          Portal({ target: '#t2', disabled: () => disabled.value, children: child2 });
        },
      );

      expect(document.querySelector('#t2 p')).not.toBeNull();

      disabled.value = true;
      // Children move inline to the call site.
      expect(document.querySelector('#t2 p')).toBeNull();
      expect(document.querySelector('#origin2 p')).not.toBeNull();

      cleanupContext(ctx2);
    });

    it('removes the SSR children when mountAt bails during ancestor disposal', () => {
      // Reaches apply()'s adopted-block else branch: the parent scope is
      // already marked destroyed, an earlier-registered cleanup re-triggers
      // the Portal's still-live effect, apply() consumes the block, and
      // mountAt() silently bails — the SSR child nodes must be removed along
      // with the markers, not left orphaned in the DOM.
      const child = document.createElement('p');
      child.textContent = 'orphan';
      const target = signal<string | undefined>('#t');

      document.body.innerHTML =
        `<section><!--teleport-anchor--></section>` +
        `<div id="t">${'<!--teleport-start--><p>orphan</p><!--teleport-end-->'}</div>`;
      beginHydration(document.body);
      const ctx = createContext(null);
      pushContextStack(ctx);
      try {
        // Registered BEFORE Portal → runs first during disposal, while the
        // Portal's effect is still live and its `disposed` flag still false.
        onCleanup(() => {
          target.value = '#t';
        });
        Portal({ target: () => target.value, children: child });
        // Make the target unresolvable so the mount pass leaves the adopted
        // block unconsumed (defers to a microtask that never wins the race).
        target.value = undefined;
        ctx.onMount?.forEach((cb) => cb());
        // Dispose the owning scope: isDestroyed flips first, then the early
        // cleanup restores the target → effect → apply → mountAt bails.
        cleanupContext(ctx);
      } finally {
        popContextStack();
        endHydration();
      }

      const t = document.querySelector('#t')!;
      expect(t.querySelectorAll('p')).toHaveLength(0);
      expect(t.innerHTML).not.toContain('teleport-start');
      expect(t.innerHTML).not.toContain('teleport-end');
    });
  });
});
