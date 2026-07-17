import { escapeHTML } from '@estjs/shared';

const WHOLE_TEXT_TAGS = new Set(['title', 'textarea', 'style', 'script']);
const STYLE_END_TAG = /<\/style(?=[\t\n\f\r />])/i;
const SCRIPT_END_TAG = /<\/script(?=[\t\n\f\r />])/i;

export function isWholeTextTag(tag: string): boolean {
  return WHOLE_TEXT_TAGS.has(tag);
}

export function hasRawTextEndTag(tag: string, text: string): boolean {
  if (tag === 'style') return STYLE_END_TAG.test(text);
  if (tag === 'script') return SCRIPT_END_TAG.test(text);
  return false;
}

export function serializeStaticWholeText(tag: string, text: string): string {
  if (tag === 'style' || tag === 'script') return text;
  const serialized = escapeHTML(text);
  return tag === 'textarea' && text.startsWith('\n') ? `\n${serialized}` : serialized;
}
