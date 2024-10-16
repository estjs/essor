import { escape, isArray, isFunction } from '@estjs/shared';
import { isSignal } from '@estjs/signal';
import { LifecycleContext } from './lifecycle-context';
import { extractSignal } from './utils';
import { ComponentType, PLACEHOLDER, enterComponent } from './shared-config';
import type { Signal } from '@estjs/signal/*';
import type { EssorNode, Props } from '../types';

// Type guard to check if a node is an SSGNode
export function isSSGNode(node: unknown): node is SSGNode {
  return node instanceof SSGNode;
}

// Global counter for component indexing
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

  // Process the template and return an array of processed strings
  private processTemplate(): string[] {
    if (isArray(this.template)) {
      const htmlString = this.template.join(PLACEHOLDER);
      const processedString = this.processHtmlString(htmlString);
      return processedString.split(PLACEHOLDER);
    }
    return [];
  }

  // Process HTML string by adding component index and handling text nodes
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

  // Mount the SSGNode and return the rendered string
  mount(): string {
    this.initRef();
    const output = this.render();
    this.removeRef();
    return output;
  }

  // Render the SSGNode
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

  // Render the template by processing props and children
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

  // Normalize props by removing children and handling signals
  private normalizeProps(props: Props): void {
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

  // Generate HTML attributes string from props
  private generateAttributes(props: Props): string {
    return Object.entries(props)
      .filter(([key, value]) => key !== 'children' && !isFunction(value))
      .map(([key, value]) => `${key}="${escape(String(value))}"`)
      .join(' ');
  }

  // Render children and append them to the template
  private renderChildren(children: any[], findIndex: number): void {
    children.forEach(([child]) => {
      componentIndex++;
      const renderedChild = this.renderChild(child);
      this.templates[findIndex] += renderedChild;
    });
  }

  // Render a single child node
  private renderChild(child: EssorNode | Function | Signal<unknown>): string {
    if (isFunction(child)) {
      return this.renderChild(child(this.props));
    } else if (isSignal(child)) {
      return `<!--${ComponentType.TEXT_COMPONENT}-${componentIndex}-->${(child as Signal<any>).value}<!$>`;
    } else if (isSSGNode(child)) {
      const childResult = (child as SSGNode).mount();
      return isFunction(childResult) ? childResult(this.props) : extractSignal(childResult);
    } else {
      return `<!--${ComponentType.TEXT_COMPONENT}-${componentIndex}-->${child}<!$>`;
    }
  }
}
