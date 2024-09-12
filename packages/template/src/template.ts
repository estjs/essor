import { isFunction, isString } from '@estjs/shared';
import { ComponentNode } from './component-node';
import { TemplateNode } from './template-node';
import { closeHtmlTags, convertToHtmlTag, isHtmlTagName } from './utils';
import { mockDocument } from './node-mock';
import type { EssorComponent, EssorNode } from '../types';

export function h<K extends keyof HTMLElementTagNameMap>(
  _template: EssorComponent | HTMLTemplateElement | K | '',
  props: Record<string, unknown>,
  key?: string,
): JSX.Element {
  if (isString(_template)) {
    if (isHtmlTagName(_template)) {
      (_template as string) = convertToHtmlTag(_template);
      props = {
        1: props,
      };
    }
    if (_template === '') {
      props = {
        0: props,
      };
    }
    _template = template(closeHtmlTags(_template));
  }

  return isFunction(_template)
    ? new ComponentNode(_template, props, key)
    : new TemplateNode(_template as HTMLTemplateElement, props, key);
}

export function isComponent(node: unknown) {
  return node instanceof ComponentNode;
}

export function isJsxElement(node: unknown): node is EssorNode {
  return node instanceof ComponentNode || node instanceof TemplateNode;
}

export function template(html: string): HTMLTemplateElement {
  const template = mockDocument.createElement('template');
  template.innerHTML = html;
  return template as any;
}
export function Fragment(props: { children: JSX.Element }) {
  return props.children;
}
