import { isFunction, isObject, startsWith } from "@essor/shared";
import type { EssorNode } from '../types';

interface TemplateMap {
  [key: number]: {
    template: string;
    prop?: Record<string, any>;
  };
}

type Props = Record<string, any>;

/**
 * Converts a JSON object to a string of HTML attributes.
 * @param json - The JSON object.
 * @returns The string of HTML attributes.
 */
function jsonToAttrs(json: Record<string, any>): string {
  return Object.entries(json)
    .map(([key, value]) => `${key}=${JSON.stringify(escape(String(value)))}`)
    .join(' ');
}

export function renderTemplate(template: string[] | EssorNode | Function, props: Props): string {
  if (isFunction(template)) {
    return template(props);
  }

  const templates: TemplateMap = Array.isArray(template)
    ? template.reduce((acc, tmpl, index) => {
        acc[index + 1] = { template: tmpl };
        return acc;
      }, {})
    : template;

  const childrenMap: Record<string, EssorNode[]> = {};
  const newTemplate: TemplateMap = {};

  if (isObject(templates)) {
    for (const [key, tmpl] of Object.entries(templates)) {
      const prop = props[key];
      if (prop) {
        for (const propKey in prop) {
          if (startsWith(propKey, 'on') && isFunction(prop[propKey])) {
            delete prop[propKey];
          }
        }

        if (prop.children) {
          for (const [child, idx] of prop.children) {
            if (!childrenMap[idx]) childrenMap[idx] = [];
            childrenMap[idx].push(child);
          }
          delete prop.children;
        }
      }

      newTemplate[key] = { template: tmpl.template, prop };
    }
  }

  return Object.entries(newTemplate)
    .map(([key, { template: tmpl, prop }]) => {
      let str = tmpl;
      if (prop) {
        str += ` ${jsonToAttrs(prop)}`;
      }
      if (childrenMap[key]) {
        str += childrenMap[key].map(child => renderTemplate(child, prop)).join('');
      }

      return str;
    })
    .join('');
}

/**
 * Renders the component to a string.
 * @param component - The component function.
 * @param props - The properties to pass to the component.
 * @returns The rendered component as a string.
 */
export function renderToString(component: (...args: any[]) => string, props: Props): string {
  return renderTemplate(component, props);
}

export function ssgRender(component, root: HTMLElement, props: Props = {}): void {
  root.innerHTML = renderTemplate(component, props);
}
