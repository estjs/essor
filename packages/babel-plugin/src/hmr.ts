/**
 * HMR Transformation for Babel Plugin
 *
 * This module handles Hot Module Replacement transformations:
 * 1. Generates unique signatures for each component based on code content
 * 2. Attaches HMR metadata (__hmrId, __signature) to components
 * 3. Generates __$registry$__ array for runtime HMR updates
 */

import { type NodePath, types as t } from '@babel/core';
import { generate } from '@babel/generator';
import { checkHasJSXReturn } from './signals/utils';
import { HMR_COMPONENT_NAME } from './constants';
import type { PluginState } from './types';

interface HmrComponentInfo {
  name: string;
  hmrId: string;
  signature: string;
}

/**
 * Pre-compiled regex for performance
 */
const WHITESPACE_REGEX = /\s+/g;

/**
 * Optimized DJB2 hash algorithm with bit operations
 * Used to generate unique IDs and signatures for HMR
 *
 * @param str - String to hash
 * @returns Hash as base36 string (shorter and URL-safe)
 */
function simpleHash(str: string): string {
  let hash = 5381;
  const len = str.length;

  // Use bit operations for better performance
  for (let i = 0; i < len; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }

  // Convert to unsigned 32-bit integer, then to base36 for shorter strings
  return (hash >>> 0).toString(36);
}

// ============================================
// State Management
// ============================================

/**
 * Component registry for current file transformation
 * Cleared after each file is processed
 */
const hmrComponentMap = new Map<string, HmrComponentInfo>();

/**
 * Clear HMR component map (called after each file transformation)
 */
export function clearHmrComponentMap(): void {
  hmrComponentMap.clear();
}

/**
 * Generate component signature based on code content
 *
 * Normalizes whitespace to ensure stable signatures across
 * formatting changes and only triggers HMR when actual code changes
 */
export function generateComponentSignature(code: string): string {
  // Single regex replacement for better performance
  const normalizedCode = code.replace(WHITESPACE_REGEX, ' ').trim();
  return simpleHash(normalizedCode);
}

// ============================================
// Component Transformation
// ============================================

/**
 * Extract function body code for signature generation
 */
function getFunctionBodyCode(
  path: NodePath<t.FunctionDeclaration | t.ArrowFunctionExpression>,
): string {
  const body = path.node.body;
  return generate(body).code;
}

/**
 * Extract component name from function declaration or arrow function
 */
function getComponentName(
  path: NodePath<t.FunctionDeclaration | t.ArrowFunctionExpression>,
): string | undefined {
  if (t.isFunctionDeclaration(path.node)) {
    return path.node.id?.name;
  }

  // For arrow functions, check if it's assigned to a variable
  if (t.isArrowFunctionExpression(path.node)) {
    if (path.parentPath.isVariableDeclarator() && t.isIdentifier(path.parentPath.node.id)) {
      return path.parentPath.node.id.name;
    }
  }

  return undefined;
}

/**
 * Get the target path where HMR assignments should be inserted
 * For function declarations: the function itself
 * For arrow functions: the variable declaration
 */
function getTargetPath(
  path: NodePath<t.FunctionDeclaration | t.ArrowFunctionExpression>,
): NodePath | undefined {
  if (t.isFunctionDeclaration(path.node)) {
    return path;
  }

  // For arrow functions assigned to variables
  if (
    path.parentPath.isVariableDeclarator() &&
    path.parentPath.parentPath.isVariableDeclaration()
  ) {
    return path.parentPath.parentPath;
  }

  return undefined;
}

/**
 * Transform component to HMR-enabled form
 *
 * Adds __hmrId and __signature properties to component functions
 * for runtime HMR tracking and updates
 */
export function transformHmr(
  path: NodePath<t.FunctionDeclaration | t.ArrowFunctionExpression>,
  state?: PluginState,
): void {
  // Extract component name
  const componentName = getComponentName(path);
  if (!componentName) return;

  // Only transform components (functions that return JSX)
  if (!checkHasJSXReturn(path)) return;

  // Get the path where we should insert HMR assignments
  const targetPath = getTargetPath(path);
  if (!targetPath) return;

  // Generate unique HMR ID: {fileHash}:{componentName}
  const fileHash = simpleHash(state?.filename || 'anonymous');
  const hmrId = `${fileHash}:${componentName}`;

  // Generate component signature based on function body + filename
  // This ensures components are only updated when their code actually changes
  const bodyCode = getFunctionBodyCode(path);
  const signature = generateComponentSignature(bodyCode + (state?.filename || ''));

  // Create assignment: Component.__hmrId = "hash:ComponentName"
  const hmrIdAssignment = t.expressionStatement(
    t.assignmentExpression(
      '=',
      t.memberExpression(t.identifier(componentName), t.identifier('__hmrId')),
      t.stringLiteral(hmrId),
    ),
  );

  // Create assignment: Component.__signature = "signatureHash"
  const signatureAssignment = t.expressionStatement(
    t.assignmentExpression(
      '=',
      t.memberExpression(t.identifier(componentName), t.identifier('__signature')),
      t.stringLiteral(signature),
    ),
  );

  // Insert assignments after the component declaration
  targetPath.insertAfter(hmrIdAssignment);
  targetPath.insertAfter(signatureAssignment);

  // Store component info for registry generation
  hmrComponentMap.set(componentName, { name: componentName, hmrId, signature });
}

/**
 * Generate __$registry$__ array at end of file
 *
 * Creates an array of all HMR-enabled components that the runtime
 * uses to track and update components on hot reload
 */
export function generateHmrRegistry(path: NodePath<t.Program>): void {
  if (hmrComponentMap.size === 0) return;

  try {
    // Collect all registered component identifiers
    const registryElements: t.Identifier[] = [];
    hmrComponentMap.forEach(info => {
      registryElements.push(t.identifier(info.name));
    });

    // Generate: const __$registry$__ = [Component1, Component2, ...];
    const registryDeclaration = t.variableDeclaration('const', [
      t.variableDeclarator(t.identifier('__$registry$__'), t.arrayExpression(registryElements)),
    ]);

    // Add registry to end of program
    path.node.body.push(registryDeclaration);
  } finally {
    // Ensure cleanup even if error occurs
    hmrComponentMap.clear();
  }
}

export function transformCreateComponent(
  path: NodePath<t.Program>,
  imports: Record<string, t.Identifier>,
): void {
  path.traverse({
    CallExpression(callPath) {
      const { callee } = callPath.node;

      if (!t.isIdentifier(callee)) return;

      if (callee.name === imports.createComponent.name) {
        callPath.node.callee = t.identifier(HMR_COMPONENT_NAME);
        return;
      }

      // Transform: createApp(App, 'root') -> createApp(__$createHMRComponent$__(App), 'root')
      if (callee.name === 'createApp') {
        const args = callPath.node.arguments;
        if (args.length === 0) return;

        // Skip if already transformed
        if (
          t.isCallExpression(args[0]) &&
          t.isIdentifier(args[0].callee) &&
          args[0].callee.name === HMR_COMPONENT_NAME
        ) {
          return;
        }

        args[0] = t.callExpression(t.identifier(HMR_COMPONENT_NAME), [args[0]]);
        callPath.node.arguments = args;
      }
    },
  });
}
