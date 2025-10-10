import { types as t } from '@babel/core';
import { startsWith } from '@estjs/shared';
import { addImport } from '../import';
import type { VariableDeclarator } from '@babel/types';
import type { NodePath } from '@babel/core';

const signalCaches = new WeakMap<VariableDeclarator, Set<string>>();
const signalVars = new Set<string>();

function getSignalPrefix(path: NodePath<t.Node>): string {
  return path.state.symbol || '$';
}
/**
 * Process signal-aware array destructuring patterns.
 *
 * Iterates over each element, registers identifiers that match the signal
 * prefix, and recurses into nested patterns, rest elements, and defaults.
 *
 * @param {NodePath<t.ArrayPattern>} path - Array pattern path
 *
 * @example
 * ```typescript
 * const [$x, $y] = coordinates;
 * const [$first, , $third] = items;
 * const [[$count, $name], $status] = nestedData;
 * const [$head, ...$tail] = list;
 * const [$count = 0, $name = ''] = partialData;
 * ```
 *
 * Strategy:
 * 1. **Registry first** – check the global registry to catch signals that were
 *    discovered elsewhere (across scopes, destructuring, imports, and so on)
 * 2. **Prefix rule** – fall back to prefix matching using the configured symbol
 *
 * Features:
 * - Skip holes in the array pattern
 * - O(1) lookups thanks to the Set-based registry
 * - Lazily reads the prefix to avoid repeated option parsing
 * - Short-circuits as soon as a condition is satisfied
 *
 * @param {NodePath<t.Node>} path - AST node path with context and configuration
 * @param {string} name - Variable name under inspection
        // Handle simple identifier destructuring
 *
 * @example
        // Recurse into nested object patterns
 * // Registry-based detection
 * registerSignalVar('count');
 * isSignal(path, 'count'); // true (even without the `$` prefix)
 *
 * // Prefix-based detection
 * isSignal(path, '$value'); // true (default prefix)
        // Recurse into nested array patterns
 * ```
 */
export function isSignal(path: NodePath<t.Node>, name: string): boolean {
  // Basic input validation
  if (!name || typeof name !== 'string') {
    return false;
  }

  // Log and continue if processing an element fails
  try {
    const prefix = getSignalPrefix(path);
    return startsWith(name, prefix);
  } catch {
    // Fall back to the default prefix when configuration access fails
    return startsWith(name, '$');
  }
}

/**
 * Register a signal variable in the global registry.
 *
 * Explicitly marks the variable as a signal so every subsequent reference is
 * transformed correctly. This is essential for complex scoping scenarios,
 * destructuring assignments, module imports, and runtime-generated signals.
 *
 * Registration occurs when:
 * 1. Signal declarations are encountered (e.g. `let $count = signal(0)`)
 * 2. Signals appear inside destructuring patterns
 * 3. Signals are referenced across module boundaries
 * 4. Signals are created dynamically at runtime
 *
 * Effects of registration:
 * - Adds the variable to the global registry
 * - Ensures future references are recognized as signals
 * - Enables the relevant transformation logic
 *
 * @param {string} name - Signal variable name to register
 *
 * @throws {Error} When the name is missing or invalid
 *
 * @example
 * ```typescript
 * // Explicit registration
 * registerSignalVar('customSignal');
 *
 * // Later usage is recognized correctly
 * // customSignal -> customSignal.value
 * // customSignal = 10 -> customSignal.value = 10
 * ```
 */
export function registerSignalVar(name: string): void {
  // Validate the input
  if (!name || typeof name !== 'string') {
    throw new Error(`Invalid signal variable name: ${name}`);
  }

  // Basic identifier format validation
  if (!/^[a-z_$][\w$]*$/i.test(name)) {
    throw new Error(
      `Signal variable name does not conform to JavaScript identifier specification: ${name}`,
    );
  }

  // Store the name in the global registry
  signalVars.add(name);
}

/**
 * Determine whether an expression references a signal variable.
 *
 * Recognizes both standalone identifiers and member expressions whose property
 * names follow the signal prefix convention.
 *
 * Supported patterns:
 * 1. **Direct references** – `$count`, `$userName`
 * 2. **Member properties** – `obj.$count`, `state.$isLoading`
 * 3. **Nested access** – deeply nested structures that surface signal-like properties
 *
 * @param {NodePath<t.Node>} path - The expression node to inspect
 * @returns {boolean} True when the expression refers to a signal
 *
 * @example
 * ```typescript
 * isSignalReference($count);      // true
 * isSignalReference(obj.$count);  // true
 * isSignalReference(obj.normal);  // false
 * ```
 */
function isSignalReference(path: NodePath<t.Node>): boolean {
  const node = path.node;

  // Handle direct identifier references
  if (t.isIdentifier(node)) {
    return isSignal(path, node.name);
  }

  // Handle member expressions such as obj.$count
  if (t.isMemberExpression(node) && t.isIdentifier(node.property)) {
    const propName = node.property.name;
    try {
      const prefix = getSignalPrefix(path);
      return startsWith(propName, prefix);
    } catch {
      // Fall back to the default prefix on configuration errors
      return startsWith(propName, '$');
    }
  }

  return false;
}

/**
 * Reset the global signal registry.
 *
 * Clears the shared registry, primarily for tests and multi-file compilation
 * workflows. Use cautiously in production tooling because it may disrupt
 * cross-module signal recognition.
 *
 * Typical use cases:
 * 1. **Unit tests** – isolate state between test cases
 * 2. **Multi-file compilation** – avoid crosstalk between files
 * 3. **Developer tooling** – reset state during hot reload
 * 4. **Debug helpers** – manually clear the compiler state
 *
 * @example
 * ```typescript
 * beforeEach(() => {
 *   clearSignalVars();
 * });
 * ```
 */
export function clearSignalVars(): void {
  signalVars.clear();
}

/**
 * Get a snapshot of all registered signals.
 *
 * Returns a shallow copy of the registry contents for debugging, testing, and
 * tooling purposes. Mutating the returned array does not affect the registry.
 *
 * Common use cases:
 * 1. **Unit tests** – assert the registration state
 * 2. **Debug tools** – inspect signals available in the compilation context
 * 3. **Developer tools** – power IDE integrations or static analysis
 * 4. **Analytics** – study usage patterns across a codebase
 *
 * @returns {string[]} Array copy of all registered signal names
 *
 * @example
 * ```typescript
 * registerSignalVar('$count');
 * registerSignalVar('$userName');
 *
 * const vars = getSignalVars();
 * console.log(vars); // ['$count', '$userName']
 * ```
 */
export function getSignalVars(): string[] {
  return Array.from(signalVars);
}

/**
 * Rewrite signal variable declarations to `signal()` or `computed()` calls.
 *
 * Core transformer that converts traditional declarations into reactive
 * signals. Determines the appropriate wrapper based on the initializer.
 *
 * Transformation rules:
 * 1. **Plain values** → `signal(value)`
 *    - Example: `let $count = 0` → `let $count = signal(0)`
 *    - Supports primitives, objects, arrays, etc.
 *
 * 2. **Function expressions** → `computed(fn)`
 *    - Example: `const $fullName = () => first + last`
 *      → `const $fullName = computed(() => first + last)`
 *    - Applies to `const` declarations holding arrow or function expressions
 *
 * 3. **Already handled** → skip
 *    - Detects existing `signal()` / `computed()` calls to avoid duplication
 *
 * Safety considerations:
 * - Only processes identifier declarators
 * - Validates all AST node types involved
 * - Ensures the necessary import mapping exists
 *
 * @param {NodePath<VariableDeclarator>} path - AST path for the variable declarator
 *
 * @throws {Error} When required imports are missing or node types are incompatible
 *
 * @example
 * ```typescript
 * let $count = 0; // -> let $count = signal(0);
 * const $fullName = () => first + last; // -> computed(() => first + last)
 * let $existing = signal(42); // unchanged
 * ```
 */
export function replaceSymbol(path: NodePath<VariableDeclarator>): void {
  const { init, id } = path.node;

  // Ensure we only process identifier declarators
  if (!t.isIdentifier(id)) {
    return;
  }

  const variableName = id.name;

  // Skip non-signal variables
  if (!isSignal(path, variableName)) {
    return;
  }

  // Avoid re-wrapping declarations that already call signal/computed
  if (isAlreadySignalCall(init)) {
    // Still register the variable name so future references are handled
    try {
      registerSignalVar(variableName);
    } catch (error) {
      console.warn(`Signal variable registration failed: ${variableName}, error: ${error}`);
    }
    return;
  }

  try {
    // Register the variable in the global registry
    registerSignalVar(variableName);
  } catch (error) {
    // Log a warning but continue transforming
    console.warn(`Signal variable registration failed: ${variableName}, error: ${error}`);
  }

  // Decide whether to use signal or computed
  const transformationType = determineTransformationType(
    init,
    path.parent as t.VariableDeclaration,
  );

  // Determine which hook import to use
  const hookName = transformationType;

  // Validate the import mapping exists
  const state = path.state as PluginState;
  if (!state.imports || !state.imports[hookName]) {
    throw new Error(`Missing required import mapping: ${hookName}`);
  }

  // Build the new initializer expression
  const newInit = t.callExpression(t.identifier(state.imports[hookName].name), init ? [init] : []);

  // Ensure the import is emitted
  addImport(hookName as any);

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
 * Decide which transformation (`signal` or `computed`) should be applied.
 *
 * @param {t.Expression | null} init - Initializer expression
 * @param {t.VariableDeclaration} parent - Owning variable declaration
 * @returns {'signal' | 'computed'} The transformation type
 */
function determineTransformationType(
  init: t.Expression | null | undefined,
  parent: t.VariableDeclaration,
): 'signal' | 'computed' {
  // Use `computed` only when the initializer is a function on a `const`
  const isComputed =
    init &&
    (t.isFunctionExpression(init) || t.isArrowFunctionExpression(init)) &&
    parent.kind === 'const';

  return isComputed ? 'computed' : 'signal';
}

/**
 * Rewrite signal references to access the `.value` property.
 *
 * Core transformation that ensures signal reads target their underlying value
 * at runtime. Applies to direct references while carefully skipping contexts
 * that should remain untouched.
 *
 * Conversion rules:
 * - `$count` → `$count.value`
 * - `console.log($name)` → `console.log($name.value)`
 *
 * Smart skipping:
 * 1. **Non-signals** – leave regular variables alone
 * 2. **Already transformed** – avoid duplicate `.value` access
 * 3. **Special contexts** – skip declarations, imports, etc.
 * 4. **Object keys** – do not alter property names
 *
 * Performance notes:
 * - Inspect the parent node first to avoid unnecessary work
 * - Reuse the variable name to reduce string operations
 * - Short-circuit once a skip condition is met
 *
 * @param {NodePath<t.Identifier>} path - AST path for the identifier node
 *
 * @example
 * ```typescript
 * const result = $count + 1;      // before
 * const result = $count.value + 1; // after
 * ```
 */
export function symbolIdentifier(path: NodePath<t.Identifier>): void {
  const parentPath = path.parentPath;

  // Early exit if the surrounding context should not be transformed
  if (!shouldProcessIdentifier(path, parentPath)) {
    return;
  }

  const { node } = path;
  const name = node.name;

  // Skip if this identifier is not associated with a signal
  if (!isSignal(path, name)) {
    return;
  }

  // Skip if it already resolves to `.value`
  if (isAlreadyValueAccess(path)) {
    return;
  }

  try {
    // Perform the rewrite: $count -> $count.value
    const memberExpression = t.memberExpression(t.identifier(name), t.identifier('value'));
    path.replaceWith(memberExpression);
  } catch (error) {
    // Log a warning if the rewrite fails
    console.warn(`Signal variable reference transformation failed: ${name}, error: ${error}`);
  }
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
  if (!parentPath) {
    return false;
  }

  const parent = parentPath.node;

  // Skip identifiers that serve as variable names
  if (t.isVariableDeclarator(parent)) {
    return false;
  }

  // Skip identifiers inside import specifiers
  if (
    t.isImportSpecifier(parent) ||
    t.isImportDefaultSpecifier(parent) ||
    t.isImportNamespaceSpecifier(parent)
  ) {
    return false;
  }

  // Skip object property keys (but allow property values)
  if (t.isObjectProperty(parent) && parent.key === path.node) {
    return false;
  }

  // Skip identifiers within destructuring patterns
  if (t.isArrayPattern(parent) || t.isObjectPattern(parent)) {
    return false;
  }

  // Skip function parameters and function names
  if (
    t.isFunctionDeclaration(parent) ||
    t.isFunctionExpression(parent) ||
    t.isArrowFunctionExpression(parent)
  ) {
    return false;
  }

  // Skip class names within class declarations
  if (t.isClassDeclaration(parent) && parent.id === path.node) {
    return false;
  }

  // Skip labels in labeled statements
  if (t.isLabeledStatement(parent) && parent.label === path.node) {
    return false;
  }

  // Skip names used in method definitions
  if (t.isObjectMethod(parent) || t.isClassMethod(parent)) {
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
 * Performance notes:
 * - Inspect the immediate parent first (covers the common case)
 * - Only traverse ancestors when necessary
 * - Use precise node-type checks
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

  // Direct member access `$count.value`
  if (
    t.isMemberExpression(parent) &&
    parent.object === path.node &&
    t.isIdentifier(parent.property) &&
    parent.property.name === 'value'
  ) {
    return true;
  }

  // Computed member access `$count['value']`
  if (
    t.isMemberExpression(parent) &&
    parent.object === path.node &&
    parent.computed &&
    t.isStringLiteral(parent.property) &&
    parent.property.value === 'value'
  ) {
    return true;
  }

  // Traverse ancestors for nested member expressions such as ($count).value
  const ancestorCheck = path.findParent(p => {
    if (!p.isMemberExpression()) {
      return false;
    }

    const memberExpr = p.node as t.MemberExpression;

    // Confirm the member expression targets the current identifier
    return (
      memberExpr.object === path.node &&
      t.isIdentifier(memberExpr.property) &&
      memberExpr.property.name === 'value'
    );
  });

  return !!ancestorCheck;
}

/**
 * Rewrite signal assignments so they target `.value`.
 *
 * Ensures updates to signals trigger the reactive system by routing writes
 * through the `.value` accessor.
 *
 * Conversion rules:
 * - `$count = 42` → `$count.value = 42`
 * - `$name = 'John'` → `$name.value = 'John'`
 *
 * Supported operators:
 * - Simple: `=`
 * - Compound: `+=`, `-=`, `*=`, `/=`, `%=`, `**=`
 * - Bitwise: `&=`, `|=`, `^=`, `<<=`, `>>=`, `>>>=`
 * - Logical: `&&=`, `||=`, `??=`
 *
 * Skip when the left-hand side is not an identifier, the identifier is not a
 * signal, or the assignment already writes to `.value`.
 *
 * @param {NodePath<t.AssignmentExpression>} path - Assignment expression path
 *
 * @example
 * ```typescript
 * $count = 42;          // -> $count.value = 42;
 * $count += 1;          // -> $count.value += 1;
 * $name ||= 'default';  // -> $name.value ||= 'default';
 * ```
 */
export function symbolAssignment(path: NodePath<t.AssignmentExpression>): void {
  const left = path.node.left;

  // Only process identifier left-hand sides
  if (!t.isIdentifier(left)) {
    return;
  }

  const name = left.name;

  // Skip non-signal identifiers
  if (!isSignal(path, name)) {
    return;
  }

  // Avoid rewriting when `.value` is already present
  if (isAlreadyValueAssignment(left)) {
    return;
  }

  try {
    // Perform the rewrite: $count = 1 -> $count.value = 1
    const memberExpr = t.memberExpression(t.identifier(name), t.identifier('value'));
    path.node.left = memberExpr;
  } catch (error) {
    // Log a warning if rewriting fails
    console.warn(`Signal variable assignment transformation failed: ${name}, error: ${error}`);
  }
}

/**
 * Check whether the assignment already targets the `.value` property.
 *
 * @param {t.LVal} left - Assignment left-hand side
 * @returns {boolean} True when `.value` is already being assigned
 */
function isAlreadyValueAssignment(left: t.LVal): boolean {
  return (
    t.isMemberExpression(left) && t.isIdentifier(left.property) && left.property.name === 'value'
  );
}

/**
 * Transform signal variable update expressions to .value property updates
 *
 * This function handles increment and decrement operations on signal variables,
 * converting them to operations on the .value property.
 * This ensures signal variables trigger reactive updates correctly during increment/decrement operations.
 *
 * Transformation rules:
 * - Prefix increment/decrement -> Prefix .value increment/decrement
 * - Postfix increment/decrement -> Postfix .value increment/decrement
 * - Example: $count++ -> $count.value++
 * - Example: ++$index -> ++$index.value
 *
 * Supported update operators:
 * - Increment operation: ++ (prefix and postfix)
 * - Decrement operation: -- (prefix and postfix)
 *
 * Operation type recognition:
 * - Prefix operation: ++variable, --variable
 * - Postfix operation: variable++, variable--
 *
 * Smart skipping:
 * 1. **Non-identifiers**: Complex expressions like object properties, array elements
 * 2. **Non-signal variables**: Regular variable update operations
 * 3. **Already transformed**: Already .value updates are not reprocessed
 *
 * @param {NodePath<t.UpdateExpression>} path - AST path of the update expression node
 *
 * @example
 * ```typescript
 * // Postfix increment
 * $count++;            // -> $count.value++;
 *
 * // Prefix increment
 * ++$index;            // -> ++$index.value;
 *
 * // Postfix decrement
 * $value--;            // -> $value.value--;
 *
 * // Prefix decrement
 * --$counter;          // -> --$counter.value;
 *
 * // Cases not transformed
 * obj.prop++;          // Object property update
 * $count.value++;      // Already transformed update
 * ```
 */
export function symbolUpdate(path: NodePath<t.UpdateExpression>): void {
  const argument = path.node.argument;

  // Type safety: only process identifier type update operations
  if (!t.isIdentifier(argument)) {
    return;
  }

  const name = argument.name;

  // Check if it's a signal variable
  if (!isSignal(path, name)) {
    return;
  }

  // Check if it's already a .value property update to avoid duplicate transformation
  if (isAlreadyValueUpdate(argument)) {
    return;
  }

  try {
    // Perform transformation: $count++ -> $count.value++
    const memberExpr = t.memberExpression(t.identifier(name), t.identifier('value'));
    path.node.argument = memberExpr;
  } catch (error) {
    // Error handling when transformation fails
    console.warn(`Signal variable update transformation failed: ${name}, error: ${error}`);
  }
}

/**
 * Check if the update expression argument is already a .value property access
 *
 * @param {t.Expression} argument - The update expression argument
 * @returns {boolean} Returns true if it's already a .value update
 */
function isAlreadyValueUpdate(argument: t.Expression): boolean {
  return (
    t.isMemberExpression(argument) &&
    t.isIdentifier(argument.property) &&
    argument.property.name === 'value'
  );
}

/**
 * Process signal-aware object destructuring patterns.
 *
 * Walks through every property in the pattern, registers properties that use
 * the signal prefix, and recurses into nested patterns so no signal is missed.
 *
 * @param {NodePath<t.ObjectPattern>} path - Object pattern path
 *
 * @example
 * ```typescript
 * const { $count, $name } = state;
 * const { $count: counter } = state;
 * const { user: { $name } } = data;
 * const { $isLoading = false } = config;
 * ```
 */
export function symbolObjectPattern(path: NodePath<t.ObjectPattern>): void {
  const properties = path.node.properties;

  for (const property of properties) {
    try {
      if (t.isObjectProperty(property)) {
        // Handle standard object property destructuring
        handleObjectProperty(property, path);
      } else if (t.isRestElement(property)) {
        // Handle rest elements such as `const { $a, ...rest } = obj`
        handleRestElement(property, path);
      }
    } catch (error) {
      // Log and continue if processing a single property fails
      console.warn(`Object destructuring property processing failed: ${error}`);
    }
  }
}

/**
 * Handle a single object property within a destructuring pattern.
 *
 * @param {t.ObjectProperty} property - Property node
 * @param {NodePath<t.ObjectPattern>} parentPath - Parent object pattern path
 */
function handleObjectProperty(
  property: t.ObjectProperty,
  parentPath: NodePath<t.ObjectPattern>,
): void {
  // Register signal-like property keys
  if (t.isIdentifier(property.key) && isSignal(parentPath, property.key.name)) {
    // Track the signal name
    registerSignalVar(property.key.name);
  }

  // Traverse nested patterns in property values
  if (t.isObjectPattern(property.value)) {
    // Recurse into nested object patterns
    const mockPath = {
      node: property.value,
      state: parentPath.state,
    } as NodePath<t.ObjectPattern>;
    symbolObjectPattern(mockPath);
  } else if (t.isArrayPattern(property.value)) {
    // Recurse into nested array patterns
    const mockPath = {
      node: property.value,
      state: parentPath.state,
    } as NodePath<t.ArrayPattern>;
    symbolArrayPattern(mockPath);
  } else if (t.isIdentifier(property.value) && isSignal(parentPath, property.value.name)) {
    // Register signals introduced via aliasing
    registerSignalVar(property.value.name);
  }
}

/**
 * Handle rest elements inside object destructuring.
 *
 * @param {t.RestElement} restElement - Rest element node
 * @param {NodePath<t.ObjectPattern>} parentPath - Parent object pattern path
 */
function handleRestElement(
  restElement: t.RestElement,
  parentPath: NodePath<t.ObjectPattern>,
): void {
  const argument = restElement.argument;

  if (t.isIdentifier(argument) && isSignal(parentPath, argument.name)) {
    // Register rest arguments that match the signal prefix
    registerSignalVar(argument.name);
  } else if (t.isObjectPattern(argument)) {
    // Recurse into nested object patterns
    const mockPath = {
      node: argument,
      state: parentPath.state,
    } as NodePath<t.ObjectPattern>;
    symbolObjectPattern(mockPath);
  }
}

/**
 * Process signal variables in array destructuring patterns
 *
 * This function handles signal variables in array destructuring assignments,
 * ensuring they are correctly identified and registered.
 * Array destructuring is very common when dealing with state arrays, function return values,
 * and complex data structures.
 *
 * Supported destructuring patterns:
 * 1. **Direct destructuring**: const [$first, $second] = array
 * 2. **Skipping elements**: const [$first, , $third] = array
 * 3. **Default value destructuring**: const [$count = 0] = array
 * 4. **Nested destructuring**: const [[$x, $y], $z] = nestedArray
 * 5. **Rest destructuring**: const [$first, ...$rest] = array
 *
 * Processing logic:
 * - Iterate through all elements in the array destructuring
 * - Identify elements named as signal variables
 * - Register identified signal variables to the global registry
 * - Recursively process nested destructuring patterns
 * - Handle rest elements and empty elements
 *
 * @param {NodePath<t.ArrayPattern>} path - AST path of the array destructuring pattern node
 *
 * @example
 * ```typescript
 * // Direct destructuring of signal variables
 * const [$x, $y] = coordinates;
 *
 * // Skip unneeded elements
 * const [$first, , $third] = items;
 *
 * // Nested destructuring
 * const [[$count, $name], $status] = nestedData;
 *
 * // Rest destructuring
 * const [$head, ...$tail] = list;
 *
 * // Default value destructuring
 * const [$count = 0, $name = ''] = partialData;
 * ```
 */
export function symbolArrayPattern(path: NodePath<t.ArrayPattern>): void {
  const elements = path.node.elements;

  for (const [i, element] of elements.entries()) {
    // Skip empty elements (hole in array)
    if (!element) {
      continue;
    }

    try {
      if (t.isIdentifier(element)) {
        // Handle direct identifier destructuring
        handleArrayIdentifier(element, path);
      } else if (t.isObjectPattern(element)) {
        // Recursively process nested object destructuring
        const mockPath = {
          node: element,
          state: path.state,
        } as NodePath<t.ObjectPattern>;
        symbolObjectPattern(mockPath);
      } else if (t.isArrayPattern(element)) {
        // Recursively process nested array destructuring
        const mockPath = {
          node: element,
          state: path.state,
        } as NodePath<t.ArrayPattern>;
        symbolArrayPattern(mockPath);
      } else if (t.isRestElement(element)) {
        // Handle rest element destructuring
        handleArrayRestElement(element, path);
      } else if (t.isAssignmentPattern(element)) {
        // Handle default value destructuring
        handleArrayAssignmentPattern(element, path);
      }
    } catch (error) {
      // Log warning when single element processing fails, but continue with others
      console.warn(`Array destructuring element processing failed (index ${i}): ${error}`);
    }
  }
}

/**
 * Handle identifier in array destructuring
 *
 * @param {t.Identifier} identifier - Identifier node
 * @param {NodePath<t.ArrayPattern>} parentPath - Parent node path
 */
function handleArrayIdentifier(
  identifier: t.Identifier,
  parentPath: NodePath<t.ArrayPattern>,
): void {
  if (isSignal(parentPath, identifier.name)) {
    registerSignalVar(identifier.name);
  }
}

/**
 * Handle rest element in array destructuring
 *
 * @param {t.RestElement} restElement - Rest element node
 * @param {NodePath<t.ArrayPattern>} parentPath - Parent node path
 */
function handleArrayRestElement(
  restElement: t.RestElement,
  parentPath: NodePath<t.ArrayPattern>,
): void {
  const argument = restElement.argument;

  if (t.isIdentifier(argument) && isSignal(parentPath, argument.name)) {
    registerSignalVar(argument.name);
  } else if (t.isArrayPattern(argument)) {
    // Rest parameter is nested array destructuring
    const mockPath = {
      node: argument,
      state: parentPath.state,
    } as NodePath<t.ArrayPattern>;
    symbolArrayPattern(mockPath);
  } else if (t.isObjectPattern(argument)) {
    // Rest parameter is nested object destructuring
    const mockPath = {
      node: argument,
      state: parentPath.state,
    } as NodePath<t.ObjectPattern>;
    symbolObjectPattern(mockPath);
  }
}

/**
 * Handle default value pattern in array destructuring
 *
 * @param {t.AssignmentPattern} assignmentPattern - Default value pattern node
 * @param {NodePath<t.ArrayPattern>} parentPath - Parent node path
 */
function handleArrayAssignmentPattern(
  assignmentPattern: t.AssignmentPattern,
  parentPath: NodePath<t.ArrayPattern>,
): void {
  const left = assignmentPattern.left;

  if (t.isIdentifier(left) && isSignal(parentPath, left.name)) {
    registerSignalVar(left.name);
  } else if (t.isArrayPattern(left)) {
    // Left side of default value is array destructuring
    const mockPath = {
      node: left,
      state: parentPath.state,
    } as NodePath<t.ArrayPattern>;
    symbolArrayPattern(mockPath);
  } else if (t.isObjectPattern(left)) {
    // Left side of default value is object destructuring
    const mockPath = {
      node: left,
      state: parentPath.state,
    } as NodePath<t.ObjectPattern>;
    symbolObjectPattern(mockPath);
  }
}
