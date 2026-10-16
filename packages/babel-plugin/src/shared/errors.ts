/**
 * Error handling system for compilation errors
 */
import { isObject } from '@estjs/shared';
import type * as t from '@babel/types';

/**
 * Source location information
 */
export interface SourceLocation {
  start: { line: number; column: number };
  end: { line: number; column: number };
  filename: string | undefined;
}

export type CompilerErrorCode =
  | 'ERR_IR_VALIDATION'
  | 'ERR_CODEGEN'
  | 'ERR_CONTROL_FLOW'
  | 'ERR_DUPLICATE_PROP'
  | 'ERR_INVALID_ELEMENT'
  | 'ERR_UNKNOWN_CHILD'
  | 'ERR_COMPILE_GENERIC';

export interface CompilerErrorOptions {
  code?: CompilerErrorCode;
  suggestion?: string;
  sourceCode?: string;
  cause?: unknown;
}

/**
 * Generate a clean code frame around the error location
 */
export function generateCodeFrame(
  source: string,
  loc: { line: number; column: number },
  contextLines = 2,
): string {
  const lines = source.split(/\r?\n/);
  const targetLineIdx = loc.line - 1;
  const startIdx = Math.max(0, targetLineIdx - contextLines);
  const endIdx = Math.min(lines.length - 1, targetLineIdx + contextLines);
  const maxLineNumWidth = String(endIdx + 1).length;

  const result: string[] = [];
  for (let i = startIdx; i <= endIdx; i++) {
    const lineNum = String(i + 1).padStart(maxLineNumWidth, ' ');
    const isTarget = i === targetLineIdx;
    const prefix = isTarget ? `> ${lineNum} | ` : `  ${lineNum} | `;
    result.push(prefix + lines[i]);
    if (isTarget) {
      const col = Math.max(0, loc.column);
      const indent = ' '.repeat(prefix.length + col);
      result.push(`${indent}^`);
    }
  }
  return result.join('\n');
}

/**
 * Base compilation error
 */
export class CompileError extends Error {
  public code: CompilerErrorCode;
  public suggestion?: string;
  public frame?: string;

  constructor(
    message: string,
    public loc: SourceLocation | null,
    public filename: string,
    options: CompilerErrorOptions | unknown = {},
  ) {
    super(message);
    this.name = 'CompileError';

    const opts: CompilerErrorOptions =
      isObject(options) && !('stack' in options)
        ? (options as CompilerErrorOptions)
        : { cause: options };

    this.code = opts.code || 'ERR_COMPILE_GENERIC';
    this.suggestion = opts.suggestion;
    this.cause = opts.cause;

    if (opts.sourceCode && this.loc) {
      this.frame = generateCodeFrame(opts.sourceCode, this.loc.start);
    }
  }

  /**
   * Format error as a snapshot-friendly diagnostic
   */
  toDiagnosticString(): string {
    const lines: string[] = [
      `[${this.code}] ${this.message}`,
      `  --> ${this.filename}${this.loc ? `:${this.loc.start.line}:${this.loc.start.column}` : ''}`,
    ];

    if (this.frame) {
      lines.push('', this.frame);
    }

    if (this.suggestion) {
      lines.push('', `Help: ${this.suggestion}`);
    }

    if (this.cause) {
      lines.push('', `Caused by: ${this.cause}`);
    }

    return lines.join('\n');
  }

  /**
   * Format error message with location
   */
  override toString(): string {
    return this.toDiagnosticString();
  }
}

/**
 * IR validation error
 */
export class IRValidationError extends CompileError {
  constructor(
    message: string,
    loc: SourceLocation | null,
    filename: string,
    options: CompilerErrorOptions = {},
  ) {
    let suggestion = options.suggestion;
    let code: CompilerErrorCode = options.code || 'ERR_IR_VALIDATION';

    if (!suggestion) {
      if (
        message.includes('Duplicate static prop') ||
        message.includes('Duplicate dynamic prop') ||
        message.includes('both static and dynamic')
      ) {
        code = 'ERR_DUPLICATE_PROP';
        suggestion = 'Remove the duplicate attribute or rename it.';
      } else if (message.includes('"each" prop')) {
        code = 'ERR_CONTROL_FLOW';
        suggestion = 'Provide the required prop on the control flow component.';
      } else if (message.includes('"when" prop')) {
        code = 'ERR_CONTROL_FLOW';
        suggestion = 'Provide the required prop on the control flow component.';
      } else if (message.includes('Unknown control flow kind')) {
        code = 'ERR_CONTROL_FLOW';
        suggestion =
          'V3 keeps only <For>; render conditionals with a ternary or logical expression.';
      } else if (message.includes('tag')) {
        code = 'ERR_INVALID_ELEMENT';
        suggestion = 'Specify a non-empty element or component tag.';
      }
    }

    super(`IR validation failed: ${message}`, loc, filename, {
      ...options,
      code,
      suggestion,
    });
    this.name = 'IRValidationError';
  }
}

/**
 * Code generation error
 */
export class CodegenError extends CompileError {
  constructor(
    message: string,
    loc: SourceLocation | null,
    filename: string,
    options: CompilerErrorOptions = {},
  ) {
    super(`Codegen failed: ${message}`, loc, filename, {
      ...options,
      code: options.code || 'ERR_CODEGEN',
    });
    this.name = 'CodegenError';
  }
}

/**
 * Create a compilation error
 */
export function createCompileError(
  message: string,
  loc: SourceLocation | t.SourceLocation | null | undefined,
  filename: string,
  options?: CompilerErrorOptions | unknown,
): CompileError {
  const normalizedLoc = loc ? normalizeLocation(loc, filename) : null;
  return new CompileError(message, normalizedLoc, filename, options);
}

/**
 * Normalize Babel location to our format
 */
function normalizeLocation(
  loc: SourceLocation | t.SourceLocation,
  filename: string,
): SourceLocation {
  return {
    start: { line: loc.start.line, column: loc.start.column },
    end: { line: loc.end.line, column: loc.end.column },
    filename,
  };
}
