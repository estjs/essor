import { error, isFunction } from '@estjs/shared';
import { ReactiveFlags } from './constants';
import { type Effect, propagate } from './propagation';

/**
 * Link - Bidirectional connection in the dependency graph
 *
 * A Link connects two ReactiveNodes:
 * - depNode: The dependency node (data source)
 * - subNode: The subscriber node (data consumer)
 *
 * Links form doubly-linked lists in two directions:
 * 1. Subscriber Chain: Connects all subscribers of the same dependency
 * 2. Dependency Chain: Connects all dependencies of the same subscriber
 *
 * @example
 * ```
 * Signal A ←─┐
 *            ├─→ Effect X
 * Signal B ←─┘
 *
 * Link1: A → X (A's subscriber chain, X's dependency chain)
 * Link2: B → X (B's subscriber chain, X's dependency chain)
 * ```
 */
export interface Link {
  /**
   * Version number
   *
   * Used to detect stale Links.
   * The global version number increments each time dependency tracking starts.
   * Links with old versions will be cleaned up.
   *
   */
  version: number;

  /**
   * Dependency node - The data source being depended on
   * Examples: Signal, Computed
   */
  depNode: ReactiveNode;

  /**
   * Subscriber node - The consumer of the data
   * Examples: Effect, Computed
   */
  subNode: ReactiveNode;

  // Connects multiple subscribers of the same depNode

  /** Previous subscriber Link */
  prevSubLink?: Link;

  /** Next subscriber Link */
  nextSubLink?: Link;

  // Connects multiple dependencies of the same subNode

  /** Previous dependency Link */
  prevDepLink?: Link;

  /** Next dependency Link */
  nextDepLink?: Link;
}

/**
 * Debugger event types for tracking reactive operations
 */
export type DebuggerEventType = 'get' | 'set' | 'add' | 'delete' | 'clear' | 'iterate';

/**
 * Debugger event for tracking reactive operations
 *
 * This event is passed to onTrack and onTrigger callbacks to provide
 * detailed information about reactive operations for debugging purposes.
 *
 * @example
 * ```typescript
 * effect(() => {
 *   console.log(signal.value);
 * }, {
 *   onTrack(event) {
 *     console.log('Tracked:', event.type, event.key);
 *   },
 *   onTrigger(event) {
 *     console.log('Triggered:', event.type, event.key, event.newValue);
 *   }
 * });
 * ```
 */
export interface DebuggerEvent {
  /** The effect or computed that is tracking/being triggered */
  effect: ReactiveNode;
  /** The reactive object being accessed or modified */
  target: object;
  /** The type of operation */
  type: DebuggerEventType | string;
  /** The property key being accessed or modified (optional) */
  key?: any;
  /** The new value being set (optional, only for trigger events) */
  newValue?: any;
}

/**
 * ReactiveNode - Reactive node interface
 *
 * All objects participating in the reactive system implement this interface.
 * Includes Signal, Computed, Effect, Reactive objects, etc.
 *
 * Nodes form a dependency graph through Links:
 * - depLink: List of nodes I depend on
 * - subLink: List of nodes that depend on me
 */
export interface ReactiveNode {
  /**
   * Dependency chain head - The first node I depend on
   *
   * Traverse all dependencies through nextDepLink.
   */
  depLink?: Link;

  /**
   * Subscriber chain head - The first node that depends on me
   *
   * Traverse all subscribers through nextSubLink.
   */
  subLink?: Link;

  /**
   * Dependency chain tail - The last node I depend on
   *
   * Used for O(1) time complexity linked list append operations.
   */
  depLinkTail?: Link;

  /**
   * Subscriber chain tail - The last node that depends on me
   *
   * Used for O(1) time complexity linked list append operations.
   */
  subLinkTail?: Link;

  /**
   * State flags
   * @see ReactiveFlags
   */
  flag: ReactiveFlags;

  /**
   * Optional debugging hook called when dependencies are tracked
   */
  onTrack?: (event: DebuggerEvent) => void;

  /**
   * Optional debugging hook called when reactive changes are triggered
   */
  onTrigger?: (event: DebuggerEvent) => void;
}

/**
 * Current Link version number
 *
 * Increments each time dependency tracking starts.
 * Used to identify and clean up stale Links.
 */
let currentLinkVersion = 0;

/**
 * Currently active subscriber
 *
 * Set to the current node when Effect/Computed executes.
 * When a Signal is accessed, it automatically establishes a Link with activeSub.
 */
export let activeSub: ReactiveNode | undefined;

/**
 * Whether tracking is disabled
 *
 * The untrack() function temporarily sets this to true.
 * During this time, accessing Signals won't establish dependencies.
 */
let isUntracking = false;

/**
 * Get whether currently in untrack mode
 */
export function getIsUntracking(): boolean {
  return isUntracking;
}

export function linkReactiveNode(depNode: ReactiveNode, subNode: ReactiveNode): Link | undefined {
  // If in untrack mode, don't establish any dependencies
  // This is used by untrack() to access reactive values without creating dependencies
  if (isUntracking) {
    return undefined;
  }

  const prevDep = subNode.depLinkTail;
  if (prevDep && prevDep.depNode === depNode) {
    // Same dependency as last time - return existing Link immediately
    // This is the fastest path: single pointer comparison
    return prevDep;
  }

  const nextDep = prevDep ? prevDep.nextDepLink : subNode.depLink;
  if (nextDep && nextDep.depNode === depNode) {
    // Found a reusable Link! Update its version to mark it as "still in use"
    // Links with old versions will be cleaned up by endTracking()
    (nextDep as any).version = currentLinkVersion;
    // Move the tail pointer forward to this Link
    subNode.depLinkTail = nextDep;
    return nextDep;
  }

  const prevSub = depNode.subLinkTail;
  if (prevSub && prevSub.version === currentLinkVersion && prevSub.subNode === subNode) {
    // This Link was just created in the current tracking cycle
    // Update subscriber's tail to point to it
    subNode.depLinkTail = prevSub;
    return prevSub;
  }

  // No reusable Link found - need to create a new one
  // This happens on first execution or when dependency order changes
  const newLink: Link = {
    version: currentLinkVersion,
    depNode,
    subNode,
    // Subscriber chain pointers (horizontal)
    prevSubLink: prevSub,
    nextSubLink: undefined,
    // Dependency chain pointers (vertical)
    prevDepLink: prevDep,
    nextDepLink: nextDep,
  };

  // Insert the new Link into the subscriber's dependency chain
  // This maintains the doubly-linked list structure
  if (nextDep) {
    // There's a Link after this position - update its back pointer
    nextDep.prevDepLink = newLink;
  }
  if (prevDep) {
    // There's a Link before this position - update its forward pointer
    prevDep.nextDepLink = newLink;
  } else {
    // This is the first dependency - update the head pointer
    subNode.depLink = newLink;
  }

  // Insert the new Link into the dependency's subscriber chain
  if (prevSub) {
    // There are existing subscribers - append to the end
    prevSub.nextSubLink = newLink;
  } else {
    // This is the first subscriber - update the head pointer
    depNode.subLink = newLink;
  }

  // Tail pointers enable O(1) append operations
  // Without them, we'd need O(n) traversal to find the end of the list
  depNode.subLinkTail = newLink;
  subNode.depLinkTail = newLink;

  // In development mode, notify debugging tools about the new dependency
  if (__DEV__) {
    if (subNode.onTrack && isFunction(subNode?.onTrack)) {
      subNode.onTrack({
        effect: subNode,
        target: depNode,
        type: 'get',
        key: undefined,
      });
    }
  }

  return newLink;
}

/**
 * Remove a dependency link
 */
export function unlinkReactiveNode(
  linkNode: Link,
  subNode: ReactiveNode = linkNode.subNode,
): Link | undefined {
  const depNode = linkNode.depNode;
  const prevSub = linkNode.prevSubLink;
  const nextSub = linkNode.nextSubLink;
  const prevDep = linkNode.prevDepLink;
  const nextDep = linkNode.nextDepLink;

  // Update the doubly-linked list pointers in the subscriber's dependency chain
  // This removes the link from the vertical chain (all dependencies of subNode)
  if (nextDep) {
    nextDep.prevDepLink = prevDep;
  } else {
    // This was the tail - update tail pointer
    subNode.depLinkTail = prevDep;
  }
  if (prevDep) {
    prevDep.nextDepLink = nextDep;
  } else {
    // This was the head - update head pointer
    subNode.depLink = nextDep;
  }

  // Update the doubly-linked list pointers in the dependency's subscriber chain
  // This removes the link from the horizontal chain (all subscribers of depNode)
  if (nextSub) {
    nextSub.prevSubLink = prevSub;
  } else {
    // This was the tail - update tail pointer
    depNode.subLinkTail = prevSub;
  }
  if (prevSub) {
    prevSub.nextSubLink = nextSub;
  } else {
    // This was the head - update head pointer and check for cascading cleanup
    depNode.subLink = nextSub;

    // If depNode has no more subscribers, it doesn't need to track its dependencies
    // This is a critical optimization for memory management
    if (nextSub === undefined) {
      // No more subscribers - clean up all dependencies recursively
      let toRemove = depNode.depLink;
      while (toRemove) {
        toRemove = unlinkReactiveNode(toRemove, depNode);
      }

      // Clear tail pointer to ensure no dangling references
      depNode.depLinkTail = undefined;

      // Mark as dirty so it recomputes on next access
      // This is important for computed values that might be accessed again later
      depNode.flag |= ReactiveFlags.DIRTY;

      // Development mode verification
      if (__DEV__) {
        // Verify that all links were properly cleared
        if (depNode.depLink) {
          error(
            '[Link] Cascading cleanup failed: depNode still has dependency links. ' +
              'This indicates a bug in the unlinking logic.',
          );
        }
      }
    }
  }

  // Clear all references in the link to enable garbage collection
  // This is important for preventing memory leaks
  (linkNode as any).depNode = undefined;
  (linkNode as any).subNode = undefined;
  linkNode.prevSubLink = undefined;
  linkNode.nextSubLink = undefined;
  linkNode.prevDepLink = undefined;
  linkNode.nextDepLink = undefined;

  // Return the next link in the dependency chain for iteration
  return nextDep;
}

/**
 * Check stack frame
 *
 * Used to save check state in iterative implementation.
 */
interface CheckStackFrame {
  /** The Link currently being checked */
  link: Link | undefined;
  /** The node that owns the Link */
  owner: ReactiveNode;
}

/**
 * Check if the dependency chain is dirty
 *
 * This function determines whether a subscriber node needs to recompute by checking
 * if any of its dependencies (or transitive dependencies) are dirty.
 *
 * ## Algorithm Overview
 *
 * The algorithm performs a depth-first traversal of the dependency graph using an
 * explicit stack to avoid recursion limits. It handles three main scenarios:
 *
 * 1. **DIRTY dependencies**: If any dependency is marked DIRTY, the subscriber is dirty
 * 2. **PENDING dependencies**: Dependencies that might be dirty - need deeper checking
 * 3. **Clean dependencies**: Dependencies that are confirmed clean
 *
 * ## Why Use an Explicit Stack?
 *
 * JavaScript has a limited call stack (~10,000 frames). In complex reactive systems,
 * dependency chains can be arbitrarily deep (e.g., computed1 → computed2 → ... → computedN).
 * Using an explicit stack allows us to handle unlimited depth without stack overflow.
 *
 * ## Algorithm Steps
 *
 * 1. Initialize stack with the subscriber's dependency chain
 * 2. For each dependency in the chain:
 *    - If DIRTY: Mark path as dirty and return true
 *    - If PENDING + MUTABLE: Push its dependencies onto stack for deeper checking
 *    - Otherwise: Clear PENDING flag (confirmed clean)
 * 3. Track PENDING nodes encountered during traversal
 * 4. If dirty found: Mark all PENDING nodes on path as DIRTY
 * 5. If no dirty found: Clear all PENDING flags
 *
 * ## Edge Cases Handled
 *
 * - **Diamond dependencies**: A node with multiple paths to the same dependency
 *   - The algorithm correctly handles this by checking all paths
 * - **Circular dependencies**: Prevented by the RECURSED flag in propagation
 * - **Deep chains**: Handled by explicit stack instead of recursion
 * - **Multiple subscribers**: Uses shallowPropagate to update sibling subscribers
 *
 * ## Performance Characteristics
 *
 * - Time complexity: O(n) where n is the total number of dependencies in the chain
 * - Space complexity: O(d) where d is the maximum depth of the dependency graph
 * - Early exit: Returns immediately when first DIRTY dependency is found
 *
 * @param link - The starting Link of the dependency chain to check
 * @param sub - The subscriber node that owns this dependency chain
 * @returns true if any dependency is dirty (subscriber needs recomputation), false otherwise
 *
 * @example
 * ```typescript
 * // Simple case: signal → computed
 * const s = signal(1);
 * const c = computed(() => s.value * 2);
 * s.value = 2; // Marks s as DIRTY
 * // When accessing c.value, checkDirty(c.depLink, c) returns true
 *
 * // Complex case: diamond dependency
 * const s = signal(1);
 * const c1 = computed(() => s.value * 2);
 * const c2 = computed(() => s.value + 1);
 * const c3 = computed(() => c1.value + c2.value);
 * // c3 depends on both c1 and c2, which both depend on s
 * // checkDirty correctly handles both paths to s
 * ```
 */
export function checkDirty(link: Link, sub: ReactiveNode): boolean {
  // Use explicit stack instead of recursion to support arbitrary depth
  // Each stack frame contains:
  // - link: The dependency Link to check
  // - owner: The ReactiveNode that owns this Link
  const stack: CheckStackFrame[] = [{ link, owner: sub }];

  // Track all PENDING nodes encountered during traversal
  // If we find a DIRTY dependency, we'll mark all these as DIRTY too
  // This ensures the entire path from dirty source to subscriber is marked
  const pendingNodes: ReactiveNode[] = [];

  // Process stack frames until empty (depth-first traversal)
  while (stack.length > 0) {
    const frame = stack.pop()!;
    let current = frame.link;
    const owner = frame.owner;

    // Traverse all dependencies at the current level (linked list)
    // This handles nodes with multiple dependencies (e.g., computed(() => a.value + b.value))
    while (current) {
      const dep = current.depNode;
      const depFlags = dep.flag;

      // If owner is already marked DIRTY, no need to continue checking
      // This can happen in diamond dependencies where multiple paths lead to same node
      if (owner.flag & ReactiveFlags.DIRTY) {
        return true;
      }

      // Dependency is both MUTABLE (can change) and DIRTY (has changed)
      // This means the subscriber definitely needs to recompute
      if (
        (depFlags & (ReactiveFlags.MUTABLE | ReactiveFlags.DIRTY)) ===
        (ReactiveFlags.MUTABLE | ReactiveFlags.DIRTY)
      ) {
        const subs = dep.subLink;
        // If this dependency has multiple subscribers, propagate to all of them
        // This ensures sibling subscribers are also marked dirty
        if (subs && subs.nextSubLink) {
          shallowPropagate(subs);
        }

        // Mark all PENDING nodes on the path from dirty source to subscriber as DIRTY
        // This is crucial for correctness: if A depends on B depends on C, and C is dirty,
        // then both B and A should be marked dirty
        for (const node of pendingNodes) {
          if (node.flag & ReactiveFlags.PENDING) {
            node.flag = (node.flag & ~ReactiveFlags.PENDING) | ReactiveFlags.DIRTY;
          }
        }
        return true;
      }

      // Dependency is MUTABLE and PENDING (might be dirty, need to check its dependencies)
      // This is the recursive case - we need to check if this dependency's dependencies are dirty
      if (
        (depFlags & (ReactiveFlags.MUTABLE | ReactiveFlags.PENDING)) ===
        (ReactiveFlags.MUTABLE | ReactiveFlags.PENDING)
      ) {
        if (dep.depLink) {
          // Add this node to pending list - we'll mark it dirty if we find dirty dependencies
          pendingNodes.push(dep);
          // Push this dependency's dependencies onto stack for checking
          // This is the key optimization: instead of recursive call, we use explicit stack
          // This allows handling chains like: computed1 → computed2 → ... → computedN → signal
          stack.push({ link: dep.depLink, owner: dep });
        } else {
          // No dependencies means this is a leaf node (e.g., a Signal)
          // If it's PENDING but has no dependencies, it's actually clean
          dep.flag &= ~ReactiveFlags.PENDING;
        }
      } else if (depFlags & ReactiveFlags.PENDING) {
        // Dependency is PENDING but not MUTABLE (or already checked)
        // Clear the PENDING flag - this dependency is confirmed clean
        dep.flag &= ~ReactiveFlags.PENDING;
      }

      // Move to next dependency in the chain (horizontal traversal)
      current = current.nextDepLink;
    }
  }

  // We've checked all dependencies and found no DIRTY ones
  // Clear PENDING flags from all nodes we encountered
  for (const node of pendingNodes) {
    node.flag &= ~ReactiveFlags.PENDING;
  }

  // Clear subscriber's PENDING flag
  if (sub.flag & ReactiveFlags.PENDING) {
    sub.flag &= ~ReactiveFlags.PENDING;
  }

  // All dependencies are clean - subscriber doesn't need recomputation
  return false;
}

/**
 * Shallow propagate - Only mark direct subscribers as dirty
 *
 * Does not recursively propagate, only affects one level of subscribers.
 * Used for Computed to update its subscribers.
 *
 * @param link - The starting Link of the subscriber chain
 */
export function shallowPropagate(link: Link | undefined): void {
  while (link) {
    const sub = link.subNode;
    const queueBit = sub.flag & ReactiveFlags.QUEUED;
    const flags = sub.flag & ~ReactiveFlags.QUEUED;

    // Only process nodes in PENDING state
    if ((flags & (ReactiveFlags.PENDING | ReactiveFlags.DIRTY)) === ReactiveFlags.PENDING) {
      // Mark as DIRTY
      sub.flag = queueBit | flags | ReactiveFlags.DIRTY;
    }

    link = link.nextSubLink;
  }
}

/**
 * Set the active subscriber
 *
 * @param sub - The new active subscriber
 * @returns The previous active subscriber
 */
export function setActiveSub(sub?: ReactiveNode): ReactiveNode | undefined {
  const prev = activeSub;
  activeSub = sub;
  return prev;
}

/**
 * Start tracking dependencies
 *
 * Called before Effect/Computed execution.
 * Increments version number, stale Links will be cleaned up.
 *
 * @param sub - The subscriber node to track
 * @returns The previous active subscriber
 */
export function startTracking(sub: ReactiveNode): ReactiveNode | undefined {
  // Increment version number to mark new tracking cycle
  currentLinkVersion++;

  // Reset tracking state
  sub.depLinkTail = undefined;

  // Clear recursion and dirty flags, set recursion check flag
  sub.flag =
    (sub.flag & ~(ReactiveFlags.RECURSED | ReactiveFlags.DIRTY | ReactiveFlags.PENDING)) |
    ReactiveFlags.RECURSED_CHECK;

  return setActiveSub(sub);
}

/**
 * End tracking dependencies
 *
 * Called after Effect/Computed execution.
 * Cleans up stale Links (version number less than current version).
 *
 * @param sub - The tracked subscriber node
 * @param prevSub - The previous active subscriber
 */
export function endTracking(sub: ReactiveNode, prevSub: ReactiveNode | undefined): void {
  // Restore previous active subscriber
  activeSub = prevSub;

  // Clean up stale Links
  const depsTail = sub.depLinkTail;
  let toRemove = depsTail ? depsTail.nextDepLink : sub.depLink;

  while (toRemove) {
    toRemove = unlinkReactiveNode(toRemove, sub);
  }

  // Clear recursion check flag
  sub.flag &= ~ReactiveFlags.RECURSED_CHECK;
}

/**
 * Execute function with tracking disabled
 *
 * During function execution, accessing Signals won't establish dependencies.
 *
 * @param fn - The function to execute
 * @returns The function's return value
 */
export function untrack<T>(fn: () => T): T {
  const prevSub = setActiveSub(undefined);
  const prevUntracking = isUntracking;
  isUntracking = true;

  try {
    return fn();
  } finally {
    isUntracking = prevUntracking;
    setActiveSub(prevSub);
  }
}

/**
 * Validate if a Link is still valid
 *
 * Checks if the Link is still in the subscriber's dependency chain.
 * Used to prevent propagation through stale Links.
 *
 * @param checkLink - The Link to validate
 * @param sub - The subscriber node
 * @returns true if the Link is valid
 */
export function isValidLink(checkLink: Link, sub: ReactiveNode): boolean {
  let link = sub.depLinkTail;

  while (link) {
    if (link === checkLink) {
      return true;
    }
    link = link.prevDepLink;
  }

  return false;
}

/**
 * Global dependency map for reactive objects
 *
 * This WeakMap stores the dependency relationships for reactive objects (created by reactive()).
 * Structure: WeakMap<target, Map<key, Set<ReactiveNode>>>
 *
 * - WeakMap allows garbage collection of unused reactive objects
 * - Map stores per-property dependencies
 * - Set stores all subscribers for each property
 *
 * This is separate from the Link-based dependency tracking used by Signal/Computed/Effect.
 * It's specifically for tracking property access on reactive objects.
 */
const targetMap = new WeakMap<object, Map<string | symbol, Set<ReactiveNode>>>();

/**
 * Track a dependency on a reactive object property
 *
 * This function establishes a dependency relationship between the currently active
 * subscriber (effect/computed) and a specific property of a reactive object.
 *
 * ## When is this called?
 *
 * - When accessing a property on a reactive object: `reactiveObj.prop`
 * - When accessing array elements: `reactiveArray[0]`
 * - When calling array methods: `reactiveArray.length`, `reactiveArray.includes()`
 * - When iterating collections: `for (const item of reactiveArray)`
 *
 * ## How it works
 *
 * 1. Check if there's an active subscriber (effect/computed currently executing)
 * 2. Get or create the dependency map for the target object
 * 3. Get or create the dependency set for the specific property
 * 4. Add the active subscriber to the set
 * 5. Call debug hook if in development mode
 *
 * ## Relationship with Link-based tracking
 *
 * This function is used for reactive objects, while linkReactiveNode() is used for
 * Signal/Computed dependencies. Both systems work together:
 *
 * ```typescript
 * const obj = reactive({ count: 0 });
 * const sig = signal(1);
 *
 * effect(() => {
 *   console.log(obj.count); // Uses track()
 *   console.log(sig.value); // Uses linkReactiveNode()
 * });
 * ```
 *
 * ## Performance considerations
 *
 * - WeakMap lookup: O(1) average case
 * - Map lookup: O(1) average case
 * - Set.has() and Set.add(): O(1) average case
 * - Overall: O(1) for tracking a single property
 *
 * @param target - The reactive object being accessed
 * @param key - The property key being accessed (string, number, or symbol)
 *
 * @example
 * ```typescript
 * const state = reactive({ count: 0, name: 'Alice' });
 *
 * effect(() => {
 *   // track(state, 'count') is called automatically
 *   console.log(state.count);
 * });
 *
 * // Changing count will trigger the effect
 * state.count++; // trigger(state, 'SET', 'count', 1)
 * ```
 */
export function track(target: object, key: string | symbol): void {
  // Only track if there's an active subscriber (effect/computed currently executing)
  // and tracking is not disabled (not in untrack() call)
  if (!activeSub || isUntracking) {
    return;
  }

  // Each target object has a Map of its property dependencies
  let depsMap = targetMap.get(target);
  if (!depsMap) {
    depsMap = new Map();
    targetMap.set(target, depsMap);
  }

  // Each property has a Set of subscribers that depend on it
  let dep = depsMap.get(key);
  if (!dep) {
    dep = new Set();
    depsMap.set(key, dep);
  }

  // Only add if not already present (Set automatically handles duplicates)
  if (!dep.has(activeSub)) {
    dep.add(activeSub);

    // In development mode, notify debugging tools about the dependency
    // This enables features like dependency visualization and tracking logs
    if (__DEV__ && isFunction(activeSub.onTrack)) {
      activeSub.onTrack({
        effect: activeSub,
        target,
        type: 'get',
        key,
      });
    }
  }
}

/**
 * Trigger updates for subscribers of a reactive object property
 *
 * This function notifies all subscribers (effects/computed) that depend on a specific
 * property of a reactive object that the property has changed.
 *
 * ## When is this called?
 *
 * - When setting a property: `reactiveObj.prop = value` → trigger(obj, 'SET', 'prop', value)
 * - When adding a property: `reactiveObj.newProp = value` → trigger(obj, 'ADD', 'newProp', value)
 * - When deleting a property: `delete reactiveObj.prop` → trigger(obj, 'DELETE', 'prop')
 * - When clearing a collection: `reactiveArray.length = 0` → trigger(obj, 'CLEAR')
 * - When mutating arrays: `reactiveArray.push(item)` → trigger(obj, 'SET', 'length', newLength)
 *
 * ## Operation Types
 *
 * - **SET**: Property value changed (most common)
 * - **ADD**: New property added (affects iteration)
 * - **DELETE**: Property removed (affects iteration)
 * - **CLEAR**: Collection cleared (affects iteration)
 *
 * ## Iteration Dependencies

 * @param target - The reactive object that changed
 * @param type - The type of operation: 'SET' | 'ADD' | 'DELETE' | 'CLEAR'
 * @param key - The property key that changed (optional for CLEAR operations)
 * @param newValue - The new value (optional, used for debugging)
 *
 * @example
 * ```typescript
 * const state = reactive({ count: 0, items: [1, 2, 3] });
 *
 * effect(() => {
 *   console.log(state.count); // Depends on 'count'
 * });
 *
 * effect(() => {
 *   console.log(state.items.length); // Depends on 'items' and iteration
 * });
 *
 * // Triggers first effect only
 * state.count = 1; // trigger(state, 'SET', 'count', 1)
 *
 * // Triggers second effect (changes length and iteration)
 * state.items.push(4); // trigger(state.items, 'SET', 'length', 4)
 *                      // trigger(state.items, 'ADD', '3', 4)
 * ```
 */
export function trigger(
  target: object,
  type: string,
  key?: string | symbol | (string | symbol)[],
  newValue?: unknown,
): void {
  // If this target has no tracked dependencies, nothing to do
  const depsMap = targetMap.get(target);
  if (!depsMap) {
    return;
  }

  // Use Set to automatically deduplicate effects
  // This is important for diamond dependencies where an effect might be
  // reached through multiple paths
  const effects = new Set<ReactiveNode>();

  // Collect all effects that depend on the specific property that changed
  if (key !== undefined) {
    if (Array.isArray(key)) {
      key.forEach(k => {
        const dep = depsMap.get(k);
        if (dep) {
          dep.forEach(effect => effects.add(effect));
        }
      });
    } else {
      const dep = depsMap.get(key);
      if (dep) {
        dep.forEach(effect => effects.add(effect));
      }
    }
  }

  // For operations that affect iteration (ADD/DELETE/CLEAR), we need to trigger
  // effects that iterate over the collection

  if (type === 'ADD' || type === 'DELETE' || type === 'CLEAR') {
    // Use different iteration keys for arrays vs objects
    // This allows more precise dependency tracking
    const ITERATE_KEY = Symbol('iterate');
    const ARRAY_ITERATE_KEY = Symbol('arrayIterate');

    const iterationKey = Array.isArray(target) ? ARRAY_ITERATE_KEY : ITERATE_KEY;
    const iterationDep = depsMap.get(iterationKey);
    if (iterationDep) {
      iterationDep.forEach(effect => effects.add(effect));
    }
  }

  // Process each effect that needs to be notified
  effects.forEach(effect => {
    // In development mode, notify debugging tools about the trigger
    if (__DEV__ && isFunction(effect.onTrigger)) {
      effect.onTrigger({
        effect,
        target,
        type,
        key,
        newValue,
      });
    }

    // Effects and Computed values need different handling

    if (effect.flag & ReactiveFlags.WATCHING) {
      (effect as Effect).notify?.();
    } else if (effect.flag & ReactiveFlags.MUTABLE) {
      effect.flag |= ReactiveFlags.DIRTY;
      if (effect.subLink) {
        propagate(effect.subLink);
      }
    }
  });
}
