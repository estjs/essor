import { coerceArray, escape, isArray, isFunction, isObject } from '@estjs/shared';
import { isSignal } from '@estjs/signal';
import { Hooks } from './component-node';
import type { EssorNode } from '../types';



const sharedConfig:any= {

}

interface TemplateEntry {
  template: string;
  props?: Record<string, any>;
}

interface TemplateCollection {
  [key: number]: TemplateEntry;
}

type Props = Record<string, any>;

function convertJsonToAttributes(json: Record<string, any>): string {
  return Object.entries(json)
    .map(([key, value]) => {
      if (key === 'children' || isFunction(value)) {
        return '';
      }
      return `${key}=${JSON.stringify(escape(String(value)))}`;
    })
    .join(' ');
}

export class ServerNode extends Hooks {
  constructor(
    private template: string[] | EssorNode | Function,
    private props: Props = {},
  ) {
    super();
    this.initTemplate();
  }

  // eslint-disable-next-line unused-imports/no-unused-vars
  mount(parent?, before?) {
    this.initRef();
    const renterNodes = this.render();
    this.removeRef();

    return renterNodes;
  }
  childNodesMap: Record<string, EssorNode[]> = {};
  processedTemplates: TemplateCollection = {};
  initTemplate() {
    const templateCollection: TemplateCollection = Array.isArray(this.template)
      ? this.template.reduce((acc, tmpl, index) => {
          acc[index + 1] = { template: tmpl };
          return acc;
        }, {})
      : this.template;

    if (isObject(templateCollection)) {
      for (const [key, tmpl] of Object.entries(templateCollection)) {
        const prop = this.props[key];

        if (prop) {
          for (const propKey in prop) {
            if (isFunction(prop[propKey])) {
              delete prop[propKey];
            }
            if (isSignal(prop[propKey])) {
              prop[propKey] = prop[propKey].value;
            }
          }

          if (prop.children) {
            this.processChildren(key, prop.children);
          }
        }

        this.processedTemplates[key] = {
          template: tmpl.template,
          props: { ...prop },
        };
      }
    }
  }

  processChildren(key: string, children: any) {
    if (!isArray(children)) {
      this.addChildToMap(key, children);
    } else {
      children.filter(Boolean).forEach((item, index) => {
        const [child, path] = isArray(item) ? item : [item, null];
        const mapKey = path ? String(path) : `${key}:${index}`;
        this.addChildToMap(mapKey, child);
      });
    }
  }

  addChildToMap(key: string, child: any) {
    if (!this.childNodesMap[key]) this.childNodesMap[key] = [];
    this.childNodesMap[key].push(child);
  }

  render(): string {
    if (isFunction(this.template)) {
      const root = this.template(this.props);
      if (root instanceof ServerNode) {
        return root.mount();
      } else {
        return root;
      }
    }

    return Object.entries(this.processedTemplates)
      .map(([key, { template: tmpl, props: prop }]) => {
        let renderedString = tmpl;
        if (prop) {
          renderedString += ` ${convertJsonToAttributes(prop)}`;
        }
        if (this.childNodesMap[key]) {
          renderedString += this.renderChildren(this.childNodesMap[key], prop);
        }

        return renderedString;
      })
      .join('');
  }

  renderChildren(children: any[], props: Props): string {
    return coerceArray(children)
      .map(child => this.renderChild(child, props))
      .join('');
  }

  private renderChild(child: any, props: Props): string {
    if (isFunction(child)) {
      return this.renderChild(child(props), props);
    }
    return new ServerNode(child, props).mount();
  }
}

export function renderToString(component: any, props?: Props): string {
  const renderer = new ServerNode(component, props || {});
  const html = renderer.mount();
  return html;
}
