import { isFunction, isObject } from 'essor-shared';
import type { EssorNode } from '../../types';

interface TemplateMap {
  [key: number]: {
    template: string;
    prop?: Record<string, any>;
  };
}

type Props = Record<string, any>;

export function ssrtmpl(templates: string[] = []): TemplateMap {
  return templates.reduce((acc, template, index) => {
    acc[index + 1] = { template };
    return acc;
  }, {} as TemplateMap);
}

function jsonToAttrs(json: Record<string, any>): string {
  return Object.entries(json)
    .map(([key, value]) => `${key}="${JSON.stringify(value)}"`)
    .join(' ');
}

export function ssr(
  template: TemplateMap | EssorNode | ((props: Props) => string),
  props: Props,
): string {
  if (isFunction(template)) {
    return template(props);
  }

  const childrenMap: Record<string, EssorNode[]> = {};

  if (isObject(template)) {
    Object.entries(template).forEach(([key, tmpl]) => {
      const prop = props[key];
      if (!prop) return;

      Object.keys(prop).forEach(propKey => {
        if (propKey.startsWith('on') && isFunction(prop[propKey])) {
          delete prop[propKey];
        }
      });

      if (prop.children) {
        prop.children.forEach(([child, idx]: [any, number]) => {
          childrenMap[idx] = [...(childrenMap[idx] || []), child];
        });
        delete prop.children;
      }

      template[key] = { template: tmpl, prop };
    });
  }
  console.log({ template });

  return Object.entries(template)
    .map(([key, { template: tmpl, prop }]) => {
      let str = tmpl;
      if (prop) {
        str += ` ${jsonToAttrs(prop)}`;
        console.log(str);
      }
      if (childrenMap[key]) {
        str += childrenMap[key].map(child => ssr(child, prop)).join('');
      }

      return str;
    })
    .join('');
}

export function renderToString(component: (...args: any[]) => string, props: Props): string {
  return ssr(component, props);
}

export function hydrate(
  component: { mount: (root: HTMLElement) => void },
  root: HTMLElement,
): void {
  root.innerHTML = '';
  component.mount(root);
}
