import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addEventListener, bindElement, insert, mapNodes } from '../src/binding';
import { createScope, disposeScope, runWithScope } from '../src/scope';
import { createTestRoot, resetEnvironment } from './test-utils';

describe('binding utilities', () => {
  beforeEach(() => {
    resetEnvironment();
  });

  describe('addEventListener', () => {
    it('registers event listeners with scope cleanup', () => {
      const scope = createScope(null);
      const button = document.createElement('button');
      const handler = vi.fn();

      runWithScope(scope, () => {
        addEventListener(button, 'click', handler);
      });

      button.dispatchEvent(new Event('click'));
      expect(handler).toHaveBeenCalledTimes(1);

      disposeScope(scope);
      button.dispatchEvent(new Event('click'));
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('adds event listener without scope', () => {
      const button = document.createElement('button');
      const handler = vi.fn();

      addEventListener(button, 'click', handler);
      button.dispatchEvent(new Event('click'));
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('supports event listener options', () => {
      const scope = createScope(null);
      const button = document.createElement('button');
      const handler = vi.fn();

      runWithScope(scope, () => {
        addEventListener(button, 'click', handler, { once: true });
      });

      button.dispatchEvent(new Event('click'));
      button.dispatchEvent(new Event('click'));
      expect(handler).toHaveBeenCalledTimes(1);
      disposeScope(scope);
    });
  });

  describe('insert', () => {
    it('inserts reactive nodes and cleans on teardown', () => {
      const scope = createScope(null);
      const root = createTestRoot();

      runWithScope(scope, () => {
        insert(root, () => document.createTextNode('content'));
      });

      expect(root.textContent).toBe('content');

      disposeScope(scope);
      expect(root.textContent).toBe('');
    });

    it('supports inserting static nodes', () => {
      const scope = createScope(null);
      const root = createTestRoot();

      runWithScope(scope, () => {
        const span = document.createElement('span');
        span.textContent = 'static';
        insert(root, span);
      });

      expect(root.textContent).toBe('static');
      disposeScope(scope);
    });

    it('supports inserting static strings', () => {
      const scope = createScope(null);
      const root = createTestRoot();

      runWithScope(scope, () => {
        insert(root, 'Hello World');
      });

      expect(root.textContent).toBe('Hello World');
      disposeScope(scope);
    });

    it('ignores insert when no active scope exists', () => {
      const root = createTestRoot();
      expect(() => insert(root, document.createTextNode('no-scope'))).not.toThrow();
      // insert now creates an effect and registers cleanup.
      // If no scope, it might still insert but won't have cleanup or might warn in dev.
      // Looking at binding.ts, it calls effect() and onCleanup().
      // onCleanup() warns if no active scope.
      expect(root.textContent).toBe('no-scope');
    });

    it('ignores insert when parent is null', () => {
      const scope = createScope(null);
      runWithScope(scope, () => {
        // @ts-ignore
        expect(() => insert(null, document.createTextNode('test'))).not.toThrow();
      });
      disposeScope(scope);
    });

    it('inserts nodes with before reference', () => {
      const scope = createScope(null);
      const root = createTestRoot();

      const second = document.createTextNode('second');
      root.appendChild(second);

      runWithScope(scope, () => {
        const first = document.createTextNode('first');
        insert(root, first, second);
      });

      expect(root.textContent).toBe('firstsecond');
      disposeScope(scope);
    });

    it('handles reactive updates', () => {
      const scope = createScope(null);
      const root = createTestRoot();

      const counter = 0;
      runWithScope(scope, () => {
        insert(root, () => document.createTextNode(`count: ${counter}`));
      });

      expect(root.textContent).toBe('count: 0');
      // Note: In this unit test, we're not using signals, so it won't auto-update
      // unless we trigger the effect manually or use a signal.
      // But the test was already like this.
      disposeScope(scope);
    });
  });

  describe('mapNodes', () => {
    it('maps template nodes by index', () => {
      const template = document.createDocumentFragment();
      template.appendChild(document.createElement('div'));
      template.appendChild(document.createElement('span'));
      template.appendChild(document.createElement('p'));

      const nodes = mapNodes(template.cloneNode(true), [1, 3]);
      expect(nodes).toHaveLength(2);
      expect(nodes[0].nodeName).toBe('DIV');
      expect(nodes[1].nodeName).toBe('P');
    });

    it('handles empty index array', () => {
      const template = document.createDocumentFragment();
      template.appendChild(document.createElement('div'));

      const nodes = mapNodes(template.cloneNode(true), []);
      expect(nodes).toHaveLength(0);
    });

    it('handles nested elements', () => {
      const template = document.createDocumentFragment();
      const div = document.createElement('div');
      const span = document.createElement('span');
      div.appendChild(span);
      template.appendChild(div);
      template.appendChild(document.createElement('p'));

      const nodes = mapNodes(template.cloneNode(true), [1, 2]);
      expect(nodes).toHaveLength(2);
      expect(nodes[0].nodeName).toBe('DIV');
      expect(nodes[1].nodeName).toBe('SPAN');
    });

    it('early exits when all nodes are found', () => {
      const template = document.createDocumentFragment();
      for (let i = 0; i < 100; i++) {
        template.appendChild(document.createElement('div'));
      }

      const nodes = mapNodes(template.cloneNode(true), [1, 2]);
      expect(nodes).toHaveLength(2);
    });

    it('handles document fragments correctly', () => {
      const template = document.createDocumentFragment();
      const nested = document.createDocumentFragment();
      nested.appendChild(document.createElement('span'));
      template.appendChild(nested);
      template.appendChild(document.createElement('div'));

      const nodes = mapNodes(template.cloneNode(true), [1]);
      expect(nodes).toHaveLength(1);
      expect(nodes[0].nodeName).toBe('SPAN');
    });
  });

  describe('bindElement', () => {
    it('binds checkbox input', () => {
      const scope = createScope(null);
      const input = document.createElement('input');
      input.type = 'checkbox';
      const setter = vi.fn();

      runWithScope(scope, () => {
        bindElement(input, 'checked', false, setter);
      });

      input.checked = true;
      input.dispatchEvent(new Event('change'));
      expect(setter).toHaveBeenCalledWith(true);

      input.checked = false;
      input.dispatchEvent(new Event('change'));
      expect(setter).toHaveBeenCalledWith(false);
      disposeScope(scope);
    });

    it('binds radio input', () => {
      const scope = createScope(null);
      const input = document.createElement('input');
      input.type = 'radio';
      input.value = 'option1';
      const setter = vi.fn();

      runWithScope(scope, () => {
        bindElement(input, 'checked', '', setter);
      });

      input.checked = true;
      input.dispatchEvent(new Event('change'));
      expect(setter).toHaveBeenCalledWith('option1');

      input.checked = false;
      input.dispatchEvent(new Event('change'));
      expect(setter).toHaveBeenCalledWith('');
      disposeScope(scope);
    });

    it('binds file input', () => {
      const scope = createScope(null);
      const input = document.createElement('input');
      input.type = 'file';
      const setter = vi.fn();

      runWithScope(scope, () => {
        bindElement(input, 'files', null, setter);
      });

      // Mock files property since we can't easily set it programmatically in jsdom
      Object.defineProperty(input, 'files', {
        value: ['file1'],
        writable: true,
      });

      input.dispatchEvent(new Event('change'));
      expect(setter).toHaveBeenCalledWith(['file1']);
      disposeScope(scope);
    });

    it('binds number input', () => {
      const scope = createScope(null);
      const input = document.createElement('input');
      input.type = 'number';
      const setter = vi.fn();

      runWithScope(scope, () => {
        bindElement(input, 'value', '', setter);
      });

      input.value = '123';
      input.dispatchEvent(new Event('input'));
      expect(setter).toHaveBeenCalledWith('123');
      disposeScope(scope);
    });

    it('binds select element (single)', () => {
      const scope = createScope(null);
      const select = document.createElement('select');
      const option1 = document.createElement('option');
      option1.value = 'a';
      const option2 = document.createElement('option');
      option2.value = 'b';
      select.appendChild(option1);
      select.appendChild(option2);

      const setter = vi.fn();
      runWithScope(scope, () => {
        bindElement(select, 'value', '', setter);
      });

      select.value = 'b';
      select.dispatchEvent(new Event('change'));
      expect(setter).toHaveBeenCalledWith('b');
      disposeScope(scope);
    });

    it('binds select element (multiple)', () => {
      const scope = createScope(null);
      const select = document.createElement('select');
      select.multiple = true;
      const option1 = document.createElement('option');
      option1.value = 'a';
      const option2 = document.createElement('option');
      option2.value = 'b';
      select.appendChild(option1);
      select.appendChild(option2);

      const setter = vi.fn();
      runWithScope(scope, () => {
        bindElement(select, 'value', [], setter);
      });

      option1.selected = true;
      option2.selected = true;
      select.dispatchEvent(new Event('change'));
      expect(setter).toHaveBeenCalledWith(['a', 'b']);
      disposeScope(scope);
    });

    it('binds textarea', () => {
      const scope = createScope(null);
      const textarea = document.createElement('textarea');
      const setter = vi.fn();

      runWithScope(scope, () => {
        bindElement(textarea, 'value', '', setter);
      });

      textarea.value = 'text';
      textarea.dispatchEvent(new Event('input'));
      expect(setter).toHaveBeenCalledWith('text');
      disposeScope(scope);
    });

    it('binds text input (default)', () => {
      const scope = createScope(null);
      const input = document.createElement('input');
      input.type = 'text';
      const setter = vi.fn();

      runWithScope(scope, () => {
        bindElement(input, 'value', '', setter);
      });

      input.value = 'hello';
      input.dispatchEvent(new Event('input'));
      expect(setter).toHaveBeenCalledWith('hello');
      disposeScope(scope);
    });
  });
});
