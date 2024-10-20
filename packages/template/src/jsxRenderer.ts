import { isArray, isFunction, isString } from '@estjs/shared';
import { closeHtmlTags, convertToHtmlTag, isHtmlTagName } from './utils';
import { ComponentNode } from './componentNode';
import { TemplateNode } from './templateNode';
import { EMPTY_TEMPLATE, FRAGMENT_PROP_KEY, SINGLE_PROP_KEY } from './sharedConfig';
import type { EssorComponent, EssorNode, Props } from '../types';

/**
 * Creates a JSX element from a given template.
 *
 * @param template - The template to render. Can be a string representing an HTML
 * element, a function representing a component, or an `HTMLTemplateElement`.
 * @param props - Properties to pass to the component or element.
 * @param key - The key of the element.
 * @returns The created JSX element.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  template: EssorComponent | HTMLTemplateElement | K | '',
  props?: Props,
  key?: string,
): JSX.Element {
  if (isString(template)) {
    if (isHtmlTagName(template)) {
      const htmlTemplate = convertToHtmlTag(template);
      props = { [SINGLE_PROP_KEY]: props };
      return new TemplateNode(createTemplate(htmlTemplate), props, key);
    } else if (template === EMPTY_TEMPLATE) {
      props = { [FRAGMENT_PROP_KEY]: props };
      return new TemplateNode(createTemplate(EMPTY_TEMPLATE), props, key);
    }
  }

  return isFunction(template)
    ? new ComponentNode(template, props, key)
    : new TemplateNode(template as HTMLTemplateElement, props, key);
}

/**
 * Checks if the given node is an instance of `ComponentNode`.
 *
 * @param node The node to check.
 * @returns `true` if the node is an instance of `ComponentNode`, otherwise `false`.
 */
export function isComponent(node: unknown): node is ComponentNode {
  return node instanceof ComponentNode;
}

/**
 * Checks if the given node is a JSX element. A JSX element is either an instance
 * of `ComponentNode` or an instance of `TemplateNode`.
 *
 * @param node The node to check.
 * @returns `true` if the node is a JSX element, otherwise `false`.
 */
export function isJsxElement(node: unknown): node is EssorNode {
  return node instanceof ComponentNode || node instanceof TemplateNode;
}

/**
 * Creates an HTML template element from a given HTML string.
 *
 * @param html The HTML string to create a template from.
 * @returns A new HTML template element.
 */
export function createTemplate(html: string): HTMLTemplateElement {
  const template = document.createElement('template');
  template.innerHTML = closeHtmlTags(html);
  return template;
}

/**
 * @param props - An object containing the `children` prop.
 * @param props.children - The children to be rendered. Can be a single JSX element, string, number, boolean,
 *                         or an array of these. Falsy values in arrays will be filtered out.
 * @returns A JSX element representing the fragment, wrapping the filtered children.
 */
export function Fragment<
  T extends
    | JSX.JSXElement
    | string
    | number
    | boolean
    | (JSX.JSXElement | string | number | boolean)[],
>(props: { children: T }) {
  return h(EMPTY_TEMPLATE, {
    children: isArray(props.children) ? props.children.filter(Boolean) : [props.children],
  });
}
