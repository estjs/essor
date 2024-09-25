import { coerceArray, escape, isArray, isFunction, isObject } from '@estjs/shared';
import { isSignal } from '@estjs/signal';
import { LifecycleContext } from './lifecycle-context';
import type { EssorNode, Props } from '../types';

interface TemplateEntry {
  template: string;
  props?: Record<string, any>;
}

type TemplateCollection = Record<number, TemplateEntry>;

function normalizeProps(props: Props) {
  for (const [key, value] of Object.entries(props)) {
    if (isFunction(value)) {
      delete props[key];
    } else if (isSignal(value)) {
      props[key] = value.value;
    }
  }
}

function processChildren(
  prop: Props,
  key: string,
  tmp: TemplateEntry,
  childNodesMap: Record<string, EssorNode[]>,
) {
  if (prop.children) {
    prop.children.forEach(item => {
      const [child, path] = isArray(item) ? item : [item, null];
      if (isFunction(child)) {
        const result = child(prop);
        handleChildResult(result, prop, key, tmp, path, childNodesMap);
      } else {
        tmp.template += isSignal(child) ? child.value : String(child);
      }
    });
  }
}

function handleChildResult(
  result: any,
  prop: Props,
  key: string,
  tmp: TemplateEntry,
  path: string | null,
  childNodesMap: Record<string, EssorNode[]>,
) {
  if (isSignal(result)) {
    tmp.template += result.value;
  } else if (result instanceof SSGNode) {
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
    tmp.template += isFunction(result) ? result(prop) : String(result);
  }
}

function generateAttributes(props: Props): string {
  return Object.entries(props)
    .filter(([key, value]) => key !== 'children' && !isFunction(value))
    .map(([key, value]) => `${key}="${escape(String(value))}"`)
    .join(' ');
}

export class SSGNode extends LifecycleContext {
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
    const templateCollection: TemplateCollection = isArray(this.template)
      ? this.template.reduce((acc, tmp, index) => {
          acc[index + 1] = { template: tmp };
          return acc;
        }, {} as TemplateCollection)
      : (this.template as unknown as TemplateCollection);

    if (isObject(templateCollection)) {
      Object.entries(templateCollection).forEach(([key, tmp]) => {
        const prop = { ...this.props[key] };
        normalizeProps(prop);
        processChildren(prop, key, tmp, this.childNodesMap);
        this.processedTemplates[key] = {
          template: tmp.template,
          props: prop,
        };
      });
    }
  }

  render(): string {
    if (isFunction(this.template)) {
      const root = this.template(this.props);
      return root instanceof SSGNode ? root.mount() : String(root);
    }

    if (this.template instanceof SSGNode) {
      return this.template.mount();
    }

    this.initTemplates();

    return Object.entries(this.processedTemplates)
      .map(([key, { template, props }]) => {
        let content = template;
        if (props && Object.keys(props).length > 0) {
          const attr = generateAttributes(props);
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
}
