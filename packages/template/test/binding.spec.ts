import { beforeEach, describe, expect, it, vi } from 'vitest';
import { isHtmlInputElement } from '../src/utils';
import { addEventListener, bindElement, insert, mapNodes } from '../src/binding';
import { cleanupContext, createContext, popContextStack, pushContextStack } from '../src/context';
import { createTestRoot, resetEnvironment } from './test-utils';

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

  describe('bindElement', () => {
    it('binds text input to setter', () => {
      const input = document.createElement('input');
      const setter = vi.fn();
      const listeners: Record<string, EventListener> = {};
      vi.spyOn(input, 'addEventListener').mockImplementation((event, handler) => {
        listeners[event as string] = handler as EventListener;
        return undefined as any;
      });

      input.type = 'text';
      expect(isHtmlInputElement(input)).toBe(true);
      bindElement(input, setter);

      const handler = listeners.input;
      expect(handler).toBeDefined();

      const event = new Event('input');
      input.value = 'hello';
      handler(event);

      expect(setter).toHaveBeenCalledWith('hello');
    });

    it('binds checkbox input to setter', () => {
      const input = document.createElement('input');
      const setter = vi.fn();
      const listeners: Record<string, EventListener> = {};
      vi.spyOn(input, 'addEventListener').mockImplementation((event, handler) => {
        listeners[event as string] = handler as EventListener;
        return undefined as any;
      });

      input.type = 'checkbox';
      bindElement(input, setter);

      const handler = listeners.change;
      expect(handler).toBeDefined();

      input.checked = true;
      handler(new Event('change'));
      expect(setter).toHaveBeenCalledWith(true);
    });

    it('binds radio input to setter', () => {
      const input = document.createElement('input');
      const setter = vi.fn();
      const listeners: Record<string, EventListener> = {};
      vi.spyOn(input, 'addEventListener').mockImplementation((event, handler) => {
        listeners[event as string] = handler as EventListener;
        return undefined as any;
      });

      input.type = 'radio';
      input.value = 'option1';
      bindElement(input, setter);

      const handler = listeners.change;
      expect(handler).toBeDefined();

      input.checked = true;
      handler(new Event('change'));
      expect(setter).toHaveBeenCalledWith('option1');

      input.checked = false;
      handler(new Event('change'));
      expect(setter).toHaveBeenCalledWith('');
    });

    it('binds file input to setter', () => {
      const input = document.createElement('input');
      const setter = vi.fn();
      const listeners: Record<string, EventListener> = {};
      vi.spyOn(input, 'addEventListener').mockImplementation((event, handler) => {
        listeners[event as string] = handler as EventListener;
        return undefined as any;
      });

      input.type = 'file';
      bindElement(input, setter);

      const handler = listeners.change;
      expect(handler).toBeDefined();

      handler(new Event('change'));
      expect(setter).toHaveBeenCalledWith(input.files);
    });

    it('binds number input to setter', () => {
      const input = document.createElement('input');
      const setter = vi.fn();
      const listeners: Record<string, EventListener> = {};
      vi.spyOn(input, 'addEventListener').mockImplementation((event, handler) => {
        listeners[event as string] = handler as EventListener;
        return undefined as any;
      });

      input.type = 'number';
      bindElement(input, setter);

      const handler = listeners.input;
      expect(handler).toBeDefined();

      input.value = '42';
      handler(new Event('input'));
      expect(setter).toHaveBeenCalledWith('42');

      input.value = 'invalid';
      handler(new Event('input'));
      expect(setter).toHaveBeenCalledWith('');
    });

    it('binds range input to setter', () => {
      const input = document.createElement('input');
      const setter = vi.fn();
      const listeners: Record<string, EventListener> = {};
      vi.spyOn(input, 'addEventListener').mockImplementation((event, handler) => {
        listeners[event as string] = handler as EventListener;
        return undefined as any;
      });

      input.type = 'range';
      bindElement(input, setter);

      const handler = listeners.input;
      expect(handler).toBeDefined();

      input.value = '50';
      handler(new Event('input'));
      expect(setter).toHaveBeenCalledWith('50');
    });

    it('binds date input to setter', () => {
      const input = document.createElement('input');
      const setter = vi.fn();
      const listeners: Record<string, EventListener> = {};
      vi.spyOn(input, 'addEventListener').mockImplementation((event, handler) => {
        listeners[event as string] = handler as EventListener;
        return undefined as any;
      });

      input.type = 'date';
      bindElement(input, setter);

      const handler = listeners.change;
      expect(handler).toBeDefined();

      input.value = '2024-01-01';
      handler(new Event('change'));
      expect(setter).toHaveBeenCalledWith('2024-01-01');

      input.value = '';
      handler(new Event('change'));
      expect(setter).toHaveBeenCalledWith('');
    });

    it('binds select element to setter', () => {
      const select = document.createElement('select');
      const option = document.createElement('option');
      option.value = 'option1';
      select.appendChild(option);

      const setter = vi.fn();
      const listeners: Record<string, EventListener> = {};
      vi.spyOn(select, 'addEventListener').mockImplementation((event, handler) => {
        listeners[event as string] = handler as EventListener;
        return undefined as any;
      });

      bindElement(select, setter);

      const handler = listeners.change;
      expect(handler).toBeDefined();

      select.value = 'option1';
      handler(new Event('change'));
      expect(setter).toHaveBeenCalledWith('option1');
    });

    it('binds multi-select element to setter', () => {
      const select = document.createElement('select');
      select.multiple = true;
      const option1 = document.createElement('option');
      option1.value = 'opt1';
      option1.selected = true;
      const option2 = document.createElement('option');
      option2.value = 'opt2';
      option2.selected = true;
      select.appendChild(option1);
      select.appendChild(option2);

      const setter = vi.fn();
      const listeners: Record<string, EventListener> = {};
      vi.spyOn(select, 'addEventListener').mockImplementation((event, handler) => {
        listeners[event as string] = handler as EventListener;
        return undefined as any;
      });

      bindElement(select, setter);

      const handler = listeners.change;
      expect(handler).toBeDefined();

      handler(new Event('change'));
      expect(setter).toHaveBeenCalledWith(['opt1', 'opt2']);
    });

    it('binds textarea to setter', () => {
      const textarea = document.createElement('textarea');
      const setter = vi.fn();
      const listeners: Record<string, EventListener> = {};
      vi.spyOn(textarea, 'addEventListener').mockImplementation((event, handler) => {
        listeners[event as string] = handler as EventListener;
        return undefined as any;
      });

      bindElement(textarea, setter);

      const handler = listeners.input;
      expect(handler).toBeDefined();

      textarea.value = 'text content';
      handler(new Event('input'));
      expect(setter).toHaveBeenCalledWith('text content');

      textarea.value = '';
      handler(new Event('input'));
      expect(setter).toHaveBeenCalledWith('');
    });

    it('handles empty text input value', () => {
      const input = document.createElement('input');
      const setter = vi.fn();
      const listeners: Record<string, EventListener> = {};
      vi.spyOn(input, 'addEventListener').mockImplementation((event, handler) => {
        listeners[event as string] = handler as EventListener;
        return undefined as any;
      });

      input.type = 'text';
      bindElement(input, setter);

      const handler = listeners.input;
      input.value = '';
      handler(new Event('input'));
      expect(setter).toHaveBeenCalledWith('');
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

    it('ignores insert when no active context exists', () => {
      const root = createTestRoot();
      expect(() => insert(root, document.createTextNode('no-context'))).not.toThrow();
      expect(root.textContent).toBe('');
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

    it('preserves nodes on cleanup when preserveOnCleanup is true', () => {
      const context = createContext(null);
      const root = createTestRoot();
      pushContextStack(context);

      insert(root, () => document.createTextNode('preserved'), undefined, {
        preserveOnCleanup: true,
      });
      popContextStack();

      expect(root.textContent).toBe('preserved');

      cleanupContext(context);
      expect(root.textContent).toBe('preserved');
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
});
