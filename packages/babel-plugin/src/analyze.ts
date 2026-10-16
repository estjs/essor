/**
 * Analyze: mark elements whose whole subtree is static (`fullyStatic`) and
 * determine which static elements should be hoisted (created once and reused).
 *
 * A static element has no dynamic props, events, refs, spreads or binds and
 * only static element / text children. Components are never static.
 *
 * Hoisting candidates:
 * - Fully static elements with significant subtree depth (not trivial text-only nodes)
 * - Not text-only tags (span/div with only static text is cheaper to recreate)
 */
import type { IRElement, IRNode } from './types';

function isStaticElement(el: IRElement): boolean {
  const { props } = el;
  return (
    !el.isComponent &&
    props.dynamic.length === 0 &&
    props.events.length === 0 &&
    props.spreads.length === 0 &&
    props.binds.length === 0 &&
    !props.ref
  );
}

/**
 * Calculate the subtree depth to determine if hoisting is worthwhile.
 * A trivial element (e.g. <span>Text</span>) has depth 1 and isn't worth hoisting.
 */
export function getSubtreeDepth(node: IRNode): number {
  if (node.type === 'text') return 0;
  if (node.type === 'expression') return 0;
  if (node.type === 'fragment') {
    return Math.max(0, ...node.children.map(getSubtreeDepth));
  }
  if (node.type === 'element') {
    const childDepth = Math.max(0, ...node.children.map(getSubtreeDepth));
    return 1 + childDepth;
  }
  return 0;
}

/**
 * Check if element is worth hoisting: has meaningful structure (depth > 1)
 * or has multiple children, or has both attributes and children.
 *
 * TODO: Improve hoisting logic after Phase 5 (Solid research)
 * Current limitation: cannot distinguish between top-level and nested contexts,
 * so hoisting is disabled for now to avoid unnecessary extractions.
 * Vue and Solid both hoist, but they have better context awareness.
 */
function shouldHoist(): boolean {
  // Temporarily disabled pending research
  return false;

  // if (!el.fullyStatic) return false
  //
  // const depth = getSubtreeDepth(el)
  // if (depth > 1) return true // Multi-level nesting
  //
  // // Single-level element: hoist if it has both attributes and children,
  // // or multiple children (indicates non-trivial structure)
  // const hasAttrs = el.props.static.length > 0
  // const childCount = el.children.length
  //
  // return (hasAttrs && childCount > 0) || childCount > 1
}

/** Post-order walk; returns whether `node` is fully static and marks hoisting candidates. */
export function analyzeIR(node: IRNode): boolean {
  if (node.type === 'text') return true;
  if (node.type !== 'element' && node.type !== 'fragment') return false;

  // Visit every child so nested elements are marked even when the parent is dynamic.
  let childrenStatic = true;
  for (const child of node.children) {
    if (!analyzeIR(child)) childrenStatic = false;
  }
  if (node.type === 'fragment') return false;

  node.fullyStatic = childrenStatic && isStaticElement(node);

  // Mark whether this static element should be hoisted
  if (node.fullyStatic) {
    node.shouldHoist = shouldHoist();
  }

  return node.fullyStatic;
}
