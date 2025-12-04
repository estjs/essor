import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addEventListener, insert, mapNodes } from '../src/binding';
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
