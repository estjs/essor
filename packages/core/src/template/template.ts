import { isFunction } from 'essor-shared';
import { ComponentNode } from './component-node';
import { TemplateNode } from './template-node';
import { convertToHtmlTag, isHtmlTagName } from './utils';
import type { EssorComponent, EssorNode } from '../../types';

export function h<K extends keyof HTMLElementTagNameMap>(
  _template: EssorComponent | HTMLTemplateElement | K,
  props: Record<string, any>,
  key?: string,
): JSX.Element {
  if (isHtmlTagName(_template)) {
    _template = template(convertToHtmlTag(_template));
    props = {
      1: props,
    };
  }
  return isFunction(_template)
    ? new ComponentNode(_template, props, key)
    : new TemplateNode(_template as HTMLTemplateElement, props, key);
}

export function isComponentOf(node: unknown, component: EssorComponent) {
  return node instanceof ComponentNode && node.template === component;
}

export function isJsxElement(node: unknown): node is EssorNode {
  return node instanceof ComponentNode || node instanceof TemplateNode;
}

export function template(html: string): HTMLTemplateElement {
  const template = document.createElement('template');
  template.innerHTML = html;
  return template;
}
export function Fragment(props: { children: JSX.Element }) {
  return props.children;
}
