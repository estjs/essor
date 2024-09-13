import { coerceArray, escape, isArray, isFunction, isObject } from '@estjs/shared';
import { isSignal } from '@estjs/signal';
import { Hooks } from './component-node';
import type { EssorNode } from '../types';

interface TemplateEntry {
  template: string;
  props?: Record<string, any>;
}

interface TemplateCollection {
  [key: number]: TemplateEntry;
}

type Props = Record<string, any>;

/**
 * Convert properties into HTML attributes string
 * Exclude 'children' and function values
 */
function generateAttributes(props: Props): string {
  return Object.entries(props)
    .map(([key, value]) => {
      if (key === 'children' || isFunction(value)) return '';
      return `${key}="${escape(String(value))}"`;
    })
    .filter(Boolean)
    .join(' ');
}

/**
 * Handle signal and function values from props
 */
function normalizeProps(props: Props) {
  Object.keys(props).forEach(propKey => {
    if (isFunction(props[propKey])) {
      delete props[propKey]; // Remove functions from props
    }
    if (isSignal(props[propKey])) {
      props[propKey] = props[propKey].value; // Resolve signals to values
    }
  });
}

/**
 * Process the result of rendering child nodes
 */
function handleChildResult(
  result: any,
  prop: Props,
  key: string,
  tmpl: TemplateEntry,
  childNodesMap: Record<string, EssorNode[]>,
  path?: string,
) {
  if (isSignal(result)) {
    tmpl.template += result.value;
  } else if (result instanceof ServerNode) {
    const mapKey = path ? String(path) : `${key}`;
    if (!childNodesMap[mapKey]) childNodesMap[mapKey] = [];
    const childResult = result.mount();

    childNodesMap[mapKey].push(
      isFunction(childResult)
        ? childResult(prop)
        : isSignal(childResult)
          ? childResult.value
          : childResult,
    );
  } else {
    tmpl.template += isFunction(result) ? result(prop) : String(result);
  }
}

export class ServerNode extends Hooks {
  private childNodesMap: Record<string, EssorNode[]> = {};
  private processedTemplates: TemplateCollection = {};

  constructor(
    private template: string[] | EssorNode | Function,
    private props: Props = {},
    public key?: string,
  ) {
    super();
  }

  /**
   * Mount and render the component
   */
  mount(): string {
    this.initRef();
    const output = this.render();
    this.removeRef();
    return output;
  }

  /**
   * Initialize template entries and props
   */
  private initTemplates() {
    const templateCollection: TemplateCollection = Array.isArray(this.template)
      ? this.template.reduce((acc, tmpl, index) => {
          acc[index + 1] = { template: tmpl };
          return acc;
        }, {})
      : this.template;

    if (isObject(templateCollection)) {
      Object.entries(templateCollection).forEach(([key, tmpl]) => {
        const prop = { ...this.props[key] };

        // Normalize props (resolve signals and remove functions)
        normalizeProps(prop);

        // Handle child nodes
        if (prop.children) {
          prop.children.forEach(item => {
            const [child, path] = isArray(item) ? item : [item, null];

            if (isFunction(child)) {
              const result = child(prop); // Pass props to child component
              handleChildResult(result, prop, key, tmpl, this.childNodesMap, path);
            } else {
              tmpl.template += isSignal(child) ? child.value : String(child);
            }
          });
        }

        // Store processed template and props
        this.processedTemplates[key] = {
          template: tmpl.template,
          props: prop,
        };
      });
    }
  }

  /**
   * Render component and its children into a string
   */
  render(): string {
    if (isFunction(this.template)) {
      const root = this.template(this.props);
      return root instanceof ServerNode ? root.mount() : String(root);
    }

    if (this.template instanceof ServerNode) {
      return this.template.mount();
    }

    this.initTemplates();

    return Object.entries(this.processedTemplates)
      .map(([key, { template, props }]) => {
        let content = template;
        if (props && Object.keys(props).length > 0) {
          content += ` ${generateAttributes(props)}`;
        }

        // Replace placeholder with child nodes' rendered content
        if (this.childNodesMap[key]) {
          content = content.replace('<!>', this.renderChildren(this.childNodesMap[key]));
        }

        return content;
      })
      .join('');
  }

  /**
   * Render child nodes into a string
   */
  private renderChildren(children: any[]): string {
    return coerceArray(children).map(String).join('');
  }
}

type ServerNodeType = (props: Props) => ServerNode;
/**
 * Create ServerNode for server-side generation (SSG)
 */
export function ssg(component: string[] | ServerNodeType, props?: Props) {
  return new ServerNode(component, props);
}

/**
 * Render a component to string for SSR
 */
export function renderToString(component: any, props?: Props): string {
  return ssg(component, props).mount();
}
