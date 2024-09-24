import { coerceArray, escape, isArray, isFunction, isObject } from '@estjs/shared';
import { isSignal } from '@estjs/signal';
import { HooksManager } from './hooks';
import type { EssorNode, Props } from '../../types';

interface TemplateEntry {
  template: string;
  props?: Record<string, any>;
}

type TemplateCollection = Record<number, TemplateEntry>;

export class SSGRender extends HooksManager {
  private childNodesMap: Record<string, EssorNode[]> = {};
  private processedTemplates: TemplateCollection = {};

  constructor(
    private template: string[] | EssorNode | Function,
    private props: Props = {},
    public key?: string,
  ) {
    super();
  }

  mount(): string {
    this.initRef();
    const output = this.render();
    this.removeRef();
    return output;
  }

  private initTemplates() {
    const templateCollection: TemplateCollection = Array.isArray(this.template)
      ? this.template.reduce((acc, tmp, index) => {
          acc[index + 1] = { template: tmp };
          return acc;
        }, {} as TemplateCollection)
      : (this.template as unknown as TemplateCollection);

    if (isObject(templateCollection)) {
      Object.entries(templateCollection).forEach(([key, tmp]) => {
        const prop = { ...this.props[key] };
        this.normalizeProps(prop);
        this.processChildren(prop, key, tmp);
        this.processedTemplates[key] = {
          template: tmp.template,
          props: prop,
        };
      });
    }
  }

  private normalizeProps(props: Props) {
    for (const [key, value] of Object.entries(props)) {
      if (isFunction(value)) {
        delete props[key];
      } else if (isSignal(value)) {
        props[key] = value.value;
      }
    }
  }

  private processChildren(prop: Props, key: string, tmp: TemplateEntry) {
    if (prop.children) {
      prop.children.forEach(item => {
        const [child, path] = isArray(item) ? item : [item, null];
        if (isFunction(child)) {
          const result = child(prop);
          this.handleChildResult(result, prop, key, tmp, path);
        } else {
          tmp.template += isSignal(child) ? child.value : String(child);
        }
      });
    }
  }

  private handleChildResult(
    result: any,
    prop: Props,
    key: string,
    tmp: TemplateEntry,
    path?: string,
  ) {
    if (isSignal(result)) {
      tmp.template += result.value;
    } else if (result instanceof SSGRender) {
      const mapKey = path ? String(path) : `${key}`;
      if (!this.childNodesMap[mapKey]) this.childNodesMap[mapKey] = [];
      const childResult = result.mount();
      this.childNodesMap[mapKey].push(
        isFunction(childResult)
          ? childResult(prop)
          : isSignal(childResult)
            ? childResult.value
            : childResult,
      );
    } else {
      tmp.template += isFunction(result) ? result(prop) : String(result);
    }
  }

  render(): string {
    if (isFunction(this.template)) {
      const root = this.template(this.props);
      return root instanceof SSGRender ? root.mount() : String(root);
    }

    if (this.template instanceof SSGRender) {
      return this.template.mount();
    }

    this.initTemplates();

    return Object.entries(this.processedTemplates)
      .map(([key, { template, props }]) => {
        let content = template;
        if (props && Object.keys(props).length > 0) {
          const attr = this.generateAttributes(props);
          if (attr) {
            content += ` ${attr}`;
          }
        }

        if (this.childNodesMap[key]) {
          content = content.replace('<!>', this.renderChildren(this.childNodesMap[key]));
        }

        return content;
      })
      .join('');
  }

  private renderChildren(children: any[]): string {
    return coerceArray(children).map(String).join('');
  }

  private generateAttributes(props: Props): string {
    return Object.entries(props)
      .filter(([key, value]) => key !== 'children' && !isFunction(value))
      .map(([key, value]) => `${key}="${escape(String(value))}"`)
      .join(' ');
  }
}
