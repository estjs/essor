import { coerceArray, escape, isArray, isFunction, isObject } from '@estjs/shared';
import { isSignal } from '@estjs/signal';
import { LifecycleContext } from './lifecycle-context';
import { extractSignal } from './utils';
import type { EssorNode, Props } from '../types';

interface TemplateEntry {
  template: string;
  props?: Record<string, unknown>;
}

type TemplateCollection = Record<number, TemplateEntry>;

function isSSGNode(node: unknown): node is SSGNode {
  return node instanceof SSGNode;
}

export class SSGNode extends LifecycleContext {
  private childNodesMap: Record<string, EssorNode[]> = {};
  private processedTemplates: TemplateCollection = {};

  constructor(
    private template: string[] | SSGNode | ((props: Props) => SSGNode),
    private props: Props = {},
    public key?: string,
  ) {
    super();
  }

  /**
   * Mounts the current SSGNode instance and returns its rendered template.
   * @returns The rendered template as a string
   */
  mount(): string {
    this.initRef();
    const output = this.render();
    this.removeRef();
    return output;
  }

  /**
   * Initializes the templates by normalizing props and processing children.
   */
  private initTemplates(): void {
    /**
     * transform template collection,object key corresponds to the key of the props.
     *
     * ["<div>","<span>","</span>","</div>"]
     *
     * to
     *
     * {1:{template:"<div>"}, 2:{template:"<span>"}, 3:{template:"</span>"}, 4:{template:"</div>"}}
     *
     */
    const templateCollection: TemplateCollection = isArray(this.template)
      ? this.template.reduce((acc, tmp, index) => {
          acc[index + 1] = { template: tmp };
          return acc;
        }, {})
      : this.template;

    // must be object
    if (isObject(templateCollection)) {
      Object.entries(templateCollection).forEach(([key, tmp]) => {
        // get props
        const prop = { ...this.props[key] } as Props;
        // delete function prop,get signal value
        normalizeProps(prop);
        // get children
        processChildren(prop, key, tmp, this.childNodesMap);
        // set template
        this.processedTemplates[key] = {
          template: tmp.template,
          props: prop,
        };
      });
    }
  }

  /**
   * Renders the current SSGNode instance into a string.
   * @returns The rendered HTML as a string
   */
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

    return Object.entries(this.processedTemplates)
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
        if (this.childNodesMap[key] && content.includes('<!>')) {
          content = content.replace('<!>', this.renderChildren(this.childNodesMap[key]));
        }

        return content;
      })
      .join('');
  }

  /**
   * Renders the children nodes into a string.
   * @param children - The children nodes to render
   * @returns The rendered children as a string
   */
  private renderChildren(children: EssorNode[]): string {
    return coerceArray(children).map(String).join('');
  }
}
/**
 * Normalizes props by removing function-type properties
 * and resolving signal values.
 * @param props - The properties object to normalize
 */
function normalizeProps(props: Props): void {
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

/**
 * Processes the children of a prop, handling functions or signals as children,
 * and adds them to the template string or child node map.
 * @param prop - The prop object containing children
 * @param key - The key corresponding to the current template entry
 * @param tmp - The template entry being processed
 * @param childNodesMap - A map that stores processed child nodes
 */
function processChildren(
  prop: Props,
  key: string,
  tmp: TemplateEntry,
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
        tmp.template += extractSignal(childNode);
      }
    });
  }
}

/**
 * Handles the result of child nodes by updating the template or adding to the child node map.
 * @param result - The result from processing a child node
 * @param prop - The current props being processed
 * @param key - The key corresponding to the current template
 * @param tmp - The template entry being processed
 * @param path - The path for nested child nodes (if any)
 * @param childNodesMap - Map for storing child nodes
 */
function handleChildResult(
  result: unknown,
  prop: Props,
  key: string,
  tmp: TemplateEntry,
  path: string | null,
  childNodesMap: Record<string, EssorNode[]>,
): void {
  if (isSignal(result)) {
    tmp.template += result.value;
  } else if (isSSGNode(result)) {
    const mapKey = path ?? key;
    childNodesMap[mapKey] = childNodesMap[mapKey] || [];
    const childResult = result.mount();
    const resolvedResult = isFunction(childResult) ? childResult(prop) : extractSignal(childResult);
    childNodesMap[mapKey].push(resolvedResult as EssorNode);
  } else {
    tmp.template += isFunction(result) ? result(prop) : String(result);
  }
}

/**
 * Generates a string of HTML attributes from a props object.
 * @param props - The props object to generate attributes from
 * @returns A string of HTML attributes
 */
function generateAttributes(props: Props): string {
  return Object.entries(props)
    .filter(([key, value]) => key !== 'children' && !isFunction(value))
    .map(([key, value]) => `${key}="${escape(String(value))}"`)
    .join(' ');
}
