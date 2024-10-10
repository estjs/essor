import { coerceArray, escape, isArray, isFunction } from '@estjs/shared';
import { isSignal } from '@estjs/signal';
import { LifecycleContext } from './lifecycle-context';
import { extractSignal } from './utils';
import { enterComponent } from './shared-config';
import type { EssorNode, Props } from '../types';

interface TemplateEntry {
  template: string;
  props?: Record<string, unknown>;
}

export enum componentType {
  TEXT,
  TEXT_COMPONENT,
  COMPONENT,
}
type TemplateCollection = Record<number, TemplateEntry>;

export function isSSGNode(node: unknown): node is SSGNode {
  return node instanceof SSGNode;
}
let componentIndex = 1;
export class SSGNode extends LifecycleContext {
  private childNodesMap: Record<string, EssorNode[]> = {};
  private templates: TemplateCollection = {};
  private index = 1;

  constructor(
    private template: string[] | SSGNode | ((props: Props) => SSGNode),
    private props: Props = {},
    public key?: string,
  ) {
    super();

    enterComponent(template, componentIndex);
    if (isArray(this.template)) {
      const PLACEHOLDER = ' __PLACEHOLDER__ ';
      const htmlString = this.template.join(PLACEHOLDER);
      const processedString = htmlString.replaceAll(/(<[^>]+>)|([^<]+)/g, (match, p1, p2) => {
        if (p1) {
          if (p1.includes('__key')) return match;
          return p1.replace(/<\s*([\da-z]+)(\s[^>]*)?>/i, (_, tagName, attrs) => {
            return `<${tagName} __key="${componentIndex}-${this.index++}"${attrs || ''}>`;
          });
        } else if (p2 && p2.replace(PLACEHOLDER, '').trim()) {
          return `<!--${componentType.TEXT}-${componentIndex}-${this.index++}-->${p2}<!$>`;
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
      this.normalizeProp(cur);
      if (cur.children) {
        this.processChildren(cur, ssgIndex, this.template as string[]);
      }
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
        if (props && Object.keys(props).length > 0) {
          const attr = this.generateAttributes(props);
          if (attr) {
            content += ` ${attr}`;
          }
        }
        if (this.childNodesMap[key]) {
          if (content.includes('<!>')) {
            content = content.replace('<!>', this.renderChildren(this.childNodesMap[key]));
          } else {
            content = this.renderChildren(this.childNodesMap[key]) + content;
          }
        }
        return content;
      })
      .join('');
  }

  private renderChildren(children: EssorNode[]): string {
    return coerceArray(children).map(String).join('');
  }

  private normalizeProp(props: Props): void {
    Object.entries(props).forEach(([key, value]) => {
      if (isFunction(value)) {
        delete props[key];
      } else if (isSignal(value)) {
        props[key] = value.value;
      }
    });
  }

  private processChildren(prop: Props, key: number, tmp: string[]): void {
    const children = prop.children as EssorNode[] | undefined;
    if (children) {
      children.forEach(child => {
        componentIndex++;
        const [childNode, path] = isArray(child) ? child : [child, null];
        if (isFunction(childNode)) {
          const result = childNode(prop);
          this.handleChildResult(result, prop, key, tmp, path);
        } else {
          tmp[key - 1] += extractSignal(childNode);
        }
      });
    }
  }

  private handleChildResult(
    result: unknown,
    prop: Props,
    key: number,
    tmp: string[],
    path: string | null,
  ): void {
    if (isSignal(result)) {
      tmp[key - 1] +=
        `<!--${componentType.TEXT_COMPONENT}-${componentIndex}-${this.index++}-->${result.value}<!$>`;
    } else if (isSSGNode(result)) {
      const mapKey = path ?? key;
      this.childNodesMap[mapKey] = [];
      const childResult = result.mount();
      const resolvedResult = isFunction(childResult)
        ? childResult(prop)
        : extractSignal(childResult);
      this.childNodesMap[mapKey].push(resolvedResult as EssorNode);
    } else {
      tmp[key - 1] += isFunction(result)
        ? result(prop)
        : `<!--${componentType.TEXT_COMPONENT}-${componentIndex}-${this.index++}-->${String(result)}<!$>`;
    }
  }

  private generateAttributes(props: Props): string {
    return Object.entries(props)
      .filter(([key, value]) => key !== 'children' && !isFunction(value))
      .map(([key, value]) => `${key}="${escape(String(value))}"`)
      .join(' ');
  }
}
