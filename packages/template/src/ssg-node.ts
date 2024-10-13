import { escape, isArray, isFunction } from '@estjs/shared';
import { isSignal } from '@estjs/signal';
import { LifecycleContext } from './lifecycle-context';
import { extractSignal } from './utils';
import { enterComponent } from './shared-config';
import type { Signal } from '@estjs/signal/*';
import type { EssorNode, Props } from '../types';

export enum componentType {
  TEXT,
  TEXT_COMPONENT,
  COMPONENT,
}

export function isSSGNode(node: unknown): node is SSGNode {
  return node instanceof SSGNode;
}
let componentIndex = 1;
export class SSGNode extends LifecycleContext {
  templates: string;
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
          if (p1.includes('data-ci')) return match;
          return p1.replace(/<\s*([\da-z]+)(\s[^>]*)?>/i, (_, tagName, attrs) => {
            return `<${tagName} data-ci="${componentIndex}"${attrs || ''}>`;
          });
        } else if (p2 && p2.replace(PLACEHOLDER, '').trim()) {
          return `<!--${componentType.TEXT}-${componentIndex}-->${p2}<!$>`;
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

  render(): string {
    if (isFunction(this.template)) {
      const root = this.template(this.props);
      if (isSSGNode(root)) {
        return root.mount();
      } else {
        return String(root);
      }
    }
    const template = this.template as string[];
    Object.keys(this.props).forEach(key => {
      const cur = this.props[key];
      const childrens = cur.children;
      normalizeProp(cur);
      const findIndex = template.findIndex(t => t.includes(`data-hk="${key}"`));

      // add children
      if (childrens) {
        childrens.forEach(([child]) => {
          componentIndex++;
          // dont need path in this case
          const children = renderChildren(child, cur);
          this.template[findIndex] += children;
        });
      }
      // add props
      this.template[findIndex].replaceAll(
        `data-hk="${key}"`,
        `data-hk="${key}" ${generateAttributes(cur)}`,
      );
    });

    return template.join('');
  }
}

function normalizeProp(props: Props): void {
  Object.entries(props).forEach(([key, value]) => {
    if (key === 'children') {
      delete props[key];
    } else if (isFunction(value)) {
      delete props[key];
    } else if (isSignal(value)) {
      props[key] = value.value;
    }
  });
}

function generateAttributes(props: Props): string {
  return Object.entries(props)
    .filter(([key, value]) => key !== 'children' && !isFunction(value))
    .map(([key, value]) => `${key}="${escape(String(value))}"`)
    .join(' ');
}

export function renderChildren(
  children: EssorNode | Function | Signal<unknown>,
  prop: Props,
): string {
  if (isFunction(children)) {
    return renderChildren(children(prop), prop);
  } else if (isSignal(children)) {
    return `<!--${componentType.TEXT_COMPONENT}-${componentIndex}-->${(children as Signal<any>).value}<!$>`;
  } else if (isSSGNode(children)) {
    const childResult = (children as SSGNode).mount();
    return isFunction(childResult) ? childResult(prop) : extractSignal(childResult);
  } else {
    return `<!--${componentType.TEXT_COMPONENT}-${componentIndex}-->${children}<!$>`;
  }
}
