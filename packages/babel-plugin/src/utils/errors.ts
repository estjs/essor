/**
 * Improved error handling system for the Essor compiler.
 *
 * Provides:
 * - Typed error codes for all compilation errors
 * - Structured error messages with context interpolation
 * - Source location tracking for better error reporting
 * - Consistent error formatting across the compiler
 */
import type * as t from '@babel/types';

/**
 * Enumeration of all possible compilation error codes.
 *
 * These codes provide a stable API for error handling and can be used
 * by tools to provide localized error messages or custom handling.
 */
export enum CompileErrorCode {
  // JSX validation errors
  WHOLE_TEXT_INVALID_CHILDREN = 'WHOLE_TEXT_INVALID_CHILDREN',
  UNSAFE_RAW_TEXT_TOKEN = 'UNSAFE_RAW_TEXT_TOKEN',
  TEXTAREA_BIND_WITH_CHILDREN = 'TEXTAREA_BIND_WITH_CHILDREN',
  DYNAMIC_SCRIPT_CHILDREN = 'DYNAMIC_SCRIPT_CHILDREN',

  // Binding errors
  INVALID_BIND_TARGET = 'INVALID_BIND_TARGET',
  UNKNOWN_BIND_MODIFIER = 'UNKNOWN_BIND_MODIFIER',

  // Signal transformation errors
  SIGNAL_DESTRUCTURING_ERROR = 'SIGNAL_DESTRUCTURING_ERROR',

  // General errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}

/**
 * Context data for error message interpolation.
 */
export interface ErrorContext {
  tag?: string;
  bindName?: string;
  targetType?: string;
  modifier?: string;
  allowedModifiers?: string[];
  [key: string]: any;
}

/**
 * Compilation error with rich metadata.
 */
export class CompileError extends Error {
  /**
   * @param code - Error code for programmatic handling
   * @param message - Human-readable error message
   * @param node - AST node where the error occurred
   * @param suggestions - Optional suggestions for fixing the error
   */
  constructor(
    public readonly code: CompileErrorCode,
    message: string,
    public readonly node?: t.Node,
    public readonly suggestions?: string[],
  ) {
    super(message);
    this.name = 'CompileError';

    // Maintain proper stack trace in V8
    if (typeof (Error as any).captureStackTrace === 'function') {
      (Error as any).captureStackTrace(this, CompileError);
    }
  }

  /**
   * Get source location if available.
   */
  get loc(): t.SourceLocation | null | undefined {
    return this.node?.loc;
  }

  /**
   * Format error for display.
   */
  toString(): string {
    let msg = `[${this.code}] ${this.message}`;

    if (this.loc?.start) {
      msg += ` (${this.loc.start.line}:${this.loc.start.column})`;
    }

    if (this.suggestions && this.suggestions.length > 0) {
      msg += '\n\nSuggestions:';
      for (const suggestion of this.suggestions) {
        msg += `\n  - ${suggestion}`;
      }
    }

    return msg;
  }
}

/**
 * Error message templates with context interpolation.
 */
const ERROR_MESSAGES: Record<CompileErrorCode, (ctx: ErrorContext) => string> = {
  [CompileErrorCode.WHOLE_TEXT_INVALID_CHILDREN]: (ctx) =>
    `Only text and primitive expressions are supported inside <${ctx.tag}>. ` +
    `Complex JSX elements cannot be children of whole-text elements.`,

  [CompileErrorCode.UNSAFE_RAW_TEXT_TOKEN]: (ctx) =>
    `Unsafe </${ctx.tag}> token found in static <${ctx.tag}> text content. ` +
    `This could cause HTML injection vulnerabilities.`,

  [CompileErrorCode.TEXTAREA_BIND_WITH_CHILDREN]: () =>
    `<textarea> cannot combine bind:value with children because both write its text value. ` +
    `Use either bind:value or children, not both.`,

  [CompileErrorCode.DYNAMIC_SCRIPT_CHILDREN]: () =>
    `Dynamic <script> children are not supported because server execution and ` +
    `client template cloning cannot share a safe execution contract.`,

  [CompileErrorCode.INVALID_BIND_TARGET]: (ctx) =>
    `bind:${ctx.bindName} target is ${ctx.targetType}. ` +
    `Two-way binding requires a writable identifier or member expression ` +
    `(e.g. \`bind:value={$text}\` or \`bind:value={form.name}\`).`,

  [CompileErrorCode.UNKNOWN_BIND_MODIFIER]: (ctx) =>
    `Unknown bind:${ctx.bindName} modifier "${ctx.modifier}". ` +
    `Allowed: ${ctx.allowedModifiers?.join(', ')}.`,

  [CompileErrorCode.SIGNAL_DESTRUCTURING_ERROR]: (ctx) =>
    `Error destructuring signal: ${ctx.message}`,

  [CompileErrorCode.INTERNAL_ERROR]: (ctx) => `Internal compiler error: ${ctx.message}`,
};

/**
 * Create a CompileError with interpolated message.
 *
 * @param code - Error code
 * @param context - Context data for message interpolation
 * @param node - AST node where error occurred
 * @param suggestions - Optional fix suggestions
 * @returns Constructed error
 */
export function createCompileError(
  code: CompileErrorCode,
  context: ErrorContext = {},
  node?: t.Node,
  suggestions?: string[],
): CompileError {
  const messageTemplate = ERROR_MESSAGES[code];
  const message = messageTemplate(context);
  return new CompileError(code, message, node, suggestions);
}

/**
 * Throw a compilation error.
 *
 * @param code - Error code
 * @param context - Context data
 * @param node - AST node
 * @param suggestions - Fix suggestions
 * @throws {CompileError}
 */
export function throwCompileError(
  code: CompileErrorCode,
  context?: ErrorContext,
  node?: t.Node,
  suggestions?: string[],
): never {
  throw createCompileError(code, context, node, suggestions);
}

/**
 * Convenience functions for common errors.
 */
export const CompileErrors = {
  wholeTextInvalidChildren(tag: string, node?: t.Node): never {
    return throwCompileError(CompileErrorCode.WHOLE_TEXT_INVALID_CHILDREN, { tag }, node, [
      `Use only text nodes inside <${tag}>`,
      `Use template expressions for dynamic content: <${tag}>{value}</${tag}>`,
    ]);
  },

  unsafeRawTextToken(tag: string, node?: t.Node): never {
    return throwCompileError(CompileErrorCode.UNSAFE_RAW_TEXT_TOKEN, { tag }, node, [
      `Escape the closing tag in your content`,
      `Use a different approach that doesn't require embedding </${tag}>`,
    ]);
  },

  textareaBindWithChildren(node?: t.Node): never {
    return throwCompileError(CompileErrorCode.TEXTAREA_BIND_WITH_CHILDREN, {}, node, [
      `Remove the children and use bind:value only`,
      `Remove bind:value and set value via children`,
    ]);
  },

  dynamicScriptChildren(node?: t.Node): never {
    return throwCompileError(CompileErrorCode.DYNAMIC_SCRIPT_CHILDREN, {}, node, [
      `Move script content to a static <script> tag`,
      `Use a different approach to inject dynamic scripts`,
    ]);
  },

  invalidBindTarget(bindName: string, targetType: string, node?: t.Node): never {
    return throwCompileError(CompileErrorCode.INVALID_BIND_TARGET, { bindName, targetType }, node, [
      `Use a signal: bind:${bindName}={$value}`,
      `Use a member expression: bind:${bindName}={obj.prop}`,
    ]);
  },

  unknownBindModifier(
    bindName: string,
    modifier: string,
    allowedModifiers: string[],
    node?: t.Node,
  ): never {
    return throwCompileError(
      CompileErrorCode.UNKNOWN_BIND_MODIFIER,
      { bindName, modifier, allowedModifiers },
      node,
      allowedModifiers.map((m) => `Use {${m}: true} modifier`),
    );
  },

  internalError(message: string, node?: t.Node): never {
    return throwCompileError(CompileErrorCode.INTERNAL_ERROR, { message }, node);
  },
};
