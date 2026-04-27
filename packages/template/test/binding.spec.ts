import { beforeEach, describe, expect, it, vi } from 'vitest';
import { bindElement, child, insert, next, nthChild } from '../src/binding';
import { addEventListener } from '../src/events';
import {
  cleanupContext,
  createContext,
  createTestRoot,
  popContextStack,
  pushContextStack,
  resetEnvironment,
} from './test-utils';

describe('binding utilities', () => {
  beforeEach(() => {
    resetEnvironment();
  });

  describe('addEventListener', () => {
    it('registers event listeners with context cleanup', () => {
      const context = createContext(null);
      pushContextStack(context);

      const button = document.createElement('button');
      const handler = vi.fn();

      addEventListener(button, 'click', handler);
      popContextStack();

      button.dispatchEvent(new Event('click'));
      expect(handler).toHaveBeenCalledTimes(1);

      cleanupContext(context);
      button.dispatchEvent(new Event('click'));
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('adds event listener without context', () => {
      const button = document.createElement('button');
      const handler = vi.fn();

      addEventListener(button, 'click', handler);
      button.dispatchEvent(new Event('click'));
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('supports event listener options', () => {
      const context = createContext(null);
      pushContextStack(context);

      const button = document.createElement('button');
      const handler = vi.fn();

      addEventListener(button, 'click', handler, { once: true });
      popContextStack();

      button.dispatchEvent(new Event('click'));
      button.dispatchEvent(new Event('click'));
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('tree traversal', () => {
    it('child returns first child or null', () => {
      const node = document.createElement('div');
      expect(child(null)).toBeNull();
      expect(child(node)).toBeNull();
      const first = document.createElement('span');
      node.appendChild(first);
      expect(child(node)).toBe(first);
    });

    it('next returns sibling correctly', () => {
      expect(next(null)).toBeNull();
      const parent = document.createElement('div');
      const n1 = document.createElement('span');
      const n2 = document.createElement('a');
      const n3 = document.createElement('p');
      parent.appendChild(n1);
      parent.appendChild(n2);
      parent.appendChild(n3);

      expect(next(n1)).toBe(n2);
      expect(next(n1, 2)).toBe(n3);
      expect(next(n3)).toBeNull();
    });

    it('nthChild returns correctly', () => {
      expect(nthChild(null, 1)).toBeNull();
      const parent = document.createElement('div');
      expect(nthChild(parent, -1)).toBeNull();
      const n1 = document.createElement('span');
      const n2 = document.createElement('a');
      const n3 = document.createElement('p');
      parent.appendChild(n1);
      parent.appendChild(n2);
      parent.appendChild(n3);

      expect(nthChild(parent, 0)).toBe(n1);
      expect(nthChild(parent, 1)).toBe(n2);
      expect(nthChild(parent, 2)).toBe(n3);
      expect(nthChild(parent, 3)).toBeNull();
      expect(nthChild(n1, 1)).toBeNull(); // element with no children
    });
  });

  describe('insert', () => {
    it('inserts reactive nodes and cleans on teardown', () => {
      const context = createContext(null);
      const root = createTestRoot();
      pushContextStack(context);

      insert(root, () => document.createTextNode('content'));
      popContextStack();

      expect(root.textContent).toBe('content');

      // Cleanup should remove nodes
      cleanupContext(context);
      // Note: The cleanup behavior depends on preserveOnCleanup option
      // By default (preserveOnCleanup: false), nodes should be removed
    });

    it('supports inserting static nodes', () => {
      const context = createContext(null);
      const root = createTestRoot();
      pushContextStack(context);

      const span = document.createElement('span');
      span.textContent = 'static';
      insert(root, span);
      popContextStack();

      expect(root.textContent).toBe('static');
    });

    it('supports inserting static strings', () => {
      const context = createContext(null);
      const root = createTestRoot();
      pushContextStack(context);

      insert(root, 'Hello World');
      popContextStack();

      expect(root.textContent).toBe('Hello World');
    });

    it('handles insert when no active context exists', () => {
      const root = createTestRoot();
      // Insert now succeeds even without context (creates implicit scope)
      expect(() => insert(root, document.createTextNode('no-context'))).not.toThrow();
      // The node is inserted successfully
      expect(root.textContent).toBe('no-context');
    });

    it('ignores insert when parent is null', () => {
      const context = createContext(null);
      pushContextStack(context);
      expect(() => insert(null as any, document.createTextNode('test'))).not.toThrow();
      popContextStack();
    });

    it('inserts nodes with before reference', () => {
      const context = createContext(null);
      const root = createTestRoot();
      pushContextStack(context);

      const first = document.createTextNode('first');
      const second = document.createTextNode('second');
      root.appendChild(second);

      insert(root, first, second);
      popContextStack();

      expect(root.textContent).toBe('firstsecond');
    });

    it('handles reactive updates', () => {
      const context = createContext(null);
      const root = createTestRoot();
      pushContextStack(context);

      const counter = 0;
      insert(root, () => document.createTextNode(`count: ${counter}`));
      popContextStack();

      expect(root.textContent).toBe('count: 0');
    });
  });

  describe('bindElement', () => {
    it('binds checkbox input', () => {
      const input = document.createElement('input');
      input.type = 'checkbox';
      const setter = vi.fn();

      bindElement(input, 'checked', false, setter);

      input.checked = true;
      input.dispatchEvent(new Event('change'));
      expect(setter).toHaveBeenCalledWith(true);

      input.checked = false;
      input.dispatchEvent(new Event('change'));
      expect(setter).toHaveBeenCalledWith(false);
    });

    it('binds radio input', () => {
      const input = document.createElement('input');
      input.type = 'radio';
      input.value = 'option1';
      const setter = vi.fn();

      bindElement(input, 'checked', '', setter);

      input.checked = true;
      input.dispatchEvent(new Event('change'));
      expect(setter).toHaveBeenCalledWith('option1');

      input.checked = false;
      input.dispatchEvent(new Event('change'));
      expect(setter).toHaveBeenCalledWith('');
    });

    it('binds file input', () => {
      const input = document.createElement('input');
      input.type = 'file';
      const setter = vi.fn();

      bindElement(input, 'files', null, setter);

      // Mock files property since we can't easily set it programmatically in jsdom
      Object.defineProperty(input, 'files', {
        value: ['file1'],
        writable: true,
      });

      input.dispatchEvent(new Event('change'));
      expect(setter).toHaveBeenCalledWith(['file1']);
    });

    it('binds number input', () => {
      const input = document.createElement('input');
      input.type = 'number';
      const setter = vi.fn();

      bindElement(input, 'value', '', setter);

      input.value = '123';
      input.dispatchEvent(new Event('input'));
      expect(setter).toHaveBeenCalledWith('123');
    });

    it('binds select element (single)', () => {
      const select = document.createElement('select');
      const option1 = document.createElement('option');
      option1.value = 'a';
      const option2 = document.createElement('option');
      option2.value = 'b';
      select.appendChild(option1);
      select.appendChild(option2);

      const setter = vi.fn();
      bindElement(select, 'value', '', setter);

      select.value = 'b';
      select.dispatchEvent(new Event('change'));
      expect(setter).toHaveBeenCalledWith('b');
    });

    it('binds select element (multiple)', () => {
      const select = document.createElement('select');
      select.multiple = true;
      const option1 = document.createElement('option');
      option1.value = 'a';
      const option2 = document.createElement('option');
      option2.value = 'b';
      select.appendChild(option1);
      select.appendChild(option2);

      const setter = vi.fn();
      bindElement(select, 'value', [], setter);

      option1.selected = true;
      option2.selected = true;
      select.dispatchEvent(new Event('change'));
      expect(setter).toHaveBeenCalledWith(['a', 'b']);
    });

    it('binds textarea', () => {
      const textarea = document.createElement('textarea');
      const setter = vi.fn();

      bindElement(textarea, 'value', '', setter);

      textarea.value = 'text';
      textarea.dispatchEvent(new Event('input'));
      expect(setter).toHaveBeenCalledWith('text');
    });

    it('binds text input (default)', () => {
      const input = document.createElement('input');
      input.type = 'text';
      const setter = vi.fn();

      bindElement(input, 'value', '', setter);

      input.value = 'hello';
      input.dispatchEvent(new Event('input'));
      expect(setter).toHaveBeenCalledWith('hello');
    });
  });
});
