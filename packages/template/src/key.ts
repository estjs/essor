import { error, isFalsy, isHTMLElement, isNumber, isString, isSymbol, warn } from '@estjs/shared';
import { isComponent } from './component';
import type { AnyNode } from './types';

/** Maximum allowed key length before truncation */
const MAX_KEY_LENGTH = 1000;

export type NodeKey = string | number | symbol;

/** Cache for component type key prefixes */
const componentKeyPrefixCache = new WeakMap<Function, string>();

/**
 * Generates a stable key prefix for a component type.
 *
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
 * DJB2 hash variant - fast string hashing.
 * Limited to first 100 chars for performance.
 *
 * @param str - The input string
 * @returns The hash code (always positive)
 */
function simpleHash(str: string): number {
  let hash = 0;
  const len = str.length < 100 ? str.length : 100;
  for (let i = 0; i < len; i++) {
    hash = Math.trunc((hash << 5) - hash + str.charCodeAt(i));
  }
  return hash < 0 ? -hash : hash;
}

/** Counter for generating unique IDs for local symbols */
let symbolIdCounter = 0;

/**
 * Normalize any key value to a string.
 *
 * @param key - The key value to normalize
 * @returns Normalized string key or undefined for null/undefined
 */
export function normalizeKey(key: any): string | undefined {
  if (isFalsy(key)) {
    return undefined;
  }

  if (isString(key)) {
    if (key.length <= MAX_KEY_LENGTH) {
      return key;
    }
    if (__DEV__) {
      warn(
        `[Key System] Key length exceeds ${MAX_KEY_LENGTH} characters. ` +
          'Consider using a shorter identifier.',
      );
    }
    return `${key.slice(0, MAX_KEY_LENGTH - 10)}_${simpleHash(key).toString(36)}`;
  }

  if (isNumber(key)) {
    if (__DEV__) {
      if (key !== key) {
        warn('[Key System] NaN cannot be used as a key');
        return undefined;
      }
      if (!Number.isFinite(key)) {
        warn('[Key System] Infinity cannot be used as a key');
        return undefined;
      }
    }
    return String(key);
  }

  // Symbol path
  if (isSymbol(key)) {
    const globalKey = Symbol.keyFor(key);
    if (globalKey) {
      return `_s.${globalKey}`;
    }
    const desc = key.description;
    return desc ? `_s.${desc}` : `${symbolIdCounter++}`;
  }

  return String(key);
}

/**
 * Check if two nodes have the same type for reconciliation.
 *
 * @param a - First node
 * @param b - Second node
 * @returns True if nodes are the same type
 */
export function isSameNodeType(a: AnyNode, b: AnyNode): boolean {
  const aIsComponent = isComponent(a);
  const bIsComponent = isComponent(b);

  // Both components - compare component function
  if (aIsComponent && bIsComponent) {
    return a.component === b.component;
  }

  // Both DOM nodes - compare nodeType and tagName
  const aNode = a as Node;
  const bNode = b as Node;

  return (
    aNode.nodeType === bNode.nodeType &&
    (aNode.nodeType !== Node.ELEMENT_NODE ||
      (aNode as Element).tagName === (bNode as Element).tagName)
  );
}

/** Symbol for storing keys on DOM nodes */
const NODE_KEY_SYMBOL = Symbol('essor.key');

/**
 * Set a key on a DOM node using Symbol property.
 * Symbol properties are ~40% faster than WeakMap access.
 *
 * @param node - The node to set key on
 * @param key - The key value (will be normalized)
 */
export function setNodeKey(node: AnyNode, key: NodeKey | undefined): void {
  // Skip components - they manage their own keys
  if (isComponent(node)) {
    return;
  }

  // Validate node
  if (!node || (node as Node).nodeType === Node.DOCUMENT_NODE) {
    if (__DEV__) {
      warn('[Key System] Cannot set key on invalid node');
    }
    return;
  }

  const normalizedKey = normalizeKey(key);
  if (isFalsy(normalizedKey)) {
    delete node[NODE_KEY_SYMBOL];
  } else {
    node[NODE_KEY_SYMBOL] = normalizedKey;
  }
}

/**
 * Get the key from a node or component.
 *
 * @param node - The node to get key from
 * @returns The key string or undefined
 */
export function getNodeKey(node: AnyNode): string | undefined {
  if (!node) return undefined;
  return isComponent(node) ? node.key : node[NODE_KEY_SYMBOL];
}

/**
 * Get node's key or return an index-based fallback.
 * Fallback keys start with '.' to distinguish from user keys.
 *
 * @param node - The node to get key from
 * @param fallbackIndex - Index to use if no key exists
 * @returns The key or fallback string
 */
export function getKeyOrFallback(node: AnyNode, fallbackIndex: number): string {
  return getNodeKey(node) || `.${fallbackIndex}`;
}

/**
 * Validate that child keys are unique (Development only).
 * Logs errors for duplicate keys to help debugging.
 *
 * @param children - Array of child nodes
 * @param parent - Optional parent node for error context
 */
export function validateKeys(children: AnyNode[], parent?: Node): void {
  if (!__DEV__) return;

  const keySet = new Set<string>();
  const duplicates: string[] = [];
  const len = children.length;

  for (let i = 0; i < len; i++) {
    const key = getKeyOrFallback(children[i], i);

    // Skip auto-generated fallback keys (start with '.')
    if (key[0] === '.') continue;

    if (keySet.has(key)) {
      duplicates.push(key);
    } else {
      keySet.add(key);
    }
  }

  if (duplicates.length > 0) {
    const parentTag = isHTMLElement(parent) ? parent.tagName.toLowerCase() : 'unknown';
    error(
      `Duplicate keys detected in <${parentTag}>: [${duplicates.join(', ')}]\n` +
        'Keys must be unique among siblings.',
    );
  }
}
