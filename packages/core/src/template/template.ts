import { isFunction } from 'essor-shared';
import { ComponentNode } from './component-node';
import { TemplateNode } from './template-node';
import type { EssorComponent, EssorNode } from '../../types';

export function h(
  template: EssorComponent | HTMLTemplateElement,
  props: Record<string, any>,
  key?: string,
): JSX.Element {
  return isFunction(template)
    ? new ComponentNode(template, props, key)
    : new TemplateNode(template, props, key);
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
