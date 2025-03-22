import { type Signal, computed, effect, isComputed, isSignal } from '@estjs/signal';
import { coerceArray, isFalsy, isFunction } from '@estjs/shared';
import { getCurrentContext, getOrInitRenderedNodes } from './context';
import { isComponent } from './renderer';
import { patchChildren } from './patch';

import { type Style, patchStyle } from './modules/style';
import { type ClassValue, patchClass } from './modules/class';
import { type AttrValue, patchAttr } from './modules/attrs';
import { addEvent } from './modules/event';
import type { NodeOrComponent } from './types';

export function addEventListener(
  el: Element,
  event: string,
  handler: EventListener,
  options?: AddEventListenerOptions,
): void {
  const context = getCurrentContext();
  if (!context) {
    return;
  }

  const cleanup = addEvent(el, event, handler, options);
  context.cleanup.add(cleanup);
}

// Generic function for reactive values
function trySignalValue<T>(
  value: T | Signal<T> | (() => T),
  setFn: (value: T, prev?: T) => void,
): void {
  if (isSignal(value) || isComputed(value)) {
    let prevValue: T | undefined;
    effect(
      () => {
        const newValue = value.value as T;
        setFn(newValue, prevValue);
        // update prevValue
        prevValue = newValue;
      },
      { flush: 'post' },
    );
  } else if (isFunction(value)) {
    let prevValue: T | undefined;
    const computedValue = computed(() => (value as () => T)());
    effect(
      () => {
        const newValue = computedValue.value;
        setFn(newValue, prevValue);
        // update prevValue
        prevValue = newValue;
      },
      { flush: 'post' },
    );
  } else {
    // not reactive
    setFn(value);
  }
}

/**
 * Sets the style of an element
 * @param el The element
 * @param style The style value
 */
export function setStyle(el: HTMLElement, style: Style | Signal<Style> | (() => Style)): void {
  if (!el) {
    return;
  }
  trySignalValue<Style>(style, patchStyle(el));
}

/**
 * Sets the class of an element
 * @param el The element
 * @param value The class value
 * @param isSVG Whether the element is an SVG element
 */
export function setClass(
  el: HTMLElement,
  value: ClassValue | Signal<ClassValue> | (() => ClassValue),
  isSVG?: boolean,
): void {
  if (!el) {
    return;
  }
  trySignalValue<ClassValue>(value, patchClass(el, isSVG));
}

/**
 * Sets an attribute on an element
 * @param el The element
 * @param key The attribute name
 * @param value The attribute value
 * @param isSVG Whether the element is an SVG element
 */
export function setAttr(
  el: HTMLElement,
  key: string,
  value: AttrValue | Signal<AttrValue> | (() => AttrValue),
  isSVG?: boolean,
): void {
  trySignalValue<AttrValue>(value, patchAttr(el, key, isSVG));
}

export function mapNodes(template: Node, idxs: number[]) {
  let index = 1;
  const tree: Node[] = [];

  const walk = (node: Node) => {
    if (node.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) {
      if (idxs.includes(index)) {
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
 * Converts any data to Node or JSX.Element type
 * @param data Data to convert
 * @returns Node or JSX.Element
 */
export function coerceNode(data: unknown): NodeOrComponent {
  if (isComponent(data) || data instanceof Node) {
    return data as NodeOrComponent;
  }
  const text = isFalsy(data) ? '' : String(data);
  return document.createTextNode(text);
}

/**
 * Inserts a node into the DOM
 * @param parent Parent node
 * @param node Node or function that returns a node
 * @param before Node to insert before
 */
export function insert(
  parent: Node,
  node: NodeOrComponent | NodeOrComponent[] | (() => NodeOrComponent | NodeOrComponent[]),
  before?: Node,
): void {
  if (!parent) {
    return;
  }

  const context = getCurrentContext()!;
  context.renderedIndex++;
  const cleanup = effect(() => {
    const renderedNode = getOrInitRenderedNodes(context, context.renderedIndex);
    const result = typeof node === 'function' ? node() : node;
    const newNodes = coerceArray(result).map(coerceNode) as Node[];

    context.renderedNodes[context.renderedIndex] = patchChildren(
      parent,
      renderedNode,
      newNodes,
      before,
    );
  });

  // Mark this cleanup as an effect cleanup
  context.cleanup.add(cleanup);
  // Clear the previous render result
  context.cleanup.add(() => {
    context.renderedNodes[context.renderedIndex] = new Map();
  });
}
