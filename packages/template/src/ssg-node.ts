import { coerceArray, escape, isArray, isFunction } from '@estjs/shared';
import { isSignal } from '@estjs/signal';
import { LifecycleContext } from './lifecycle-context';
import { extractSignal } from './utils';
import type { EssorNode, Props } from '../types';

interface TemplateEntry {
  template: string;
  props?: Record<string, unknown>;
}

type TemplateCollection = Record<number, TemplateEntry>;

export function isSSGNode(node: unknown): node is SSGNode {
  return node instanceof SSGNode;
}
export class SSGNode extends LifecycleContext {
  private childNodesMap: Record<string, EssorNode[]> = {};
  private templates: TemplateCollection = {};

  constructor(
    private template: string[] | SSGNode | ((props: Props) => SSGNode),
    private props: Props = {},
    public key?: string,
  ) {
    super();
    // shallow clone array, template used in template-node
    if (isArray(this.template)) {
      let index = 1;
      const PLACEHOLDER = ' __PLACEHOLDER__ ';

      const htmlString = this.template.join(PLACEHOLDER);

      // process add key
      const processedString = htmlString.replaceAll(/(<[^>]+>)|([^<]+)/g, (match, p1, p2) => {
        if (p1) {
          // if has key,skip
          if (p1.includes('__key')) return match;
          return p1.replace(/<\s*([\da-z]+)(\s[^>]*)?>/i, (fullMatch, tagName, attrs) => {
            return `<${tagName} __key="${index++}"${attrs || ''}>`;
          });
        } else {
          if (p2 && p2.replace(PLACEHOLDER, '').trim()) {
            index++; // text node plus index
          }
        }
        return match;
      });

      this.template = processedString.split(PLACEHOLDER);
    }
  }
  mount(): string {
    this.initRef();
    const output = this.render();

    this.removeRef();
    return output;
  }

  private initTemplates(): void {
    const normalizeProps = Object.values(this.props).reduce((acc, cur) => {
      const ssgIndex = cur.__i;
      delete cur.__i;
      normalizeProp(cur);

      if (cur.children) {
        processChildren(cur, ssgIndex, this.template as string[], this.childNodesMap);
      }

      // ssg index start with 1,minus 1
      acc[ssgIndex - 1] = cur;
      return acc;
    }, {});

    this.templates = (this.template as string[]).reduce((acc, cur, idx) => {
      const prop = normalizeProps[idx];
      acc[idx] = {
        template: cur,
        props: prop,
      };
      return acc;
    }, {});
  }
  render(): string {
    if (isFunction(this.template)) {
      const root = this.template(this.props);
      if (isSSGNode(root)) {
        return root.mount();
      } else {
        return String(root);
      }
    }
    this.initTemplates();

    return Object.entries(this.templates)
      .map(([key, { template, props }]) => {
        let content = template;
        // set bind attr
        if (props && Object.keys(props).length > 0) {
          const attr = generateAttributes(props);
          if (attr) {
            content += ` ${attr}`;
          }
        }

        //replace children in comment
        if (this.childNodesMap[key]) {
          if (content.includes('<!>')) {
            content = content.replace('<!>', this.renderChildren(this.childNodesMap[key]));
          } else {
            content += this.renderChildren(this.childNodesMap[key]);
          }
        }
        return content;
      })
      .join('');
  }

  private renderChildren(children: EssorNode[]): string {
    return coerceArray(children).map(String).join('');
  }
}
function normalizeProp(props: Props): void {
  Object.entries(props).forEach(([key, value]) => {
    if (isFunction(value)) {
      // Remove function props as they are not serializable
      delete props[key];
    } else if (isSignal(value)) {
      // Unwrap signal to its current value
      props[key] = value.value;
    }
  });
}
function processChildren(
  prop: Props,
  key: number,
  tmp: string[],
  childNodesMap: Record<string, EssorNode[]>,
): void {
  const children = prop.children as EssorNode[] | undefined;
  if (children) {
    children.forEach(child => {
      const [childNode, path] = isArray(child) ? child : [child, null];
      if (isFunction(childNode)) {
        const result = childNode(prop);
        handleChildResult(result, prop, key, tmp, path, childNodesMap);
      } else {
        tmp[key - 1] += extractSignal(childNode);
      }
    });
  }
}
function handleChildResult(
  result: unknown,
  prop: Props,
  key: number,
  tmp: string[],
  path: string | null,
  childNodesMap: Record<string, EssorNode[]>,
): void {
  if (isSignal(result)) {
    tmp[key - 1] += result.value;
  } else if (isSSGNode(result)) {
    const mapKey = path ?? key;
    childNodesMap[mapKey] = childNodesMap[mapKey] || [];
    const childResult = result.mount();
    const resolvedResult = isFunction(childResult) ? childResult(prop) : extractSignal(childResult);
    childNodesMap[mapKey].push(resolvedResult as EssorNode);
  } else {
    tmp[key - 1] += isFunction(result) ? result(prop) : String(result);
  }
}
function generateAttributes(props: Props): string {
  return Object.entries(props)
    .filter(([key, value]) => key !== 'children' && !isFunction(value))
    .map(([key, value]) => `${key}="${escape(String(value))}"`)
    .join(' ');
}
