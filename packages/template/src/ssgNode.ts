import { escapeHTML, isArray, isFunction } from '@estjs/shared';
import { isSignal } from '@estjs/signal';
import { LifecycleContext } from './lifecycleContext';
import { extractSignal } from './utils';
import { CHILDREN_PROP, ComponentType, PLACEHOLDER, enterComponent } from './sharedConfig';
import type { Signal } from '@estjs/signal';
import type { Props, estNode } from '../types';

export function isSSGNode(node: unknown): node is SSGNode {
  return node instanceof SSGNode;
}

let componentIndex = 1;

export class SSGNode extends LifecycleContext {
  private templates: string[];

  constructor(
    private template: string[] | SSGNode | ((props: Props) => SSGNode),
    private props: Props = {},
    public key?: string,
  ) {
    super();
    enterComponent(template, componentIndex);
    this.templates = this.processTemplate();
  }

  private processTemplate(): string[] {
    if (isArray(this.template)) {
      const htmlString = this.template.join(PLACEHOLDER);
      const processedString = this.processHtmlString(htmlString);
      return processedString.split(PLACEHOLDER);
    }
    return [];
  }

  private processHtmlString(htmlString: string): string {
    return htmlString.replaceAll(/(<[^>]+>)|([^<]+)/g, (match, p1, p2) => {
      if (p1) {
        if (p1.includes('data-ci')) return match;
        return p1.replace(/<\s*([\da-z]+)(\s[^>]*)?>/i, (_, tagName, attrs) => {
          return `<${tagName} data-ci="${componentIndex}"${attrs || ''}>`;
        });
      } else if (p2 && p2.replace(PLACEHOLDER, '').trim()) {
        return `<!--${ComponentType.TEXT}-${componentIndex}-->${p2}<!$>`;
      }
      return match;
    });
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
    return this.renderTemplate();
  }

  private renderTemplate(): string {
    Object.entries(this.props).forEach(([key, cur]) => {
      const children = cur.children;
      this.normalizeProps(cur);
      const findIndex = this.templates.findIndex(t => t.includes(`data-hk="${key}"`));

      if (children) {
        this.renderChildren(children, findIndex);
      }
      this.templates[findIndex] = this.templates[findIndex].replace(
        `data-hk="${key}"`,
        `data-hk="${key}" ${this.generateAttributes(cur)}`,
      );
    });

    return this.templates.join('');
  }

  private normalizeProps(props: Props): void {
    Object.entries(props).forEach(([key, value]) => {
      if (key === CHILDREN_PROP) {
        delete props[key];
      } else if (isFunction(value)) {
        delete props[key];
      } else if (isSignal(value)) {
        props[key] = value.value;
      }
    });
  }

  private generateAttributes(props: Props): string {
    return Object.entries(props)
      .filter(([key, value]) => key !== CHILDREN_PROP && !isFunction(value))
      .map(([key, value]) => `${key}="${escapeHTML(String(value))}"`)
      .join(' ');
  }

  private renderChildren(children: any[], findIndex: number): void {
    children.forEach(([child]) => {
      componentIndex++;
      const renderedChild = this.renderChild(child);
      this.templates[findIndex] += renderedChild;
    });
  }

  private renderChild(child: estNode | Function | Signal<unknown>): string {
    if (isSignal(child)) {
      return `<!--${ComponentType.TEXT_COMPONENT}-${componentIndex}-->${(child as Signal<any>).value}<!$>`;
    } else if (isFunction(child)) {
      return this.renderChild(child(this.props));
    } else if (isSSGNode(child)) {
      const childResult = (child as SSGNode).mount();
      return isFunction(childResult) ? childResult(this.props) : extractSignal(childResult);
    } else {
      return `<!--${ComponentType.TEXT_COMPONENT}-${componentIndex}-->${child}<!$>`;
    }
  }
}
