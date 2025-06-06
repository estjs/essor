import { type Signal, computed, effect, isComputed, isSignal } from '@estjs/signal';
import { coerceArray, hasChanged, isFalsy, isFunction, isPrimitive } from '@estjs/shared';
import { getActiveContext } from './context';
import { addEvent, patchAttr, patchClass, patchStyle } from './operations';
import { REF_KEY } from './constants';
import { patchChildren } from './patch';
import type { AnyNode } from './types';

/**
 * add an event listener to a node
 * @param {Element} node - the node to add the event listener to
 * @param {string} eventName - the event name to listen to
 * @param {EventListener} listener - the listener to call when the event is triggered
 * @param {AddEventListenerOptions} listenerOptions - the options for the event listener
 */
export function addEventListener(
  node: Element,
  eventName: string,
  listener: EventListener,
  listenerOptions?: AddEventListenerOptions,
) {
  const activeContext = getActiveContext();
  // add the event listener to the node
  const cleanupFn = addEvent(node, eventName, listener, listenerOptions);
  activeContext?.cleanup.add(cleanupFn);
}

/**
 * handle the signal,computed,function,
 * @param {unknown} value - the value to handle
 * @param {Function} updateFn - the function to update the value
 */
export function trackSignal(
  value: unknown,
  updateFn: (newValue: unknown, prevValue?: unknown) => void,
): void {
  // check if the value is a signal or computed
  if (isSignal(value) || isComputed(value)) {
    // add the update function to the cleanup
    trackDependency(value, updateFn);
    return;
  }

  if (isFunction(value)) {
    // add the update function to the cleanup
    trackDependency(
      computed(() => value()),
      updateFn,
    );

    return;
  }

  //normal value, just update the value
  updateFn(value);
}

/**
 * add the update function to the dependency
 * @param {unknown} dependency - the dependency to add the update function to
 * @param {Function} updateFn - the function to update the dependency
 */
export function trackDependency(
  dependency: unknown,
  updateFn: (newValue: unknown, prevValue?: unknown) => void,
): void {
  const context = getActiveContext();
  if (!context) {
    return;
  }

  // Add directly to dependency collection
  const dep = context.deps.get(dependency);
  if (!dep) {
    context.deps.set(dependency, new Set([updateFn]));
  } else {
    dep.add(updateFn);
  }

  // Immediately set up automatic cleanup
  if (isSignal(dependency) || isComputed(dependency)) {
    const cleanup = () => {
      context.deps.delete(dependency);
    };
    context.cleanup.add(cleanup);
  }
}
/**
 * create a component effect
 * @returns {void}
 */
export function createComponentEffect() {
  const context = getActiveContext();
  if (!context) {
    return;
  }

  const setupEffect = () => {
    // Collect current values of all dependencies
    const values = new Map();

    // Create a single effect to monitor all dependencies
    const cleanup = effect(() => {
      // Check which values have changed and only update those
      context.deps.forEach((updateFnSet, dep) => {
        const newValue = isSignal(dep) || isComputed(dep) ? dep.value : dep;
        const oldValue = values.get(dep);
        if (hasChanged(newValue, oldValue)) {
          values.set(dep, newValue);
          updateFnSet.forEach(updateFn => updateFn(newValue, oldValue));

          context.componentEffect.forEach(effectFn => effectFn());
        }
      });
    });

    context.cleanup.add(cleanup);
  };

  setupEffect();
}
/**
 * set the style of the element
 * @param {HTMLElement} element - the element to set the style
 * @param {unknown} style - the style to set
 */
export function setStyle(element: HTMLElement, style: unknown) {
  if (!element) {
    return;
  }

  trackSignal(style, patchStyle(element));
}

/**
 * set the class of the element
 * @param {HTMLElement} element - the element to set the class
 * @param {unknown} value - the value to set the class
 * @param {boolean} isSVG - whether the element is an SVG element
 */
export function setClass(
  element: HTMLElement,
  value: string | Signal<unknown> | Function | any,
  isSVG?: boolean,
) {
  if (!element) {
    return;
  }
  // Check if element is SVG if not explicitly provided
  trackSignal(value, patchClass(element, isSVG));
}

/**
 * set the attribute of the element
 * @param {HTMLElement} el - the element to set the attribute
 * @param {string} key - the key of the attribute
 * @param {unknown} value - the value of the attribute
 * @param {boolean} isSVG - whether the element is an SVG element
 */
export function setAttr(el: HTMLElement, key: string, value: unknown, isSVG?: boolean) {
  // if the key is ref, set the value to the element
  if (key === REF_KEY) {
    if (isSignal(value)) {
      value.value = el;
    }
    return;
  }

  // Check if element is SVG if not explicitly provided
  trackSignal(value, patchAttr(el, key, isSVG));
}

/**
 * map the nodes
 * @param {Node} template - the template to map the nodes
 * @param {number[]} indexes - the indexes of the nodes to map
 * @returns {Node[]} the nodes
 */
export function mapNodes(template, indexes: number[]) {
  let index = 1;
  const tree: Node[] = [];

  const walk = (node: Node) => {
    if (node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
      if (indexes.includes(index)) {
        tree.push(node);
      }
      index++;
    }
    let child = node.firstChild;
    while (child) {
      walk(child);
      child = child.nextSibling;
    }
  };
  walk(template);

  return tree;
}

/**
 * coerce the node
 * @param {string | number | boolean | null | undefined | Node} data - the data to coerce
 * @returns {Node} the node
 */
export function convertToNode(data: string | number | boolean | null | undefined | Node): Node {
  if (data instanceof Node) {
    return data;
  }
  if (isPrimitive(data)) {
    const textContent = isFalsy(data) ? '' : String(data);
    return document.createTextNode(textContent);
  }
  return data;
}

export function insert(parent: Node, node: Function | Node, before?: Node) {
  if (!parent) {
    return;
  }

  const context = getActiveContext();
  if (!context) {
    return;
  }

  let renderedNodes = new Map<string, AnyNode>();

  const cleanup = effect(
    () => {
      const newNodes = coerceArray(isFunction(node) ? node() : node).map(convertToNode);
      // update the nodes
      renderedNodes = patchChildren(parent, renderedNodes, newNodes, before);
    },
    { flush: 'post' },
  );

  // cleanup
  context.cleanup.add(() => {
    renderedNodes.clear();
    cleanup();
  });
}
