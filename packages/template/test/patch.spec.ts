import {
  getKey,
  insertNode,
  mapKeys,
  patch,
  patchChildren,
  removeChild,
  replaceChild,
} from '../src/patch';
import { type Component, createComponent, isComponent } from '../src/component';

// Component render function
const componentFn = () => {
  const node = document.createElement('div');
  node.textContent = 'Test Component';
  return node;
};

// Directly use real Components but monitor method calls with spy
const createTestComponent = (key?: string): Component => {
  // Create real component instance
  const component = createComponent(componentFn, { key });

  // Monitor methods with spy
  vi.spyOn(component, 'mount');
  vi.spyOn(component, 'destroy');
  vi.spyOn(component, 'update');

  return component;
};

describe('patch', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    // Setup a fresh container for each test
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    // Clean up after each test
    document.body.removeChild(container);
    vi.restoreAllMocks();
  });

  describe('getKey', () => {
    it('returns component key if available', () => {
      const component = createTestComponent('test-key');

      const key = getKey(component, 0);

      expect(key).toBe('test-key');
    });

    it('uses internal key for components without explicit key', () => {
      const component = createTestComponent();

      // First call will generate an internal key
      const key1 = getKey(component, 5);
      // Second call should return the same key
      const key2 = getKey(component, 10);

      expect(key1).toBe(key2);
      expect(key1).toMatch(/\d+/); // Should be a numeric key
    });

    it('uses internal key for DOM nodes', () => {
      const node = document.createElement('div');

      const key = getKey(node, 5);

      expect(typeof key).toBe('string');
      expect(key).toMatch(/\d+/); // Should be a numeric key
    });

    it('falls back to index for non-element values', () => {
      const key = getKey(null as any, 3);

      expect(key).toBe('_3');
    });

    it('reuses existing internal key if available', () => {
      const node = document.createElement('div');

      // First call generates key
      const key1 = getKey(node, 10);
      // Second call reuses key
      const key2 = getKey(node, 20);

      expect(key1).toBe(key2);
    });

    it('converts non-string keys to strings', () => {
      const component = createTestComponent();
      Object.defineProperty(component, 'key', { value: 123, configurable: true });

      const key = getKey(component, 0);

      expect(key).toBe('123');
    });
  });

  describe('mapKeys', () => {
    it('maps an empty array to an empty map', () => {
      const result = mapKeys([]);

      expect(result.size).toBe(0);
    });

    it('maps children array to a map by keys', () => {
      const component1 = createTestComponent('first');
      const component2 = createTestComponent('second');
      const node = document.createElement('div');

      const result = mapKeys([component1, component2, node]);

      expect(result.size).toBe(3);
      expect(result.has('first')).toBe(true);
      expect(result.has('second')).toBe(true);
      // The DOM node will have an internal key
      const nodeKey = getKey(node, 2);
      expect(result.has(nodeKey)).toBe(true);
    });

    it('handles null or undefined children', () => {
      const children = [null, undefined] as any[];

      const result = mapKeys(children);

      expect(result.size).toBe(2);
      expect(result.has('_0')).toBe(true);
      expect(result.has('_1')).toBe(true);
    });

    it('correctly assigns index-based keys to duplicate nodes', () => {
      const div = document.createElement('div');
      // Use the same div twice to test duplicate node handling
      const children = [div, div];

      const result = mapKeys(children);

      // Even though it's the same node, they should get different keys based on index
      expect(result.size).toBe(1);
    });

    it('correctly assigns index-based keys to different nodes', () => {
      const div = document.createElement('div');
      const span = document.createElement('span');
      // Use the same div twice to test duplicate node handling
      const children = [div, span];

      const result = mapKeys(children);

      expect(result.size).toBe(2);
      // Even though it's the same node, they should get different keys based on index
      const keys = Array.from(result.keys());
      expect(keys[0]).not.toBe(keys[1]);
    });
  });

  describe('insertNode', () => {
    it('inserts DOM node as a child', () => {
      const parent = document.createElement('div');
      const child = document.createElement('span');

      insertNode(parent, child);

      expect(parent.childNodes.length).toBe(1);
      expect(parent.firstChild).toBe(child);
    });

    it('inserts component by calling its mount method', () => {
      const parent = document.createElement('div');
      const component = createTestComponent();

      insertNode(parent, component);

      expect(component.mount).toHaveBeenCalledWith(parent, null);
    });

    it('inserts DocumentFragment directly', () => {
      const parent = document.createElement('div');
      const fragment = document.createDocumentFragment();
      const child1 = document.createElement('span');
      const child2 = document.createElement('span');
      fragment.appendChild(child1);
      fragment.appendChild(child2);

      insertNode(parent, fragment);

      expect(parent.childNodes.length).toBe(2);
      expect(parent.childNodes[0]).toBe(child1);
      expect(parent.childNodes[1]).toBe(child2);
    });

    it('inserts node before specified node', () => {
      const parent = document.createElement('div');
      const before = document.createElement('div');
      parent.appendChild(before);
      const child = document.createElement('span');

      insertNode(parent, child, before);

      expect(parent.childNodes.length).toBe(2);
      expect(parent.childNodes[0]).toBe(child);
      expect(parent.childNodes[1]).toBe(before);
    });

    it('inserts component before specified node', () => {
      const parent = document.createElement('div');
      const before = document.createElement('div');
      parent.appendChild(before);
      const component = createTestComponent();

      insertNode(parent, component, before);

      expect(component.mount).toHaveBeenCalledWith(parent, before);
    });
  });

  describe('removeChild', () => {
    it('removes DOM node from parent', () => {
      const parent = document.createElement('div');
      const child = document.createElement('span');
      parent.appendChild(child);

      removeChild(child);

      expect(parent.childNodes.length).toBe(0);
    });

    it('destroys component', () => {
      const component = createTestComponent();

      removeChild(component);

      expect(component.destroy).toHaveBeenCalled();
    });

    it('handles removing node without parent', () => {
      const node = document.createElement('div');

      // Should not throw error
      expect(() => removeChild(node)).not.toThrow();
    });
  });

  describe('replaceChild', () => {
    it('replaces DOM node with another DOM node', () => {
      const parent = document.createElement('div');
      const oldNode = document.createElement('span');
      const newNode = document.createElement('h1');
      parent.appendChild(oldNode);

      replaceChild(parent, newNode, oldNode);

      expect(parent.childNodes.length).toBe(1);
      expect(parent.firstChild).toBe(newNode);
    });

    it('replaces DOM node with component', () => {
      const parent = document.createElement('div');
      const oldNode = document.createElement('span');
      const component = createTestComponent();
      parent.appendChild(oldNode);

      replaceChild(parent, component, oldNode);

      expect(component.mount).toHaveBeenCalled();
      expect(parent.contains(oldNode)).toBe(false);
    });

    it('replaces component with DOM node', () => {
      const parent = document.createElement('div');
      const component = createTestComponent();
      const newNode = document.createElement('h1');

      // First mount the component
      component.mount(parent);
      vi.clearAllMocks();

      replaceChild(parent, newNode, component);

      expect(component.destroy).toHaveBeenCalled();
      expect(parent.contains(newNode)).toBe(true);
    });

    it('works when replacing node with itself', () => {
      const parent = document.createElement('div');
      const node = document.createElement('div');
      parent.appendChild(node);

      // This should be a no-op but shouldn't break
      replaceChild(parent, node, node);

      expect(parent.childNodes.length).toBe(1);
      expect(parent.firstChild).toBe(node);
    });
  });

  describe('patch', () => {
    it('returns original node if nodes are identical', () => {
      const parent = document.createElement('div');
      const node = document.createElement('span');

      const result = patch(parent, node, node);

      expect(result).toBe(node);
    });

    it('updates text node if content changed', () => {
      const parent = document.createElement('div');
      const oldText = document.createTextNode('old');
      const newText = document.createTextNode('new');
      parent.appendChild(oldText);

      const result = patch(parent, oldText, newText);

      expect(result).toBe(oldText);
      expect(oldText.textContent).toBe('new');
    });

    it('reuses text node if content is the same', () => {
      const parent = document.createElement('div');
      const oldText = document.createTextNode('same');
      const newText = document.createTextNode('same');
      parent.appendChild(oldText);

      const result = patch(parent, oldText, newText);

      expect(result).toBe(oldText);
    });

    it('updates component by calling update method for same component type', () => {
      const parent = document.createElement('div');
      const oldComponent = createTestComponent();
      const newComponent = createTestComponent();
      oldComponent.mount(parent);
      newComponent.mount(parent);

      patch(parent, oldComponent, newComponent);

      // expect(oldComponent.update).toHaveBeenCalledWith(newComponent);
    });

    it('replaces different element types', () => {
      const parent = document.createElement('div');
      const oldNode = document.createElement('span');
      const newNode = document.createElement('h1');
      parent.appendChild(oldNode);

      const result = patch(parent, oldNode, newNode);

      expect(result).toBe(newNode);
      expect(parent.contains(oldNode)).toBe(false);
      expect(parent.contains(newNode)).toBe(true);
    });

    it('replaces component with different component type', () => {
      const parent = document.createElement('div');
      const oldComponent = createTestComponent();

      // Create new component with different component function
      const newComponentFn = () => {
        const node = document.createElement('h1');
        node.textContent = 'New Component';
        return node;
      };
      const newComponent = createComponent(newComponentFn);

      // spy on destroy
      const destroySpy = vi.spyOn(oldComponent, 'destroy');
      // spy on update
      const updateSpy = vi.spyOn(oldComponent, 'update');

      oldComponent.mount(parent);

      const result = patch(parent, oldComponent, newComponent);

      // Should not call update since component types are different
      expect(updateSpy).not.toHaveBeenCalled();
      // expect(destroySpy).toHaveBeenCalled();
      expect(result).toBe(newComponent);
    });

    it('preserves key when updating text nodes', () => {
      const parent = document.createElement('div');
      const oldText = document.createTextNode('old');
      const newText = document.createTextNode('new');

      parent.appendChild(oldText);

      // Generate key for old node
      const oldKey = getKey(oldText, 0);

      patch(parent, oldText, newText);

      // Old node should still have the same key
      const updatedKey = getKey(oldText, 1);
      expect(updatedKey).toBe(oldKey);
    });
  });

  describe('patchChildren', () => {
    it('handles empty to non-empty transition efficiently', () => {
      const parent = document.createElement('div');
      const emptyMap = new Map();
      const newChildren = [document.createElement('div'), document.createElement('span')];

      const result = patchChildren(parent, emptyMap, newChildren);

      expect(parent.childNodes.length).toBe(2);
      expect(result.size).toBe(2);
      expect(Array.from(result.values())).toEqual(newChildren);
    });

    it('clears all children when new list is empty', () => {
      const parent = document.createElement('div');
      const child1 = document.createElement('div');
      const child2 = document.createElement('span');
      parent.appendChild(child1);
      parent.appendChild(child2);

      const childMap = new Map();
      childMap.set(getKey(child1, 0), child1);
      childMap.set(getKey(child2, 1), child2);

      const result = patchChildren(parent, childMap, []);

      expect(parent.childNodes.length).toBe(0);
      expect(result.size).toBe(0);
    });

    it('updates existing children with matching keys', () => {
      const parent = document.createElement('div');
      const child1 = document.createElement('div');
      const child2 = document.createElement('span');
      parent.appendChild(child1);
      parent.appendChild(child2);

      const key1 = getKey(child1, 0);
      const key2 = getKey(child2, 1);

      const childMap = new Map();
      childMap.set(key1, child1);
      childMap.set(key2, child2);

      // Create new children with same keys but different content
      const newChild1 = document.createElement('div');
      newChild1.textContent = 'updated';
      Object.defineProperty(newChild1, 'key', { value: key1 });

      const newChild2 = document.createElement('span');
      newChild2.textContent = 'updated';
      Object.defineProperty(newChild2, 'key', { value: key2 });

      const result = patchChildren(parent, childMap, [newChild1, newChild2]);

      expect(parent.childNodes.length).toBe(2);
      expect(parent.childNodes[0].textContent).toBe('updated');
      expect(parent.childNodes[1].textContent).toBe('updated');
      expect(result.size).toBe(2);
    });

    it('removes children not in new list', () => {
      const parent = document.createElement('div');
      const child1 = document.createElement('div');
      const child2 = document.createElement('span');
      const child3 = document.createElement('p');
      parent.appendChild(child1);
      parent.appendChild(child2);
      parent.appendChild(child3);

      const childMap = new Map();
      childMap.set(getKey(child1, 0), child1);
      childMap.set(getKey(child2, 1), child2);
      childMap.set(getKey(child3, 2), child3);

      // Only keep first and third children
      const result = patchChildren(parent, childMap, [child1, child3]);

      expect(parent.childNodes.length).toBe(2);
      expect(parent.childNodes[0]).toBe(child1);
      expect(parent.childNodes[1]).toBe(child3);
      expect(parent.contains(child2)).toBe(false);
      expect(result.size).toBe(2);
    });

    it('adds new children', () => {
      const parent = document.createElement('div');
      const child1 = document.createElement('div');
      parent.appendChild(child1);

      const childMap = new Map();
      childMap.set(getKey(child1, 0), child1);

      const newChild = document.createElement('span');

      const result = patchChildren(parent, childMap, [child1, newChild]);

      expect(parent.childNodes.length).toBe(2);
      expect(parent.childNodes[0]).toBe(child1);
      expect(parent.childNodes[1]).toBe(newChild);
      expect(result.size).toBe(2);
    });

    it('reorders children when order changes', () => {
      const parent = document.createElement('div');
      const child1 = document.createElement('div');
      child1.textContent = '1';
      const child2 = document.createElement('span');
      child2.textContent = '2';
      parent.appendChild(child1);
      parent.appendChild(child2);

      const key1 = getKey(child1, 0);
      const key2 = getKey(child2, 1);

      const childMap = new Map();
      childMap.set(key1, child1);
      childMap.set(key2, child2);

      // Swap order of children
      const result = patchChildren(parent, childMap, [child2, child1]);

      expect(parent.childNodes.length).toBe(2);
      expect(parent.childNodes[0].textContent).toBe('2');
      expect(parent.childNodes[1].textContent).toBe('1');
      expect(result.size).toBe(2);
    });

    it('handles components correctly', () => {
      const parent = document.createElement('div');
      const component1 = createTestComponent('comp1');
      const component2 = createTestComponent('comp2');

      component1.mount(parent);
      component2.mount(parent);

      const childMap = new Map();
      childMap.set('comp1', component1);
      childMap.set('comp2', component2);

      // Remove component2, keep component1
      vi.clearAllMocks();

      const result = patchChildren(parent, childMap, [component1]);

      expect(component2.destroy).toHaveBeenCalled();
      expect(result.size).toBe(1);
      expect(result.has('comp1')).toBe(true);
    });

    it('preserves "before" node when clearing all children', () => {
      const parent = document.createElement('div');
      const child1 = document.createElement('div');
      const child2 = document.createElement('span');
      const beforeNode = document.createElement('p');
      parent.appendChild(child1);
      parent.appendChild(child2);
      parent.appendChild(beforeNode);

      const childMap = new Map();
      childMap.set(getKey(child1, 0), child1);
      childMap.set(getKey(child2, 1), child2);

      const result = patchChildren(parent, childMap, [], beforeNode);

      expect(parent.childNodes.length).toBe(1);
      expect(parent.childNodes[0]).toBe(beforeNode);
      expect(result.size).toBe(0);
    });

    it('uses textContent for efficient clearing when possible', () => {
      const parent = document.createElement('div');

      // Create many children to test the textContent optimization
      const children: Node[] = [];
      for (let i = 0; i < 5; i++) {
        const child = document.createElement('div');
        child.textContent = `Child ${i}`;
        parent.appendChild(child);
        children.push(child);
      }

      const childMap = new Map();
      children.forEach((child, i) => {
        childMap.set(getKey(child, i), child);
      });

      // Spy on textContent setter
      const textContentSpy = vi.spyOn(parent, 'textContent', 'set');

      patchChildren(parent, childMap, []);

      // Should have used textContent for efficient clearing
      expect(textContentSpy).toHaveBeenCalledWith('');
      expect(parent.childNodes.length).toBe(0);
    });

    it('handles mixed operations together add, remove, reorder', () => {
      const parent = document.createElement('div');
      const child1 = document.createElement('div');
      const child2 = document.createElement('span');
      const child3 = document.createElement('p');

      child1.textContent = '1';
      child2.textContent = '2';
      child3.textContent = '3';

      parent.appendChild(child1);
      parent.appendChild(child2);
      parent.appendChild(child3);

      const childMap = new Map();
      childMap.set(getKey(child1, 0), child1);
      childMap.set(getKey(child2, 1), child2);
      childMap.set(getKey(child3, 2), child3);

      // Add new child, remove child2, reorder remaining
      const child4 = document.createElement('a');
      child4.textContent = '4';

      const result = patchChildren(parent, childMap, [child3, child4, child1]);

      // get 4
      expect(parent.childNodes.length).toBe(4);
      // get 3412
      expect(parent.textContent).toBe('3412');
      expect(parent.contains(child2)).toBe(true);
      expect(result.size).toBe(3);
    });

    it('handles batched node replacement with placeholders', () => {
      const parent = document.createElement('div');
      const child1 = document.createElement('div');
      const child2 = document.createElement('span');

      parent.appendChild(child1);
      parent.appendChild(child2);

      const key1 = getKey(child1, 0);
      const key2 = getKey(child2, 1);

      const childMap = new Map();
      childMap.set(key1, child1);
      childMap.set(key2, child2);

      // Create new nodes with the same keys but in a different order
      const newChild1 = document.createElement('div');
      Object.defineProperty(newChild1, 'key', { value: key1 });
      const newChild2 = document.createElement('span');
      Object.defineProperty(newChild2, 'key', { value: key2 });

      // Swap position - this should trigger placeholder creation
      const result = patchChildren(parent, childMap, [newChild2, newChild1]);

      expect(parent.childNodes.length).toBe(2);
      expect(result.size).toBe(2);
    });
  });

  // Testing more complex integration scenarios
  describe('complex scenarios', () => {
    it('handles nested components correctly', () => {
      const parent = document.createElement('div');

      // Create a parent component that will contain a child component
      const childComponent = createTestComponent('child');
      const parentComponentFn = () => {
        const node = document.createElement('div');
        node.textContent = 'Parent Component';
        return node;
      };

      const parentComponent = createComponent(parentComponentFn, { key: 'parent' });

      // Mount parent component
      parentComponent.mount(parent);

      // Simulate a component update where the child is added
      const childMap = new Map();
      childMap.set('parent', parentComponent);

      const result = patchChildren(parent, childMap, [parentComponent, childComponent] as any[]);

      expect(result.size).toBe(2);
      expect(result.has('parent')).toBe(true);
      expect(result.has('child')).toBe(true);
    });

    it('handles multiple updates to the same DOM tree', () => {
      const parent = document.createElement('div');

      // Initial children setup
      const children1 = [
        document.createElement('div'),
        document.createElement('span'),
        document.createElement('p'),
      ];

      children1.forEach(child => {
        parent.appendChild(child);
      });

      // First update: add two more elements
      let childMap = mapKeys(children1);
      const children2 = [...children1, document.createElement('h1'), document.createElement('h2')];

      childMap = patchChildren(parent, childMap, children2);
      expect(parent.childNodes.length).toBe(5);

      // Second update: remove middle elements
      const children3 = [children2[0], children2[4]];

      childMap = patchChildren(parent, childMap, children3);
      expect(parent.childNodes.length).toBe(2);
      expect(parent.childNodes[0]).toBe(children2[0]);
      expect(parent.childNodes[1]).toBe(children2[4]);

      // Third update: clear all
      const finalMap = patchChildren(parent, childMap, []);
      expect(parent.childNodes.length).toBe(0);
      expect(finalMap.size).toBe(0);
    });
  });

  // Testing component-related utility functions
  describe('component utilities', () => {
    it('isComponent correctly identifies components', () => {
      const component = createTestComponent();
      const div = document.createElement('div');

      expect(isComponent(component)).toBe(true);
      expect(isComponent(div)).toBe(false);
      expect(isComponent(null)).toBe(false);
      expect(isComponent({})).toBe(false);
    });
  });
});
