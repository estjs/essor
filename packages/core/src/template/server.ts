import { isFunction, isObject, startsWith } from '@estjs/shared';
import type { EssorNode } from '../../types';

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
 * Renders a template to a string based on provided props.
 * Handles both function-based and object-based templates.
 * @param template - The template to render, which can be an array, an object, or a function.
 * @param props - The properties used for rendering the template.
 * @returns The rendered template as a string.
 */
export function renderTemplate(template: string[] | EssorNode | Function, props: Props): string {
  // If the template is a function, invoke it with props and return the result
  if (isFunction(template)) {
    return template(props);
  }

  // Convert array-based templates to TemplateCollection format
  const templateCollection: TemplateCollection = Array.isArray(template)
    ? template.reduce((acc, tmpl, index) => {
        acc[index + 1] = { template: tmpl };
        return acc;
      }, {})
    : template;

  const childNodesMap: Record<string, EssorNode[]> = {};
  const processedTemplates: TemplateCollection = {};

  if (isObject(templateCollection)) {
    for (const [key, tmpl] of Object.entries(templateCollection)) {
      const prop = props[key];
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
  return Object.entries(processedTemplates)
    .map(([key, { template: tmpl, props: prop }]) => {
      let renderedString = tmpl;
      if (prop) {
        renderedString += ` ${convertJsonToAttributes(prop)}`;
      }
      if (childNodesMap[key]) {
        renderedString += childNodesMap[key].map(child => renderTemplate(child, prop)).join('');
      }

      return renderedString;
    })
    .join('');
}

/**
 * Renders a component to a string using the given properties.
 * @param component - The component function to be rendered.
 * @param props - The properties to be passed to the component.
 * @returns The rendered component as a string.
 */
export function renderToString(component: (...args: any[]) => string, props: Props): string {
  return renderTemplate(component, props);
}

/**
 * Renders a component to a string and sets it as the innerHTML of the specified root element.
 * @param component - The component function to be rendered.
 * @param root - The root element in which to render the component.
 * @param props - The properties to be passed to the component.
 */
export function renderSSG(component, root: HTMLElement, props: Props = {}): void {
  root.innerHTML = renderTemplate(component, props);
}
