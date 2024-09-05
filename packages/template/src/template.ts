import { isArray, isFunction, isString } from '@estjs/shared';
import { ComponentNode } from './component-node';
import { TemplateNode } from './template-node';
import { closeHtmlTags, convertToHtmlTag, isHtmlTagName } from './utils';
import { ServerNode } from './server-node';
import type { EssorComponent, EssorNode } from '../types';

export function h<K extends keyof HTMLElementTagNameMap>(
  _template: EssorComponent | HTMLTemplateElement | K | '',
  props: Record<string, any>,
  key?: string,
): JSX.Element {
  if (isString(_template)) {
    if (isHtmlTagName(_template as any)) {
      (_template as string) = convertToHtmlTag(_template as string);
      props = {
        1: props,
      };
    }
    if (_template === '') {
      props = {
        0: props,
      };
    }

    _template = template(_template as string);
  }

  return isFunction(_template)
    ? new ComponentNode(_template, props, key)
    : isArray(_template)
      ? (new ServerNode(_template, props, key) as unknown as EssorNode)
      : new TemplateNode(_template as HTMLTemplateElement, props, key);
}

export function isComponentOf(node: unknown, component: EssorComponent) {
  return node instanceof ComponentNode && node.template === component;
}

export function isJsxElement(node: unknown): node is EssorNode {
  return node instanceof ComponentNode || node instanceof TemplateNode;
}

export function template(html: string): HTMLTemplateElement {
  html = closeHtmlTags(html);
  const template = document.createElement('template');
  template.innerHTML = html;
  return template;
}
export function Fragment(props: { children: JSX.Element }) {
  return props.children;
}
