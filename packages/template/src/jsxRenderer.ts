import { isFunction, isString } from '@estjs/shared';
import { convertToHtmlTag } from './utils';
import { ComponentNode } from './componentNode';
import { TemplateNode } from './templateNode';
import { EMPTY_TEMPLATE, FRAGMENT_PROP_KEY, SINGLE_PROP_KEY } from './sharedConfig';
import { Cache } from './cache';
import type { EssorComponent, EssorNode, Props } from '../types';

// 配置组件缓存
export const componentCache = new Cache<ComponentNode>({
  maxSize: 1000, // 可以根据实际需求调整
  ttl: 5 * 60 * 1000, // 5分钟缓存时间
});

function createNodeCache(
  NodeConstructor: typeof ComponentNode | typeof TemplateNode,
  template: EssorComponent | HTMLTemplateElement | string,
  props: Props = {},
  key?: string,
): JSX.Element {
  if (key) {
    const cached = componentCache.get(key);
    if (cached) {
      return cached;
    }
  }

  // 处理字符串模板
  if (typeof template === 'string') {
    template = createTemplate(template);
  }

  const newNode = new NodeConstructor(template as any, props, key);
  if (key && newNode instanceof ComponentNode) {
    componentCache.set(key, newNode);
  }
  return newNode;
}
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
  props: Props = {},
  key?: string,
): JSX.Element {
  // handle fragment
  if (template === EMPTY_TEMPLATE) {
    return Fragment(template, props) as JSX.Element;
  }

  // Handle string templates
  if (isString(template)) {
    const htmlTemplate = convertToHtmlTag(template);
    const wrappedProps = { [SINGLE_PROP_KEY]: props };
    return createNodeCache(TemplateNode, htmlTemplate, wrappedProps, key);
  }

  // Handle functional templates (Components)
  if (isFunction(template)) {
    return createNodeCache(ComponentNode, template, props, key);
  }

  // Handle HTMLTemplateElement
  return createNodeCache(TemplateNode, template, props, key);
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
  /**
   * the code that sets the unclosed tag, the browser's innerHTML method is, will automatically close the tag.
   * like `<div><button type=button>`
   * it will be translated:
   * `<div><button type=button></button></div>`
   */
  template.innerHTML = html;
  return template;
}

export function Fragment<
  T extends
    | JSX.JSXElement
    | string
    | number
    | boolean
    | Array<JSX.JSXElement | string | number | boolean>,
>(
  template: HTMLTemplateElement | '',
  props: { children: T } | { [key: string]: { children: T } },
): JSX.Element {
  const processedProps = props.children
    ? {
        [FRAGMENT_PROP_KEY]: {
          children: (Array.isArray(props.children)
            ? props.children.filter(Boolean)
            : [props.children]) as T,
        },
      }
    : props;

  const templateElement = template === EMPTY_TEMPLATE ? createTemplate(EMPTY_TEMPLATE) : template;

  return createNodeCache(TemplateNode, templateElement, processedProps);
}
