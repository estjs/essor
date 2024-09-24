import { isFunction, isString } from '@estjs/shared';
import { closeHtmlTags, convertToHtmlTag, isHtmlTagName } from './utils';
import { ComponentRender } from './render/component';
import { TemplateRender } from './render/template';
import type { EssorComponent, EssorNode, Props } from '../types';

export function h<K extends keyof HTMLElementTagNameMap>(
  template: EssorComponent | HTMLTemplateElement | K | '',
  props?: Props,
  key?: string,
): JSX.Element {
  if (isString(template)) {
    if (isHtmlTagName(template)) {
      (template as string) = convertToHtmlTag(template);
      props = { '1': props };
    } else if (template === '') {
      props = { '0': props };
    }
    template = createTemplate(template);
  }

  return isFunction(template)
    ? new ComponentRender(template, props, key)
    : new TemplateRender(template, props, key);
}

export function isComponent(node: unknown): node is ComponentRender {
  return node instanceof ComponentRender;
}

export function isJsxElement(node: unknown): node is EssorNode {
  return node instanceof ComponentRender || node instanceof TemplateRender;
}

export function createTemplate(html: string): HTMLTemplateElement {
  const template = document.createElement('template');
  template.innerHTML = closeHtmlTags(html);
  return template;
}

export function Fragment(props: { children: JSX.Element }): JSX.Element {
  return props.children;
}
