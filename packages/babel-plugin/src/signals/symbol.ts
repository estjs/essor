/**
 * Signal Symbol Transformer
 *
 * This module provides AST transformation functions for signal variables in the Babel plugin.
 * It handles the detection and transformation of signal variables based on naming convention.
 *
 * Key responsibilities:
 * - Signal variable detection (pure prefix-based, no global registry)
 * - AST transformations for signal reads, writes, and updates
 * - Destructuring pattern processing (object and array patterns)
 * - Signal declaration transformation (signal() and computed() wrappers)
 *
 * Design philosophy:
 * - Pure naming convention: variables starting with '$' are signals
 * - No global state or cross-file tracking needed
 * - Works automatically across module boundaries
 * - Simple and predictable behavior
 *
 * @module signal/symbol
 */

import { types as t } from '@babel/core';
import { addImport } from '../import';
import { isMemberAccessingProperty, isValidPath } from './utils';
import type { PluginState } from '../types';
import type { VariableDeclarator } from '@babel/types';
import type { NodePath } from '@babel/core';

/**
 * Check whether a variable is a signal based on naming convention.
 *
 * Simple rule: any variable starting with '$' is treated as a signal.
 * This works across file boundaries without any global state.
 *
 * @param {string} name - Variable name to check
 * @returns {boolean} True if the variable is a signal
 *
 * @example
 * ```typescript
 * isSignal('$count');    // true
 * isSignal('$value');    // true
 * isSignal('count');     // false
 * isSignal('_private');  // false
 * ```
 */
export function isSignal(name: string): boolean {
  return !!name && name.startsWith('$');
}

/**
 * Rewrite signal variable declarations to `signal()` or `computed()` calls.
 *
 * Transformation rules:
 * 1. **Plain values** → `signal(value)`
 *    - Example: `let $count = 0` → `let $count = signal(0)`
 *
 * 2. **Function expressions** → `computed(fn)`
 *    - Example: `const $fullName = () => first + last`
 *      → `const $fullName = computed(() => first + last)`
 *
 * 3. **Already wrapped** → skip
 *    - Detects existing `signal()` / `computed()` calls
 *
 * 4. **Uninitialized** → `signal()`
 *    - Example: `let $count;` → `let $count = signal();`
 *
 * @param {NodePath<VariableDeclarator>} path - AST path for the variable declarator
 *
 * @example
 * ```typescript
 * let $count = 0;                          // → let $count = signal(0);
 * const $fullName = () => first + last;    // → const $fullName = computed(() => first + last);
 * let $existing = signal(42);              // → unchanged
 * let $uninitialized;                      // → let $uninitialized = signal();
 * ```
 */
export function replaceSymbol(path: NodePath<VariableDeclarator>): void {
  const { init, id } = path.node;

  // Only process identifier declarators
  if (!t.isIdentifier(id)) {
    return;
  }

  const variableName = id.name;

  // Skip non-signal variables
  if (!isSignal(variableName)) {
    return;
  }

  // Skip if already wrapped with signal/computed
  if (isAlreadySignalCall(init)) {
    return;
  }

  // Use `computed` only when the initializer is a function on a `const`
  const isComputed =
    init &&
    (t.isFunctionExpression(init) || t.isArrowFunctionExpression(init)) &&
    (path.parent as t.VariableDeclaration).kind === 'const';

  const importName = isComputed ? 'computed' : 'signal';

  // Get plugin state
  const state = path.state as PluginState;

  // Build the wrapper call
  const args = init ? [init] : [];
  const newInit = t.callExpression(t.identifier(state.imports[importName].name), args);

  addImport(importName as any);

  // Update the AST
  path.node.init = newInit;
}

/**
 * Check whether the initializer already invokes a signal factory.
 *
 * @param {t.Expression | null} init - Initializer expression
 * @returns {boolean} True when the expression already calls a signal helper
 */
function isAlreadySignalCall(init: t.Expression | null | undefined): boolean {
  if (!init || !t.isCallExpression(init) || !t.isIdentifier(init.callee)) {
    return false;
  }

  const calleeName = init.callee.name;
  return (
    calleeName === 'signal' ||
    calleeName === 'computed' ||
    calleeName.includes('signal') ||
    calleeName.includes('computed')
  );
}

/**
 * Rewrite signal references to access the `.value` property.
 *
 * Transforms signal variable reads to access their underlying value.
 *
 * Conversion rules:
 * - `$count` → `$count.value`
 * - `console.log($name)` → `console.log($name.value)`
 *
 * Smart skipping:
 * - Non-signal variables
 * - Already transformed (`.value` already present)
 * - Declaration contexts (variable declarations, imports, etc.)
 * - Object property keys
 *
 * @param {NodePath<t.Identifier>} path - AST path for the identifier node
 *
 * @example
 * ```typescript
 * const result = $count + 1;       // → const result = $count.value + 1;
 * console.log($name);              // → console.log($name.value);
 *
 * // Skipped contexts
 * let $count = 0;                  // declaration - not transformed
 * obj.$count = 1;                  // property key - not transformed
 * $count.value;                    // already transformed - not transformed
 * ```
 */
export function symbolIdentifier(path: NodePath<t.Identifier>): void {
  if (!isValidPath(path)) {
    return;
  }

  const name = path.node.name;

  // Skip non-signal variables
  if (!isSignal(name)) {
    return;
  }

  // Skip if context should not be transformed
  if (!shouldProcessIdentifier(path, path.parentPath)) {
    return;
  }

  // Skip if already accessing .value
  if (isAlreadyValueAccess(path)) {
    return;
  }
  // Transform: $count → $count.value
  path.replaceWith(t.memberExpression(t.identifier(name), t.identifier('value')));
}

/**
 * Decide whether an identifier should be transformed as a signal reference.
 *
 * Provides fine-grained context checks to avoid incorrect rewrites and maintain
 * program correctness.
 *
 * Contexts to skip:
 * 1. Variable declarations (e.g. `let $count = 1`)
 * 2. Import specifiers (e.g. `import { $value } from 'module'`)
 * 3. Object property keys (e.g. `obj.$prop` as the key)
 * 4. Destructuring patterns (e.g. `const { $x } = obj`)
 * 5. Function parameters and names
 * 6. Labels (e.g. `break $label`)
 * 7. Class names (e.g. `class $Class`)
 * 8. Method names
 *
 * Safe to transform when used inside expressions, as call arguments, in return
 * statements, or on the right-hand side of assignments.
 *
 * @param {NodePath<t.Identifier>} path - Identifier node path
 * @param {NodePath<t.Node> | null} parentPath - Parent AST path
 * @returns {boolean} True when the identifier should be transformed
 *
 * @example
 * ```typescript
 * // Skip
 * let $count = 1;
 * import { $value } from '';
 * obj.$prop = 1;
 *
 * // Transform
 * console.log($count);
 * return $value + 1;
 * ```
 */
function shouldProcessIdentifier(
  path: NodePath<t.Identifier>,
  parentPath: NodePath<t.Node> | null,
): boolean {
  // Validate parent path exists
  if (!parentPath) {
    return false;
  }

  const parent = parentPath.node;
  const currentNode = path.node;

  // Group 1: Declaration contexts - skip identifiers that define names
  if (t.isVariableDeclarator(parent) || t.isArrayPattern(parent) || t.isObjectPattern(parent)) {
    return false;
  }

  // Group 2: Import/Export contexts - skip module-level identifiers
  if (
    t.isImportSpecifier(parent) ||
    t.isImportDefaultSpecifier(parent) ||
    t.isImportNamespaceSpecifier(parent)
  ) {
    return false;
  }

  // Group 3: Function contexts - skip function names and parameters
  if (
    t.isFunctionDeclaration(parent) ||
    t.isFunctionExpression(parent) ||
    t.isArrowFunctionExpression(parent)
  ) {
    return false;
  }

  // Group 4: Class contexts - skip class and method names
  if (t.isClassDeclaration(parent) && parent.id === currentNode) {
    return false;
  }

  if (t.isObjectMethod(parent) || t.isClassMethod(parent)) {
    return false;
  }

  // Group 5: Object property keys - skip keys but allow values
  if (t.isObjectProperty(parent) && parent.key === currentNode) {
    return false;
  }

  // Group 6: Label contexts - skip labels in labeled statements
  if (t.isLabeledStatement(parent) && parent.label === currentNode) {
    return false;
  }

  // Otherwise allow the transformation
  return true;
}

/**
 * Determine whether an identifier is already accessing `.value`.
 *
 * Prevents reprocessing identifiers that have already been rewritten, covering
 * a variety of member-access patterns.
 *
 * Detection patterns:
 * 1. Direct access – `$count.value`
 * 2. Chained access – `$count.value.toString()`
 * 3. Computed access – `$count['value']`
 * 4. Wrapped expressions – `($count).value`
 *
 * @param {NodePath<t.Identifier>} path - Identifier node path
 * @returns {boolean} True when `.value` access is already present
 *
 * @example
 * ```typescript
 * $count.value;           // true
 * $count.value.toString(); // true
 * $count;                 // false
 * $count.other;           // false
 * ```
 */
function isAlreadyValueAccess(path: NodePath<t.Identifier>): boolean {
  const parent = path.parent;

  // Direct member access `$count.value` or computed `$count['value']`
  // This is the most common case, so check it first
  if (t.isMemberExpression(parent) && parent.object === path.node) {
    return isMemberAccessingProperty(parent, 'value');
  }

  if (
    !t.isParenthesizedExpression(parent) &&
    !t.isTSAsExpression(parent) &&
    !t.isTSNonNullExpression(parent)
  ) {
    return false;
  }

  // Traverse ancestors for nested member expressions such as ($count).value
  // Only needed for rare cases with parentheses or type assertions
  const ancestorCheck = path.findParent(p => {
    if (!p.isMemberExpression()) {
      return false;
    }

    const memberExpr = p.node as t.MemberExpression;

    // Confirm the member expression targets the current identifier
    return memberExpr.object === path.node && isMemberAccessingProperty(memberExpr, 'value');
  });

  return !!ancestorCheck;
}

/**
 * Rewrite signal assignments to target `.value`.
 *
 * Transforms signal variable assignments to update their underlying value.
 *
 * Conversion rules:
 * - `$count = 42` → `$count.value = 42`
 * - `$count += 1` → `$count.value += 1`
 *
 * Supported operators: `=`, `+=`, `-=`, `*=`, `/=`, `%=`, `**=`, `&=`, `|=`, `^=`, `<<=`, `>>=`, `>>>=`, `&&=`, `||=`, `??=`
 *
 * @param {NodePath<t.AssignmentExpression>} path - Assignment expression path
 *
 * @example
 * ```typescript
 * $count = 42;          // → $count.value = 42;
 * $count += 1;          // → $count.value += 1;
 * $name ||= 'default';  // → $name.value ||= 'default';
 *
 * // Skipped
 * obj.prop = 1;         // not an identifier
 * $count.value = 1;     // already .value
 * regularVar = 1;       // not a signal
 * ```
 */
export function symbolAssignment(path: NodePath<t.AssignmentExpression>): void {
  if (!isValidPath(path)) {
    return;
  }

  const { left } = path.node;

  // Only process identifier assignments
  if (!t.isIdentifier(left)) {
    return;
  }

  const name = left.name;

  // Skip non-signal variables
  if (!isSignal(name)) {
    return;
  }

  // Skip if already accessing .value
  if (isAlreadyValueAssignment(left)) {
    return;
  }

  // Transform: $count = 1 → $count.value = 1
  path.node.left = t.memberExpression(t.identifier(name), t.identifier('value'));
}

/**
 * Check whether the assignment already targets the `.value` property.
 *
 * @param {t.LVal} left - Assignment left-hand side
 * @returns {boolean} True when `.value` is already being assigned
 */
function isAlreadyValueAssignment(left: t.LVal): boolean {
  return t.isMemberExpression(left) && isMemberAccessingProperty(left, 'value');
}

/**
 * Transform signal variable update expressions to .value property updates.
 *
 * Handles increment and decrement operations on signal variables.
 *
 * Transformation rules:
 * - `$count++` → `$count.value++`
 * - `++$index` → `++$index.value`
 * - `$value--` → `$value.value--`
 * - `--$counter` → `--$counter.value`
 *
 * @param {NodePath<t.UpdateExpression>} path - AST path of the update expression node
 *
 * @example
 * ```typescript
 * $count++;            // → $count.value++;
 * ++$index;            // → ++$index.value;
 * $value--;            // → $value.value--;
 * --$counter;          // → --$counter.value;
 *
 * // Skipped
 * obj.prop++;          // not an identifier
 * $count.value++;      // already .value
 * regularVar++;        // not a signal
 * ```
 */
export function symbolUpdate(path: NodePath<t.UpdateExpression>): void {
  if (!isValidPath(path)) {
    return;
  }

  const { argument } = path.node;

  // Only process identifier updates
  if (!t.isIdentifier(argument)) {
    return;
  }

  const name = argument.name;

  // Skip non-signal variables
  if (!isSignal(name)) {
    return;
  }

  // Skip if already accessing .value
  if (isAlreadyValueUpdate(argument)) {
    return;
  }

  // Transform: $count++ → $count.value++
  path.node.argument = t.memberExpression(t.identifier(name), t.identifier('value'));
}

/**
 * Check if the update expression argument is already a .value property access
 *
 * @param {t.Expression} argument - The update expression argument
 * @returns {boolean} Returns true if it's already a .value update
 */
function isAlreadyValueUpdate(argument: t.Expression): boolean {
  return t.isMemberExpression(argument) && isMemberAccessingProperty(argument, 'value');
}

/**
 * Process signal-aware object destructuring patterns.
 *
 * Recursively processes object destructuring to handle nested patterns.
 * Note: This function doesn't transform the destructuring itself, but ensures
 * nested patterns are also processed by the visitor.
 *
 * Supports:
 * - Simple destructuring: `{ $count, $name }`
 * - Nested destructuring: `{ user: { $name } }`
 * - Default values: `{ $isLoading = false }`
 * - Rest elements: `{ $a, ...$rest }`
 * - Mixed patterns: `{ $x, nested: { $y }, ...$rest }`
 *
 * @param {NodePath<t.ObjectPattern>} path - Object pattern path
 *
 * @example
 * ```typescript
 * const { $count, $name } = state;
 * const { user: { $name } } = data;
 * const { $isLoading = false } = config;
 * const { $a, ...$rest } = obj;
 * ```
 */
export function symbolObjectPattern(path: NodePath<t.ObjectPattern>): void {
  if (!isValidPath(path)) {
    return;
  }

  const properties = path.node.properties;

  if (!Array.isArray(properties) || properties.length === 0) {
    return;
  }

  // Process each property
  for (const property of properties) {
    if (!property) continue;

    if (t.isObjectProperty(property)) {
      handleObjectProperty(property, path);
    } else if (t.isRestElement(property)) {
      handleRestElement(property, path);
    }
  }
}

/**
 * Handle a single object property within a destructuring pattern.
 *
 * Recursively processes nested patterns.
 *
 * @param {t.ObjectProperty} property - Property node
 * @param {NodePath<t.ObjectPattern>} parentPath - Parent object pattern path
 */
function handleObjectProperty(
  property: t.ObjectProperty,
  parentPath: NodePath<t.ObjectPattern>,
): void {
  if (!property || !property.value) {
    return;
  }

  const value = property.value;

  // Recurse into nested patterns
  if (t.isObjectPattern(value)) {
    const mockPath = {
      node: value,
      state: parentPath.state,
      parentPath,
    } as NodePath<t.ObjectPattern>;
    symbolObjectPattern(mockPath);
  } else if (t.isArrayPattern(value)) {
    const mockPath = {
      node: value,
      state: parentPath.state,
      parentPath,
    } as NodePath<t.ArrayPattern>;
    symbolArrayPattern(mockPath);
  } else if (t.isAssignmentPattern(value)) {
    handleAssignmentPattern(value, parentPath);
  }
}

/**
 * Handle assignment patterns (default values) in destructuring.
 *
 * Recursively processes nested patterns with default values.
 *
 * @param {t.AssignmentPattern} pattern - Assignment pattern node
 * @param {NodePath<t.ObjectPattern | t.ArrayPattern>} parentPath - Parent pattern path
 */
function handleAssignmentPattern(
  pattern: t.AssignmentPattern,
  parentPath: NodePath<t.ObjectPattern> | NodePath<t.ArrayPattern>,
): void {
  const left = pattern.left;

  if (t.isObjectPattern(left)) {
    const mockPath = {
      node: left,
      state: parentPath.state,
      parentPath,
    } as NodePath<t.ObjectPattern>;
    symbolObjectPattern(mockPath);
  } else if (t.isArrayPattern(left)) {
    const mockPath = {
      node: left,
      state: parentPath.state,
      parentPath,
    } as NodePath<t.ArrayPattern>;
    symbolArrayPattern(mockPath);
  }
}

/**
 * Handle rest elements inside object destructuring.
 *
 * Recursively processes nested patterns in rest elements.
 *
 * @param {t.RestElement} restElement - Rest element node
 * @param {NodePath<t.ObjectPattern>} parentPath - Parent object pattern path
 */
function handleRestElement(
  restElement: t.RestElement,
  parentPath: NodePath<t.ObjectPattern>,
): void {
  if (!restElement || !restElement.argument) {
    return;
  }

  const argument = restElement.argument;

  if (t.isObjectPattern(argument)) {
    const mockPath = {
      node: argument,
      state: parentPath.state,
      parentPath,
    } as NodePath<t.ObjectPattern>;
    symbolObjectPattern(mockPath);
  } else if (t.isArrayPattern(argument)) {
    const mockPath = {
      node: argument,
      state: parentPath.state,
      parentPath,
    } as NodePath<t.ArrayPattern>;
    symbolArrayPattern(mockPath);
  }
}

/**
 * Process signal variables in array destructuring patterns.
 *
 * Recursively processes array destructuring to handle nested patterns.
 * Note: This function doesn't transform the destructuring itself, but ensures
 * nested patterns are also processed by the visitor.
 *
 * Supported patterns:
 * - Direct destructuring: `[$first, $second]`
 * - Skipping elements: `[$first, , $third]`
 * - Default values: `[$count = 0]`
 * - Nested destructuring: `[[$x, $y], $z]`
 * - Rest destructuring: `[$first, ...$rest]`
 * - Mixed patterns: `[[$x], { $y }, $z = 0, ...$rest]`
 *
 * @param {NodePath<t.ArrayPattern>} path - AST path of the array destructuring pattern node
 *
 * @example
 * ```typescript
 * const [$x, $y] = coordinates;
 * const [$first, , $third] = items;
 * const [[$count, $name], $status] = nestedData;
 * const [$head, ...$tail] = list;
 * const [$count = 0, $name = ''] = partialData;
 * ```
 */
export function symbolArrayPattern(path: NodePath<t.ArrayPattern>): void {
  if (!isValidPath(path)) {
    return;
  }

  const elements = path.node.elements;

  if (!Array.isArray(elements) || elements.length === 0) {
    return;
  }

  // Process each element
  for (const element of elements) {
    if (!element) continue; // Skip holes

    if (t.isAssignmentPattern(element)) {
      handleAssignmentPattern(element, path);
    } else if (t.isRestElement(element)) {
      handleArrayRestElement(element, path);
    } else if (t.isObjectPattern(element)) {
      const mockPath = {
        node: element,
        state: path.state,
        parentPath: path,
      } as NodePath<t.ObjectPattern>;
      symbolObjectPattern(mockPath);
    } else if (t.isArrayPattern(element)) {
      const mockPath = {
        node: element,
        state: path.state,
        parentPath: path,
      } as NodePath<t.ArrayPattern>;
      symbolArrayPattern(mockPath);
    }
  }
}

/**
 * Handle rest element in array destructuring.
 *
 * Recursively processes nested patterns in rest elements.
 *
 * @param {t.RestElement} restElement - Rest element node
 * @param {NodePath<t.ArrayPattern>} parentPath - Parent node path
 */
function handleArrayRestElement(
  restElement: t.RestElement,
  parentPath: NodePath<t.ArrayPattern>,
): void {
  if (!restElement || !restElement.argument) {
    return;
  }

  const argument = restElement.argument;

  if (t.isArrayPattern(argument)) {
    const mockPath = {
      node: argument,
      state: parentPath.state,
      parentPath,
    } as NodePath<t.ArrayPattern>;
    symbolArrayPattern(mockPath);
  } else if (t.isObjectPattern(argument)) {
    const mockPath = {
      node: argument,
      state: parentPath.state,
      parentPath,
    } as NodePath<t.ObjectPattern>;
    symbolObjectPattern(mockPath);
  }
}
