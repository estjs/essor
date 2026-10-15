/**
 * Helpers shared by the client/hydrate and server generators.
 */
import * as t from '@babel/types';
import { SLOT_CLOSE, SLOT_OPEN, escapeHTML, isBooleanAttr, propsToAttrMap } from '@estjs/shared';
import type { CompileContext, IRDynamicProp, IRElement, IRNode, IRStaticProp } from '../core/types';

/**
 * SSR / hydration slot marker pair. A dynamic slot always renders both
 * markers, even when its value renders nothing, so hydration claims the
 * same range the server produced.
 */
export const SLOT = `${SLOT_OPEN}${SLOT_CLOSE}`;
export { SLOT_CLOSE, SLOT_OPEN };

/** Tags whose content is text only; dynamic content is inserted as a whole. */
export const TEXT_ONLY_TAGS = new Set(['title', 'textarea', 'style']);

export function escapeAttr(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;');
}

/** Serialize static attributes for a template open tag. */
export function serializeStaticAttrs(
  props: IRStaticProp[],
  skip?: (name: string) => boolean,
): string {
  const merged: Array<{ name: string; value: string | boolean }> = [];
  const mergedIndexByName = new Map<string, number>();
  let classValue: string | undefined;

  for (const prop of props) {
    if (prop.isOverridden || skip?.(prop.name)) continue;
    const rawVal = prop.value;
    let val: string | boolean;
    if (t.isStringLiteral(rawVal)) {
      val = rawVal.value;
    } else if (t.isNumericLiteral(rawVal)) {
      val = String(rawVal.value);
    } else if (t.isBooleanLiteral(rawVal)) {
      val = rawVal.value;
    } else {
      continue;
    }

    const name = propsToAttrMap[prop.name] ?? prop.name;
    if (name === 'class') {
      classValue = classValue ? `${classValue} ${val}` : String(val);
      continue;
    }

    const existing = mergedIndexByName.get(name);
    if (existing !== undefined) {
      merged[existing] = { name, value: val };
    } else {
      mergedIndexByName.set(name, merged.length);
      merged.push({ name, value: val });
    }
  }

  if (classValue !== undefined) {
    merged.unshift({ name: 'class', value: classValue });
  }

  let out = '';
  for (const attr of merged) {
    const { name, value } = attr;
    if (typeof value === 'boolean') {
      const isAriaOrData = name.startsWith('aria-') || name.startsWith('data-');
      if (isAriaOrData) {
        out += ` ${name}="${value}"`;
      } else if (isBooleanAttr(name)) {
        if (value) out += ` ${name}`;
      } else {
        out += value ? ` ${name}` : ` ${name}="false"`;
      }
    } else {
      out += ` ${name}="${escapeHTML(value)}"`;
    }
  }
  return out;
}

/** Object key for a prop name: identifier when valid, string literal otherwise. */
export function propKey(name: string): t.Identifier | t.StringLiteral {
  return /^[a-z_$][\w$]*$/i.test(name) && name !== '__proto__'
    ? t.identifier(name)
    : t.stringLiteral(name);
}

/** Expression referencing a component tag (`Foo`, `Foo.Bar`, or a builtin import). */
export function componentReference(ir: IRElement, ctx: CompileContext): t.Expression {
  if (ir.importName) return ctx.imports.get(ir.importName);
  const parts = ir.tag.split('.');
  let expr: t.Expression = t.identifier(parts[0]);
  for (let i = 1; i < parts.length; i++) {
    expr = t.memberExpression(expr, t.identifier(parts[i]));
  }
  return expr;
}

/** Static + dynamic props in JSX source order. */
export function orderedAttrs(
  ir: IRElement,
): Array<{ kind: 'static'; prop: IRStaticProp } | { kind: 'dynamic'; prop: IRDynamicProp }> {
  return [
    ...ir.props.static.map((prop) => ({ kind: 'static' as const, prop })),
    ...ir.props.dynamic.map((prop) => ({ kind: 'dynamic' as const, prop })),
  ].sort((a, b) => a.prop.order - b.prop.order);
}

/** Last non-overridden value for an attribute name (static or dynamic). */
export function winningAttr(ir: IRElement, name: string): t.Expression | null {
  let winner: { order: number; value: t.Expression } | null = null;
  for (const prop of [...ir.props.static, ...ir.props.dynamic]) {
    if (prop.name !== name) continue;
    if (!winner || prop.order > winner.order) winner = { order: prop.order, value: prop.value };
  }
  return winner ? (t.cloneNode(winner.value, true) as t.Expression) : null;
}

/** A tag with text-only content that has at least one dynamic child. */
export function isDynamicTextOnly(ir: IRElement): boolean {
  return (
    !ir.isComponent &&
    TEXT_ONLY_TAGS.has(ir.tag) &&
    ir.children.some((child) => child.type === 'expression')
  );
}

/** Build the whole-text content value from text/expression children. */
export function textOnlyContent(children: IRNode[]): t.Expression {
  const parts: t.Expression[] = [];
  for (const child of children) {
    if (child.type === 'text') parts.push(t.stringLiteral(child.value));
    else if (child.type === 'expression') parts.push(child.node);
  }
  return parts.length === 1 ? parts[0] : t.arrayExpression(parts);
}

/** Wrap statements into an IIFE expression. */
export function iife(statements: t.Statement[]): t.Expression {
  return t.callExpression(t.arrowFunctionExpression([], t.blockStatement(statements)), []);
}
