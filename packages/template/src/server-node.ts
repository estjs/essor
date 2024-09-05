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

function convertJsonToAttributes(json: Record<string, any>): string {
  return Object.entries(json)
    .map(([key, value]) => `${key}=${JSON.stringify(escape(String(value)))}`)
    .join(' ');
}

export class ServerNode extends Hooks {
  constructor(
    private template: string[] | EssorNode | Function,
    private props: Props,
    public key?: string,
  ) {
    super();
  }

  // eslint-disable-next-line unused-imports/no-unused-vars
  mount(parent?, before?) {
    this.initRef();
    const renterNodes = this.render();
    this.removeRef();
    return renterNodes;
  }

  render(): string {
    let renderedString: string;
    if (isFunction(this.template)) {
      renderedString = this.template(this.props);
    } else {
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

          if (prop) {
            // 移除事件监听器，同时记录到 data-event 中
            let eventAttributes = '';
            for (const propKey in prop) {
              if (startsWith(propKey, 'on') && isFunction(prop[propKey])) {
                eventAttributes += ` data-event-${propKey}="${propKey}"`;
                // 不删除事件监听器，保留以便记录到 data-event 属性中
              }
            }

            // 如果有子元素
            if (prop.children) {
              for (const [child, idx] of prop.children) {
                if (!childNodesMap[idx]) childNodesMap[idx] = [];
                childNodesMap[idx].push(child);
              }
              delete prop.children;
            }

            // 处理模板和属性
            processedTemplates[key] = {
              template: tmpl.template,
              props: { ...prop, eventAttributes },
            };
          }
        }
      }

      // 生成最终模板字符串
      renderedString = Object.entries(processedTemplates)
        .map(([key, { template: tmpl, props: prop }]) => {
          let tmplString = tmpl;
          if (prop) {
            tmplString += ` ${convertJsonToAttributes(prop)}${prop.eventAttributes || ''}`;
          }
          if (childNodesMap[key]) {
            tmplString += childNodesMap[key].map(child => this.renderChild(child, prop)).join('');
          }

          return tmplString;
        })
        .join('');
    }
    return renderedString;
  }

  private renderChild(child: EssorNode, props: Props): string {
    return new ServerNode(child, props).mount();
  }
}
