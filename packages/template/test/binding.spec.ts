import { computed, signal } from '@estjs/signal';
import * as signalModule from '@estjs/signal';
import {
  addEventListener,
  convertToNode,
  createComponentEffect,
  insert,
  mapNodes,
  setAttr,
  setClass,
  setStyle,
  trackDependency,
  trackSignal,
} from '../src/binding';
import { type Context, createContext, popContextStack, pushContextStack } from '../src/context';
import * as operations from '../src/operations';
import { REF_KEY } from '../src/constants';

describe('binding Module', () => {
  let mockContext: Context;
  let cleanupSpy: any;

  beforeEach(() => {
    // Create a real context
    mockContext = createContext();
    cleanupSpy = vi.spyOn(mockContext.cleanup, 'add');

    // Set as active context
    pushContextStack(mockContext);
  });

  afterEach(() => {
    // Restore context
    popContextStack();
    vi.restoreAllMocks();
  });

  describe('addEventListener function', () => {
    let node: HTMLElement;
    let listener: EventListener;

    beforeEach(() => {
      // Create a new node and listener for each test
      node = document.createElement('div');
      listener = vi.fn();
      vi.spyOn(node, 'addEventListener');
      vi.spyOn(node, 'removeEventListener');
    });

    it('should add event listener to node and register cleanup function', () => {
      // Call addEventListener
      addEventListener(node, 'click', listener);

      // Verify cleanup function was added
      expect(cleanupSpy).toHaveBeenCalled();

      // Get registered cleanup function
      const cleanupFn: any = cleanupSpy.mock.calls[0][0];

      // Execute cleanup function
      cleanupFn();

      // Verify removeEventListener was called with correct parameters
      expect(node.removeEventListener).toHaveBeenCalledWith('click', listener, undefined);
    });

    it('should handle different event types and options', () => {
      const options = { capture: true, passive: true };

      addEventListener(node, 'focus', listener, options);

      const cleanupFn: any = cleanupSpy.mock.calls[0][0];
      cleanupFn();

      expect(node.removeEventListener).toHaveBeenCalledWith('focus', listener, options);
    });

    it('should not add event listener or cleanup function when no active context', () => {
      // Remove active context
      popContextStack();

      addEventListener(node, 'click', listener);

      // Should not add cleanup function
      expect(cleanupSpy).not.toHaveBeenCalled();
    });
  });

  describe('trackSignal function', () => {
    let updateFn: any;

    beforeEach(() => {
      updateFn = vi.fn();
    });

    it('should directly call updateFn for regular values', () => {
      const testValues = ['string', 123, true, { key: 'value' }, [1, 2, 3]];

      testValues.forEach(value => {
        updateFn.mockClear();
        trackSignal(value, updateFn);
        expect(updateFn).toHaveBeenCalledWith(value);
      });
    });

    it('should handle signal values by tracking dependency', () => {
      const testSignal = signal('test-value');
      const trackDependencySpy = vi.spyOn(mockContext.deps, 'set');

      trackSignal(testSignal, updateFn);

      expect(trackDependencySpy).toHaveBeenCalled();
      expect(cleanupSpy).toHaveBeenCalled();
    });

    it('should handle computed values by tracking dependency', () => {
      const testComputed = computed(() => 'computed-value');
      const trackDependencySpy = vi.spyOn(mockContext.deps, 'set');

      trackSignal(testComputed, updateFn);

      expect(trackDependencySpy).toHaveBeenCalled();
      expect(cleanupSpy).toHaveBeenCalled();
    });

    it('should handle function values by creating computed', () => {
      const testFn = () => 'function-value';
      const computedSpy = vi.spyOn(signalModule, 'computed');

      trackSignal(testFn, updateFn);

      expect(computedSpy).toHaveBeenCalled();
    });
  });

  describe('trackDependency function', () => {
    let updateFn: any;

    beforeEach(() => {
      updateFn = vi.fn();
    });

    it('should add updateFn to dependency set in context', () => {
      const testSignal = signal('test');

      trackDependency(testSignal, updateFn);

      const depSet = mockContext.deps.get(testSignal);
      expect(depSet).toBeInstanceOf(Set);
      expect(depSet?.has(updateFn)).toBe(true);
    });

    it('should add updateFn to existing dependency set', () => {
      const testSignal = signal('test');
      const existingSet = new Set([vi.fn()]);
      mockContext.deps.set(testSignal, existingSet);

      trackDependency(testSignal, updateFn);

      expect(mockContext.deps.get(testSignal)).toBe(existingSet);
      expect(existingSet.has(updateFn)).toBe(true);
    });

    it('should add cleanup function for signals', () => {
      const testSignal = signal('test');

      trackDependency(testSignal, updateFn);

      expect(cleanupSpy).toHaveBeenCalled();
      const cleanupFn = cleanupSpy.mock.calls[0][0];

      // Call cleanup function
      cleanupFn();

      // Should remove dependency from context deps
      expect(mockContext.deps.has(testSignal)).toBe(false);
    });

    it('should add cleanup function for computed values', () => {
      const testComputed = computed(() => 'computed');

      trackDependency(testComputed, updateFn);

      expect(cleanupSpy).toHaveBeenCalled();
    });

    it('should do nothing if no active context', () => {
      popContextStack();
      const testSignal = signal('test');

      trackDependency(testSignal, updateFn);

      expect(mockContext.deps.size).toBe(0);
      expect(cleanupSpy).not.toHaveBeenCalled();
    });
  });

  describe('createComponentEffect function', () => {
    it('should create effect to track all dependencies', () => {
      const effectSpy = vi.spyOn(signalModule, 'effect');

      createComponentEffect();

      expect(effectSpy).toHaveBeenCalled();
      expect(cleanupSpy).toHaveBeenCalled();
    });

    it('should not create effect if no active context', () => {
      popContextStack();
      const effectSpy = vi.spyOn(signalModule, 'effect');

      createComponentEffect();

      expect(effectSpy).not.toHaveBeenCalled();
      expect(cleanupSpy).not.toHaveBeenCalled();
    });
  });

  describe('setAttr function', () => {
    let element: HTMLElement;

    beforeEach(() => {
      element = document.createElement('div');
    });

    it('should handle ref attribute specially', () => {
      const refSignal = signal(null);

      setAttr(element, REF_KEY, refSignal);

      expect(refSignal.value).toStrictEqual(element);
    });

    it('should use patchAttr for regular attributes', () => {
      const patchAttrSpy = vi.spyOn(operations, 'patchAttr');
      patchAttrSpy.mockReturnValue(vi.fn());

      setAttr(element, 'data-test', 'value');

      expect(patchAttrSpy).toHaveBeenCalledWith(element, 'data-test', undefined);
    });

    it('should track signal attributes', () => {
      const valueSig = signal('sig-value');
      const trackSignalSpy = vi.spyOn(mockContext.deps, 'set');

      setAttr(element, 'data-test', valueSig);

      expect(trackSignalSpy).toHaveBeenCalled();
    });
  });

  describe('setStyle function', () => {
    let element: HTMLElement;

    beforeEach(() => {
      element = document.createElement('div');
    });

    it('should use patchStyle for style properties', () => {
      const patchStyleSpy = vi.spyOn(operations, 'patchStyle');
      patchStyleSpy.mockReturnValue(vi.fn());

      setStyle(element, { color: 'red' });

      expect(patchStyleSpy).toHaveBeenCalledWith(element);
    });

    it('should track signal style values', () => {
      const styleSig = signal({ color: 'red' });
      const trackSignalSpy = vi.spyOn(mockContext.deps, 'set');

      setStyle(element, styleSig);

      expect(trackSignalSpy).toHaveBeenCalled();
    });

    it('should do nothing if element is not provided', () => {
      const patchStyleSpy = vi.spyOn(operations, 'patchStyle');

      setStyle(null as any, { color: 'red' });

      expect(patchStyleSpy).not.toHaveBeenCalled();
    });
  });

  describe('setClass function', () => {
    let element: HTMLElement;

    beforeEach(() => {
      element = document.createElement('div');
    });

    it('should use patchClass for class values', () => {
      const patchClassSpy = vi.spyOn(operations, 'patchClass');
      patchClassSpy.mockReturnValue(vi.fn());

      setClass(element, 'test-class');

      expect(patchClassSpy).toHaveBeenCalledWith(element, undefined);
    });

    it('should track signal class values', () => {
      const classSig = signal('sig-class');
      const trackSignalSpy = vi.spyOn(mockContext.deps, 'set');

      setClass(element, classSig);

      expect(trackSignalSpy).toHaveBeenCalled();
    });

    it('should do nothing if element is not provided', () => {
      const patchClassSpy = vi.spyOn(operations, 'patchClass');

      setClass(null as any, 'test-class');

      expect(patchClassSpy).not.toHaveBeenCalled();
    });
  });

  describe('mapNodes function', () => {
    it('should map nodes by index', () => {
      const template = document.createElement('div');
      const child1 = document.createElement('span');
      const child2 = document.createElement('p');
      template.appendChild(child1);
      template.appendChild(child2);

      const nodes = mapNodes(template, [1, 2]);

      expect(nodes).toHaveLength(2);
      expect(nodes[0]).toBe(template);
      expect(nodes[1]).toBe(child1);
    });

    it('should handle nested nodes', () => {
      const template = document.createElement('div');
      const child1 = document.createElement('span');
      const grandchild = document.createElement('strong');
      child1.appendChild(grandchild);
      template.appendChild(child1);

      const nodes = mapNodes(template, [1, 3]);

      expect(nodes).toHaveLength(2);
      expect(nodes[0]).toBe(template);
      expect(nodes[1]).toBe(grandchild);
    });
  });

  describe('convertToNode function', () => {
    it('should return node as is', () => {
      const node = document.createElement('div');

      const result = convertToNode(node);

      expect(result).toBe(node);
    });

    it('should convert primitive values to text nodes', () => {
      const values = ['text', 123, true];

      values.forEach(value => {
        const result = convertToNode(value);

        expect(result).toBeInstanceOf(Text);
        expect(result.textContent).toBe(String(value));
      });
    });

    it('should convert falsy values to empty text nodes', () => {
      const values = [null, undefined, false, 0, ''];
      const valueResults = ['', '', '', '0', ''];

      values.forEach((value, index) => {
        const result = convertToNode(value);

        expect(result).toBeInstanceOf(Text);
        expect(result.textContent).toBe(valueResults[index]);
      });
    });

    it('should return non-primitive values as is', () => {
      const obj = { foo: 'bar' };

      // @ts-ignore
      const result = convertToNode(obj);

      expect(result).toBe(obj);
    });
  });

  describe('insert function', () => {
    let parent: HTMLElement;
    let node: HTMLElement;
    let before: HTMLElement;

    beforeEach(() => {
      parent = document.createElement('div');
      node = document.createElement('span');
      before = document.createElement('p');
      parent.appendChild(before);
    });

    // it('should create effect to insert node into parent', () => {
    //   const effectSpy = vi.spyOn(signalModule, 'effect');
    //   const patchChildrenSpy = vi.spyOn(patch, 'patchChildren');
    //   patchChildrenSpy.mockReturnValue(new Map());

    //   insert(parent, node, before);

    //   expect(effectSpy).toHaveBeenCalled();

    //   // Call the effect callback
    //   const effectCallback = effectSpy.mock.calls[0][0];
    //   effectCallback();

    //   expect(patchChildrenSpy).toHaveBeenCalledWith(
    //     parent,
    //     expect.any(Map),
    //     expect.arrayContaining([node]),
    //     before,
    //   );
    // });

    // it('should handle function node by calling it', () => {
    //   const nodeFunc = () => node;
    //   const effectSpy = vi.spyOn(signalModule, 'effect');
    //   const patchChildrenSpy = vi.spyOn(patch, 'patchChildren');
    //   patchChildrenSpy.mockReturnValue(new Map());

    //   insert(parent, nodeFunc, before);

    //   // Call the effect callback
    //   const effectCallback = effectSpy.mock.calls[0][0];
    //   effectCallback();

    //   expect(patchChildrenSpy).toHaveBeenCalledWith(
    //     parent,
    //     expect.any(Map),
    //     expect.arrayContaining([node]),
    //     before,
    //   );
    // });

    it('should do nothing if parent is not provided', () => {
      const effectSpy = vi.spyOn(signalModule, 'effect');

      insert(null as any, node);

      expect(effectSpy).not.toHaveBeenCalled();
    });

    it('should do nothing if no active context', () => {
      popContextStack();
      const effectSpy = vi.spyOn(signalModule, 'effect');

      insert(parent, node);

      expect(effectSpy).not.toHaveBeenCalled();
    });

    it('should add cleanup function to context', () => {
      insert(parent, node);

      expect(cleanupSpy).toHaveBeenCalled();
    });
  });
});
