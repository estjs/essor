import { coerceArray, isFunction, isString } from '@estjs/shared';
import { effect } from '@estjs/signals';
import { addEventListener } from './events';
import { type Scope, getActiveScope, onCleanup, runWithScope } from './scope';
import { normalizeNode, removeNode } from './dom';
import { reconcileArrays } from './reconcile';
import { isHydrating } from './hydration';
import type { AnyNode } from './types';

export interface BindModifiers {
  trim?: boolean;
  number?: boolean;
  lazy?: boolean;
}

/**
 * Returns the first child of a node.
 *
 * @param node - The node to get the child from.
 * @returns The first child node or null.
 */
export function child(node: Node | null): Node | null {
  return node?.firstChild || null;
}

/**
 * Returns the next sibling after advancing by `step`.
 *
 * @param node - The starting node.
 * @param step - Number of steps to advance.
 * @returns The resulting sibling node or null.
 */
export function next(node: Node | null, step: number = 1): Node | null {
  while (node && step > 0) {
    node = node.nextSibling;
    step--;
  }
  return node || null;
}

/**
 * Returns the child node at the requested index.
 *
 * @param node - The parent node.
 * @param index - The child index.
 * @returns The child node at index or null.
 */
export function nthChild(node: Node | null, index: number): Node | null {
  if (!node || index < 0) return null;
  let current = node.firstChild;
  while (current && index > 0) {
    current = current.nextSibling;
    index--;
  }
  return current || null;
}

/**
 * Synchronizes a DOM element property with a model getter and setter.
 *
 * @param node - The element to bind.
 * @param prop - The property name to bind.
 * @param getter - The value getter or static value.
 * @param setter - The value setter.
 * @param modifiers - Optional binding modifiers.
 * @returns {void}
 */
export function bindElement(
  node: Element | null,
  prop: 'value' | 'checked' | 'files' | string,
  getter: (() => unknown) | unknown,
  setter: (value: unknown) => void,
  modifiers: BindModifiers = {},
): void {
  if (!node) return;
  let syncingFromModel = false;

  /**
   * Applies trim and number modifiers to an incoming bound value.
   */
  const processValue = (val: unknown): unknown => {
    if (!isString(val)) return val;
    const result = modifiers.trim ? val.trim() : val;
    if (modifiers.number && result !== '') {
      const parsed = Number(result);
      if (!Number.isNaN(parsed)) return parsed;
    }
    return result;
  };

  const nodeName = node.nodeName;
  const isInput = nodeName === 'INPUT';
  const isSelect = nodeName === 'SELECT';
  const isTextArea = nodeName === 'TEXTAREA';
  const inputType = isInput ? (node as HTMLInputElement).type : '';

  /**
   * Reads the current value from the element.
   */
  const readFromElement = (): unknown => {
    if (isInput) {
      const input = node as HTMLInputElement;
      if (inputType === 'checkbox') return input.checked;
      if (inputType === 'radio') return input.checked ? input.value : '';
      if (inputType === 'file') return input.files;
      return input.value;
    }
    if (isSelect) {
      const select = node as HTMLSelectElement;
      return select.multiple
        ? Array.from(select.selectedOptions).map((opt) => opt.value)
        : select.value;
    }
    if (isTextArea) return (node as HTMLTextAreaElement).value;
    return (node as any)[prop];
  };

  /**
   * Writes the current model value back to the element.
   */
  const writeToElement = (modelValue: unknown): void => {
    syncingFromModel = true;
    try {
      if (isInput) {
        const input = node as HTMLInputElement;
        if (inputType === 'checkbox') {
          const nextValue = Boolean(modelValue);
          if (input.checked !== nextValue) input.checked = nextValue;
          return;
        }
        if (inputType === 'radio') {
          const nextValue = String(modelValue) === input.value;
          if (input.checked !== nextValue) input.checked = nextValue;
          return;
        }
        if (inputType === 'file') return;

        const nextValue = modelValue == null ? '' : String(modelValue);
        if (input.value !== nextValue) input.value = nextValue;
        return;
      }

      if (isSelect) {
        const select = node as HTMLSelectElement;
        if (select.multiple && Array.isArray(modelValue)) {
          const selected = new Set(modelValue.map((v) => String(v)));
          for (const option of Array.from(select.options)) {
            option.selected = selected.has(option.value);
          }
          return;
        }
        const nextValue = modelValue == null ? '' : String(modelValue);
        if (select.value !== nextValue) select.value = nextValue;
        return;
      }

      if (isTextArea) {
        const textarea = node as HTMLTextAreaElement;
        const nextValue = modelValue == null ? '' : String(modelValue);
        if (textarea.value !== nextValue) textarea.value = nextValue;
        return;
      }

      (node as any)[prop] = modelValue;
    } finally {
      syncingFromModel = false;
    }
  };

  /**
   * Reads the current model value.
   */
  const readModel = () => (isFunction(getter) ? (getter as () => unknown)() : getter);

  /**
   * Pushes element changes back into the bound model.
   */
  const onInput = () => {
    if (syncingFromModel) return;
    const rawValue = readFromElement();
    if (rawValue === undefined) return;

    if (isInput && inputType === 'file') {
      setter(rawValue);
      return;
    }

    const nextValue = processValue(rawValue);
    if (!isFunction(getter)) {
      setter(nextValue);
      return;
    }

    const prevValue = readModel();
    if (!Object.is(prevValue, nextValue)) setter(nextValue);
  };

  const forceChangeEvent =
    isSelect ||
    (isInput && (inputType === 'checkbox' || inputType === 'radio' || inputType === 'file'));
  const eventName = forceChangeEvent || modifiers.lazy ? 'change' : 'input';

  addEventListener(node, eventName, onInput as EventListener);
  if (isInput && inputType === 'file' && eventName !== 'input') {
    addEventListener(node, 'input', onInput as EventListener);
  }

  const stopEffect = effect(() => writeToElement(readModel()));

  if (getActiveScope()) {
    onCleanup(() => stopEffect.stop());
  }
}

/**
 * Reactive node insertion with binding support
 *
 * @param parent Parent node
 * @param nodeFactory Node factory function or static node
 * @param before Reference node for insertion position
 * @example
 * ```typescript
 * insert(container, () => message.value, null);
 * insert(container, staticElement, referenceNode);
 * insert(container, "Hello World", null); // Direct string support
 * ```
 */
export function insert(parent: Node, nodeFactory: AnyNode, before?: Node) {
  if (!parent) return;
  // Capture owner scope at call time - this is critical for correct context inheritance
  // When dynamic components are created inside effects, they need to inherit from
  // the scope that was active when insert() was called, not when the effect runs
  const ownerScope: Scope | null = getActiveScope();

  let renderedNodes: Node[] = [];
  let isFirstRun = true;

  // Create effect for reactive updates
  const effectRunner = effect(() => {
    const executeUpdate = () => {
      const rawNodes = isFunction(nodeFactory) ? nodeFactory() : nodeFactory;
      const nodes = coerceArray(rawNodes as unknown)
        .map((item) => (isFunction(item) ? item() : item))
        .flatMap((i) => i)
        .map(normalizeNode) as Node[];
      // Hydration mode: skip DOM operations on first run only when every
      // node already exists under the target parent. Component instances and
      // fallback CSR nodes still need the normal reconcile path.
      if (
        isFirstRun &&
        isHydrating() &&
        nodes.every((node) => node instanceof Node && node.parentNode === parent)
      ) {
        renderedNodes = nodes;
        isFirstRun = false;
        return;
      }
      renderedNodes = reconcileArrays(parent, renderedNodes as Node[], nodes, before) as Node[];
      isFirstRun = false;
    };

    // If we have an owner scope, run within it to maintain context hierarchy
    if (ownerScope && !ownerScope.isDestroyed) {
      runWithScope(ownerScope, executeUpdate);
    } else {
      executeUpdate();
    }
  });

  onCleanup(() => {
    effectRunner.stop();
    renderedNodes.forEach((node) => removeNode(node));
    renderedNodes.length = 0;
  });

  return renderedNodes;
}
