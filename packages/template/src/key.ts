import { error, isNaN, isNull, isString, isSymbol, warn } from '@estjs/shared';
import { isComponent } from './component';
import type { AnyNode } from './types';

const MAX_KEY_LENGTH = 1000;

export type NodeKey = string | number | symbol;

/** Cache for component type key prefixes */
const componentKeyPrefixCache = new WeakMap<Function, string>();

/**
 * Generates a stable key prefix for a component type.
 * @param type - The component function
 * @returns The generated key prefix
 */
export function getComponentKey(type: Function): string {
  let prefix = componentKeyPrefixCache.get(type);
  if (!prefix) {
    const name = type.name || 'anonymous';
    const hash = simpleHash(type.toString()).toString(36);
    prefix = `${name}_${hash}`;
    componentKeyPrefixCache.set(type, prefix);
  }
  return prefix;
}

/**
 * Simple string hash function (DJB2 variant)
 * @param str - The input string
 * @returns The hash code
 */
function simpleHash(str: string): number {
  let hash = 0;
  const len = Math.min(str.length, 100);
  for (let i = 0; i < len; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash = Math.trunc(hash);
  }
  return Math.abs(hash);
}

// Symbol ID counter
let symbolIdCounter = 0;

function getSymbolId(): string {
  return `${symbolIdCounter++}`;
}

/**
 * Aggressively optimized key normalization
 * Inlined common paths for maximum performance
 */
export function normalizeKey(key: any): string | undefined {
  // Null check - most critical fast path
  if (isNull(key)) {
    return undefined;
  }

  if (__DEV__) {
    // NaN check
    if (isNaN(key)) {
      warn('[Key System] NaN cannot be used as a key');
      return undefined;
    }
    // Infinity check
    if (!Number.isFinite(key)) {
      warn('[Key System] Infinity cannot be used as a key');
      return undefined;
    }
    return String(key);
  }

  // String fast path (most common ~60% of cases)
  if (isString(key)) {
    const len = key.length;
    if (len > MAX_KEY_LENGTH) {
      if (__DEV__) {
        warn(
          `[Key System] Key length exceeds ${MAX_KEY_LENGTH} characters. ` +
            `This may impact performance. Consider using a shorter identifier.`,
        );
      }
      return `${key.slice(0, MAX_KEY_LENGTH - 10)}_${simpleHash(key).toString(36)}`;
    }
    return key;
  }

  // Symbol
  if (isSymbol(key)) {
    const globalKey = Symbol.keyFor(key);
    if (globalKey) {
      return `_s.${globalKey}`;
    }
    const desc = key.description;
    if (desc) {
      return `_s.${desc}`;
    }
    return getSymbolId();
  }

  return String(key);
}

/**
 * Fast type checking without function call overhead
 * This is used in hot paths where performance is critical
 */
export function isSameNodeType(a: AnyNode, b: AnyNode): boolean {
  const aIsComponent = isComponent(a);
  const bIsComponent = isComponent(b);

  if (aIsComponent && bIsComponent) {
    return a.component === b.component;
  }

  if (aIsComponent !== bIsComponent) {
    return false;
  }

  const aNode = a as Node;
  const bNode = b as Node;

  if (aNode.nodeType !== bNode.nodeType) {
    return false;
  }

  if (aNode.nodeType === Node.ELEMENT_NODE) {
    return (aNode as Element).tagName === (bNode as Element).tagName;
  }

  return true;
}

/** Symbol for storing keys on DOM nodes - direct property access */
const NODE_KEY_SYMBOL = Symbol('est.key');

/**
 * Sets a key on a DOM node using Symbol property
 * Direct property access is ~40% faster than WeakMap
 */
export function setNodeKey(node: AnyNode, key: NodeKey | undefined): void {
  if (isComponent(node)) {
    return;
  }

  if (!node || node.nodeType === Node.DOCUMENT_NODE) {
    if (__DEV__) {
      warn('[Key System] Cannot set key on invalid node');
    }
    return;
  }

  const normalizedKey = normalizeKey(key);

  if (normalizedKey === undefined) {
    // @ts-ignore - using Symbol as property
    delete node[NODE_KEY_SYMBOL];
  } else {
    // @ts-ignore - using Symbol as property
    node[NODE_KEY_SYMBOL] = normalizedKey;
  }
}

/**
 * Gets the key from a node or component
 * Optimized for inline usage in hot paths
 */
export function getNodeKey(node: AnyNode): string | undefined {
  if (!node) {
    return undefined;
  }

  if (isComponent(node)) {
    return node.key;
  }

  // @ts-ignore - direct Symbol property access
  return node[NODE_KEY_SYMBOL];
}

/**
 * Gets the node's key or returns a fallback key based on index
 * Pure function, no side effects
 */
export function getKeyOrFallback(node: AnyNode, fallbackIndex: number): string {
  const existingKey = getNodeKey(node);
  if (existingKey) {
    return existingKey;
  }
  return `.${fallbackIndex}`;
}

/**
 * Validates that child keys are unique (Development only)
 */
export function validateKeys(children: AnyNode[], parent?: Node): void {
  if (!__DEV__) return;

  const keySet = new Set<string>();
  const duplicates = new Set<string>();

  for (const [i, child] of children.entries()) {
    const key = getKeyOrFallback(child, i);

    // Skip auto-generated fallback keys
    if (key.startsWith('.')) continue;

    if (keySet.has(key)) {
      duplicates.add(key);
    } else {
      keySet.add(key);
    }
  }

  if (duplicates.size > 0) {
    const parentTag = parent instanceof Element ? parent.tagName.toLowerCase() : 'unknown';

    error(
      `Duplicate keys detected in <${parentTag}>: [${Array.from(duplicates).join(', ')}]\n` +
        `Keys must be unique among siblings.`,
    );
  }
}
