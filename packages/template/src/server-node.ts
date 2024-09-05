import { escape, isFunction, isObject, startsWith } from '@estjs/shared';
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
 * Converts a JSON object to a string of HTML attributes.
 * @param json - The JSON object to be converted.
 * @returns A string representing the HTML attributes.
 */
function convertJsonToAttributes(json: Record<string, any>): string {
  return Object.entries(json)
    .map(([key, value]) => `${key}=${JSON.stringify(escape(String(value)))}`)
    .join(' ');
}

/**
 * Class to render a template to a string based on provided props.
 * Inherits from Hooks to support lifecycle hooks.
 */
export class TemplateRenderer extends Hooks {
  constructor(
    private template: string[] | EssorNode | Function,
    private props: Props,
  ) {
    super();
  }

  /**
   * Renders the template to a string.
   * @returns The rendered template as a string.
   */
  render(): string {
    this.initRef(); // Initialize the Hooks reference before rendering

    let renderedString: string;
    try {
      // If the template is a function, invoke it with props and return the result
      if (isFunction(this.template)) {
        renderedString = this.template(this.props);
      } else {
        // Convert array-based templates to TemplateCollection format
        const templateCollection: TemplateCollection = Array.isArray(this.template)
          ? this.template.reduce((acc, tmpl, index) => {
              acc[index + 1] = { template: tmpl };
              return acc;
            }, {})
          : this.template;

        const childNodesMap: Record<string, EssorNode[]> = {};
        const processedTemplates: TemplateCollection = {};

        if (isObject(templateCollection)) {
          for (const [key, tmpl] of Object.entries(templateCollection)) {
            const prop = this.props[key];
            console.log(prop, this.props);

            if (prop) {
              // Remove event listeners (props starting with 'on') from the properties
              for (const propKey in prop) {
                if (startsWith(propKey, 'on') && isFunction(prop[propKey])) {
                  delete prop[propKey];
                }
              }

              // Handle child elements if present
              if (prop.children) {
                for (const [child, idx] of prop.children) {
                  if (!childNodesMap[idx]) childNodesMap[idx] = [];
                  childNodesMap[idx].push(child);
                }
                delete prop.children;
              }
            }

            // Store the processed template and associated props
            processedTemplates[key] = { template: tmpl.template, props: prop };
          }
        }

        // Render the final template as a string
        renderedString = Object.entries(processedTemplates)
          .map(([key, { template: tmpl, props: prop }]) => {
            let tmplString = tmpl;
            if (prop) {
              tmplString += ` ${convertJsonToAttributes(prop)}`;
            }
            if (childNodesMap[key]) {
              tmplString += childNodesMap[key].map(child => this.renderChild(child, prop)).join('');
            }

            return tmplString;
          })
          .join('');
      }
    } finally {
      this.removeRef(); // Ensure that Hooks reference is cleaned up after rendering
    }

    return renderedString;
  }

  /**
   * Helper method to render child nodes recursively.
   * @param child - The child node to render.
   * @param props - The properties to be passed to the child node.
   * @returns The rendered child node as a string.
   */
  private renderChild(child: EssorNode, props: Props): string {
    return new TemplateRenderer(child, props).render();
  }
}

/**
 * Renders a component to a string using the given properties.
 * @param component - The component function to be rendered.
 * @param props - The properties to be passed to the component.
 * @returns The rendered component as a string.
 */
export function renderToString(component: string[], props: Props): string {
  const renderer = new TemplateRenderer(component, props);
  return renderer.render();
}

/**
 * Renders a component to a string and sets it as the innerHTML of the specified root element.
 * @param component - The component function to be rendered.
 * @param root - The root element in which to render the component.
 * @param props - The properties to be passed to the component.
 */
export function renderSSG(component, root: HTMLElement, props: Props = {}): void {
  const renderer = new TemplateRenderer(component, props);
  root.innerHTML = renderer.render();
}
