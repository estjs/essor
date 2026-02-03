import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Portal, isPortal } from '../../src/components/Portal';
import { resetEnvironment } from '../test-utils';
import { createScope, disposeScope, runWithScope } from '../../src/scope';
import { triggerMountHooks } from '../../src/lifecycle';

describe('portal', () => {
  let portalTarget: HTMLElement;

  beforeEach(() => {
    resetEnvironment();
    portalTarget = document.createElement('div');
    portalTarget.id = 'portal-target';
    document.body.appendChild(portalTarget);
  });

  afterEach(() => {
    if (portalTarget.parentNode) {
      document.body.removeChild(portalTarget);
    }
  });

  it('renders children into target element', () => {
    const scope = createScope(null);
    runWithScope(scope, () => {
      Portal({
        target: portalTarget,
        children: document.createElement('div'),
      });
    });

    triggerMountHooks(scope);
    expect(portalTarget.innerHTML).toBe('<div></div>');
  });

  it('supports selector string as target', () => {
    const scope = createScope(null);
    runWithScope(scope, () => {
      Portal({
        target: '#portal-target',
        children: document.createTextNode('content'),
      });
    });

    triggerMountHooks(scope);
    expect(portalTarget.textContent).toBe('content');
  });

  it('handles missing target element with warning', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const scope = createScope(null);
    runWithScope(scope, () => {
      Portal({
        target: '#non-existent',
        children: document.createElement('div'),
      });
    });

    triggerMountHooks(scope);
    expect(warnSpy).toHaveBeenCalledWith(
      '[Essor warn]: [Portal] Target element not found: #non-existent',
    );
    warnSpy.mockRestore();
  });

  it('cleans up children on unmount', () => {
    const scope = createScope(null);
    runWithScope(scope, () => {
      Portal({
        target: portalTarget,
        children: document.createTextNode('test'),
      });
    });

    triggerMountHooks(scope);
    expect(portalTarget.textContent).toBe('test');

    disposeScope(scope);
    expect(portalTarget.textContent).toBe('');
  });

  it('isPortal identifies portal components', () => {
    let node: any;
    const scope = createScope(null);
    runWithScope(scope, () => {
      node = Portal({ target: document.body });
    });

    expect(isPortal(node)).toBe(true);
    expect(isPortal(document.createElement('div'))).toBe(false);
    expect(isPortal(null)).toBe(false);
  });

  it('handles multiple children and cleanup', () => {
    const scope = createScope(null);
    runWithScope(scope, () => {
      Portal({
        target: portalTarget,
        children: [document.createElement('span'), document.createTextNode('text')],
      });
    });

    triggerMountHooks(scope);
    expect(portalTarget.innerHTML).toBe('<span></span>text');

    disposeScope(scope);
    expect(portalTarget.innerHTML).toBe('');
  });
});
