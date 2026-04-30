import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signal } from '@estjs/signals';
import { Portal, isPortal } from '../../src/components/Portal';
import {
  cleanupContext,
  createContext,
  popContextStack,
  pushContextStack,
  resetEnvironment,
} from '../test-utils';

function flushMount(scope: any): void {
  scope.onMount?.forEach((cb: () => void) => cb());
  scope.children?.forEach((c: any) => flushMount(c));
}

describe('portal', () => {
  let portalTarget: HTMLElement;
  let altTarget: HTMLElement;

  beforeEach(() => {
    resetEnvironment();
    portalTarget = document.createElement('div');
    portalTarget.id = 'portal-target';
    document.body.appendChild(portalTarget);

    altTarget = document.createElement('div');
    altTarget.id = 'alt-target';
    document.body.appendChild(altTarget);
  });

  afterEach(() => {
    portalTarget.remove();
    altTarget.remove();
  });

  // --- Static target ---

  describe('static target', () => {
    it('renders children into Element target', () => {
      const ctx = createContext(null);
      pushContextStack(ctx);
      Portal({ target: portalTarget, children: document.createElement('div') });
      flushMount(ctx);
      expect(portalTarget.innerHTML).toBe('<div></div>');
      popContextStack();
    });

    it('renders children into selector string target', () => {
      const ctx = createContext(null);
      pushContextStack(ctx);
      Portal({ target: '#portal-target', children: document.createTextNode('content') });
      flushMount(ctx);
      expect(portalTarget.textContent).toBe('content');
      popContextStack();
    });

    it('warns and skips mount when target is missing', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const ctx = createContext(null);
      pushContextStack(ctx);
      const placeholder = Portal({
        target: '#non-existent',
        children: document.createElement('div'),
      }) as Comment;
      document.body.appendChild(placeholder);
      flushMount(ctx);
      await Promise.resolve();
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Portal] Target element not found: #non-existent'),
      );
      warnSpy.mockRestore();
      placeholder.remove();
      popContextStack();
    });

    it('returns a Portal-marked Comment placeholder', () => {
      const ctx = createContext(null);
      pushContextStack(ctx);
      const node = Portal({ target: document.body });
      popContextStack();
      expect(node).toBeInstanceOf(Comment);
      expect(isPortal(node)).toBe(true);
      expect(isPortal(document.createElement('div'))).toBe(false);
      expect(isPortal(null)).toBe(false);
    });
  });

  // --- disabled prop ---

  describe('disabled prop', () => {
    it('renders inline at placeholder location when disabled=true', () => {
      const host = document.createElement('section');
      document.body.appendChild(host);

      const ctx = createContext(null);
      pushContextStack(ctx);
      const child = document.createElement('span');
      child.textContent = 'inline';
      const placeholder = Portal({
        target: portalTarget,
        disabled: true,
        children: child,
      }) as Comment;
      host.appendChild(placeholder);
      flushMount(ctx);

      expect(portalTarget.innerHTML).toBe('');
      expect(host.contains(child)).toBe(true);
      expect(child.nextSibling).toBe(placeholder);

      popContextStack();
    });

    it('toggling disabled re-mounts between inline and target', () => {
      const host = document.createElement('section');
      document.body.appendChild(host);

      const $disabled = signal(false);

      const ctx = createContext(null);
      pushContextStack(ctx);
      const child = document.createElement('b');
      child.textContent = 'switch';
      const placeholder = Portal({
        target: portalTarget,
        disabled: () => $disabled.value,
        children: child,
      }) as Comment;
      host.appendChild(placeholder);
      flushMount(ctx);

      expect(portalTarget.contains(child)).toBe(true);
      expect(host.contains(child)).toBe(false);

      $disabled.value = true;
      expect(portalTarget.contains(child)).toBe(false);
      expect(host.contains(child)).toBe(true);

      $disabled.value = false;
      expect(portalTarget.contains(child)).toBe(true);
      expect(host.contains(child)).toBe(false);

      popContextStack();
    });
  });

  // --- Reactive target ---

  describe('reactive target', () => {
    it('changing target getter re-mounts to the new element', () => {
      const $useAlt = signal(false);

      const ctx = createContext(null);
      pushContextStack(ctx);
      const child = document.createElement('em');
      child.textContent = 'move';
      Portal({
        target: () => ($useAlt.value ? altTarget : portalTarget),
        children: child,
      });
      flushMount(ctx);

      expect(portalTarget.contains(child)).toBe(true);
      expect(altTarget.contains(child)).toBe(false);

      $useAlt.value = true;

      expect(portalTarget.children).toHaveLength(0);
      expect(altTarget.contains(child)).toBe(true);

      popContextStack();
    });

    it('handles target getter returning null gracefully', () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const $target = signal<string | null>('#portal-target');

      const ctx = createContext(null);
      pushContextStack(ctx);
      const child = document.createElement('span');
      child.textContent = 'nullable';
      const placeholder = Portal({
        target: () => $target.value,
        children: child,
      }) as Comment;
      document.body.appendChild(placeholder);
      flushMount(ctx);

      expect(portalTarget.contains(child)).toBe(true);

      // Target becomes null — should unmount and warn
      $target.value = null;
      expect(portalTarget.contains(child)).toBe(false);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[Portal] Target element not found'),
      );

      // Restore target — should re-mount
      $target.value = '#portal-target';
      expect(portalTarget.contains(child)).toBe(true);

      warnSpy.mockRestore();
      placeholder.remove();
      popContextStack();
    });
  });

  // --- Children & cleanup ---

  describe('children & cleanup', () => {
    it('updates children reactively', () => {
      const $msg = signal('a');

      const ctx = createContext(null);
      pushContextStack(ctx);
      Portal({
        target: portalTarget,
        children: (() => document.createTextNode($msg.value)) as any,
      });
      flushMount(ctx);

      expect(portalTarget.textContent).toBe('a');

      $msg.value = 'b';
      expect(portalTarget.textContent).toBe('b');

      popContextStack();
    });

    it('removes mounted children when the owning scope is disposed', () => {
      const ctx = createContext(null);
      pushContextStack(ctx);
      Portal({
        target: portalTarget,
        children: document.createTextNode('cleanup-me'),
      });
      flushMount(ctx);
      expect(portalTarget.textContent).toBe('cleanup-me');

      cleanupContext(ctx);

      expect(portalTarget.textContent).toBe('');
      popContextStack();
    });
  });

  // --- Rapid toggling (stress test) ---

  describe('rapid toggling', () => {
    it('survives rapid disabled toggling without leaking DOM nodes', () => {
      const host = document.createElement('section');
      document.body.appendChild(host);

      const $disabled = signal(false);

      const ctx = createContext(null);
      pushContextStack(ctx);
      const child = document.createElement('span');
      child.textContent = 'rapid';
      const placeholder = Portal({
        target: portalTarget,
        disabled: () => $disabled.value,
        children: child,
      }) as Comment;
      host.appendChild(placeholder);
      flushMount(ctx);

      // Rapidly toggle 20 times
      for (let i = 0; i < 20; i++) {
        $disabled.value = !$disabled.value;
      }

      // After even number of toggles, should be back in portal target
      expect(portalTarget.contains(child)).toBe(true);
      expect(host.contains(child)).toBe(false);

      // No duplicate nodes should exist
      expect(document.querySelectorAll('span').length).toBe(1);

      popContextStack();
    });

    it('survives rapid target switching without leaking DOM nodes', () => {
      const $useAlt = signal(false);

      const ctx = createContext(null);
      pushContextStack(ctx);
      const child = document.createElement('em');
      child.textContent = 'switch-rapid';
      Portal({
        target: () => ($useAlt.value ? '#alt-target' : '#portal-target'),
        children: child,
      });
      flushMount(ctx);

      // Rapidly switch 20 times
      for (let i = 0; i < 20; i++) {
        $useAlt.value = !$useAlt.value;
      }

      // After even number of toggles, back to portal target
      expect(portalTarget.contains(child)).toBe(true);
      expect(altTarget.contains(child)).toBe(false);

      // No duplicate nodes
      expect(document.querySelectorAll('em').length).toBe(1);

      popContextStack();
    });
  });

  // --- Multiple concurrent portals ---

  describe('multiple concurrent portals', () => {
    it('two Portals to different targets coexist independently', () => {
      const ctx = createContext(null);
      pushContextStack(ctx);

      const child1 = document.createElement('div');
      child1.textContent = 'first';
      const child2 = document.createElement('div');
      child2.textContent = 'second';

      Portal({ target: portalTarget, children: child1 });
      Portal({ target: altTarget, children: child2 });
      flushMount(ctx);

      expect(portalTarget.contains(child1)).toBe(true);
      expect(altTarget.contains(child2)).toBe(true);
      expect(portalTarget.contains(child2)).toBe(false);
      expect(altTarget.contains(child1)).toBe(false);

      popContextStack();
    });

    it('two Portals to the same target append in order', () => {
      const ctx = createContext(null);
      pushContextStack(ctx);

      const child1 = document.createElement('span');
      child1.textContent = 'first';
      const child2 = document.createElement('span');
      child2.textContent = 'second';

      Portal({ target: portalTarget, children: child1 });
      Portal({ target: portalTarget, children: child2 });
      flushMount(ctx);

      const spans = portalTarget.querySelectorAll('span');
      expect(spans).toHaveLength(2);
      expect(spans[0].textContent).toBe('first');
      expect(spans[1].textContent).toBe('second');

      popContextStack();
    });
  });

  // --- Edge cases ---

  describe('edge cases', () => {
    it('returns placeholder without effects when children is null', () => {
      const ctx = createContext(null);
      pushContextStack(ctx);
      const node = Portal({ target: portalTarget, children: null as any });
      flushMount(ctx);
      expect(node).toBeInstanceOf(Comment);
      expect(portalTarget.innerHTML).toBe('');
      popContextStack();
    });

    it('disabled=true defers mount until placeholder is attached', () => {
      const ctx = createContext(null);
      pushContextStack(ctx);
      const child = document.createElement('i');
      child.textContent = 'late';
      const placeholder = Portal({
        target: portalTarget,
        disabled: true,
        children: child,
      }) as Comment;
      expect(child.parentNode).toBe(null);

      const host = document.createElement('section');
      document.body.appendChild(host);
      host.appendChild(placeholder);
      flushMount(ctx);

      expect(host.contains(child)).toBe(true);
      popContextStack();
    });

    it('isPortal returns false for non-portal values', () => {
      expect(isPortal(undefined)).toBe(false);
      expect(isPortal(0)).toBe(false);
      expect(isPortal('')).toBe(false);
      expect(isPortal({})).toBe(false);
      expect(isPortal(document.createComment('not-portal'))).toBe(false);
    });

    it('portal function itself is marked with PORTAL_COMPONENT', () => {
      expect(isPortal(Portal)).toBe(true);
    });

    it('handles children as array of nodes', () => {
      const ctx = createContext(null);
      pushContextStack(ctx);
      const children = [document.createElement('span'), document.createElement('em')];
      children[0].textContent = 'a';
      children[1].textContent = 'b';
      Portal({ target: portalTarget, children: children as any });
      flushMount(ctx);

      expect(portalTarget.querySelectorAll('span')).toHaveLength(1);
      expect(portalTarget.querySelectorAll('em')).toHaveLength(1);
      expect(portalTarget.textContent).toBe('ab');

      popContextStack();
    });
  });
});
