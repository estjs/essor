import { beforeEach, describe, expect, it, vi } from 'vitest';
import { patchAttr } from '../src/operations/attr';
import { normalizeClass, patchClass } from '../src/operations/class';
import { addEvent } from '../src/operations/event';
import { patchStyle } from '../src/operations/styles';
import { getNodeKey } from '../src/key';
import { resetEnvironment } from './test-utils';

describe('dOM operations', () => {
  beforeEach(() => {
    resetEnvironment();
  });

  it('patchAttr handles special cases and key prop', () => {
    const el = document.createElement('div');
    patchAttr(el, 'id', null, 'test');
    expect(el.id).toBe('test');

    patchAttr(el, 'data-flag', '1', null);
    expect(Object.hasOwn(el.dataset, 'flag')).toBe(false);

    patchAttr(el, 'disabled', false, true);
    expect(el.hasAttribute('disabled')).toBe(true);

    patchAttr(el, 'key', null, 'node-key');
    expect(getNodeKey(el)).toBe('node-key'); // key is set via setNodeKey

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    patchAttr(svg, 'xlink:href', null, '#id');
    expect(svg.getAttribute('xlink:href')).toBe('#id');
  });

  it('patchClass normalizes multiple formats', () => {
    const el = document.createElement('div');
    patchClass(el, '', ['a', { b: true, c: false }]);
    expect(el.className).toBe('a b');

    const normalized = normalizeClass({ x: true, y: false });
    expect(normalized).toBe('x');
  });

  it('addEvent supports delegation cleanup', () => {
    const parent = document.createElement('div');
    const child = document.createElement('button');
    child.className = 'fire';
    parent.appendChild(child);

    const handler = vi.fn();
    const cleanup = addEvent(parent, 'click', handler, { delegate: '.fire' });

    child.dispatchEvent(new Event('click', { bubbles: true }));
    expect(handler).toHaveBeenCalledTimes(1);

    cleanup();
    child.dispatchEvent(new Event('click', { bubbles: true }));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('addEvent attaches direct listeners', () => {
    const button = document.createElement('button');
    const handler = vi.fn();
    const cleanup = addEvent(button, 'click', handler);

    button.dispatchEvent(new Event('click'));
    expect(handler).toHaveBeenCalledTimes(1);

    cleanup();
    button.dispatchEvent(new Event('click'));
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('patchStyle applies and removes properties', () => {
    const el = document.createElement('div');
    patchStyle(el, null, {
      'color': 'red',
      '--custom': '10px',
      'margin': '1px !important',
      'display': ['-webkit-box', 'flex'],
    });

    expect(el.style.color).toBe('red');
    expect(el.style.getPropertyValue('--custom')).toBe('10px');
    expect(el.style.getPropertyPriority('margin')).toBe('important');
    expect(el.style.display).toBeTruthy();

    patchStyle(el, { color: 'red' }, null);
    expect(el.getAttribute('style')).toBeNull();
  });
});
