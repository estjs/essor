import { isPlainObject } from '@estjs/shared';
import { kebabCase } from 'lodash';

interface AttributeOperation {
  element: HTMLElement;
  attr: string;
  value: unknown;
  oldValue?: unknown;
}

export class AttributeManager {
  private static instance: AttributeManager;
  private pendingUpdates = new Map<HTMLElement, Map<string, AttributeOperation>>();
  private updateScheduled = false;

  static getInstance(): AttributeManager {
    if (!AttributeManager.instance) {
      AttributeManager.instance = new AttributeManager();
    }
    return AttributeManager.instance;
  }

  scheduleUpdate(operation: AttributeOperation): void {
    let elementUpdates = this.pendingUpdates.get(operation.element);
    if (!elementUpdates) {
      elementUpdates = new Map();
      this.pendingUpdates.set(operation.element, elementUpdates);
    }
    elementUpdates.set(operation.attr, operation);

    if (!this.updateScheduled) {
      this.updateScheduled = true;
      queueMicrotask(() => this.processUpdates());
    }
  }

  private processUpdates(): void {
    try {
      this.pendingUpdates.forEach(updates => {
        updates.forEach(operation => {
          if (this.shouldUpdate(operation)) {
            this.applyAttribute(operation);
          }
        });
      });
    } finally {
      this.pendingUpdates.clear();
      this.updateScheduled = false;
    }
  }

  private shouldUpdate(operation: AttributeOperation): boolean {
    const { attr, value, oldValue } = operation;
    // skip updates with the same value
    if (oldValue === value) return false;

    if (attr === 'style' && isPlainObject(value) && isPlainObject(oldValue)) {
      return JSON.stringify(value) !== JSON.stringify(oldValue);
    }

    return true;
  }

  private applyAttribute(operation: AttributeOperation): void {
    const { element, attr, value } = operation;

    if (attr === 'class') {
      this.applyClassAttribute(element, value);
    } else if (attr === 'style') {
      this.applyStyleAttribute(element, value);
    } else {
      this.applyGenericAttribute(element, attr, value);
    }
  }

  private applyClassAttribute(element: HTMLElement, value: unknown): void {
    if (typeof value === 'string') {
      element.className = value;
    } else if (Array.isArray(value)) {
      element.className = value.join(' ');
    } else if (value && typeof value === 'object') {
      element.className = Object.entries(value)
        .reduce((classes, [className, isActive]) => classes + (isActive ? ` ${className}` : ''), '')
        .trim();
    }
  }

  private applyStyleAttribute(element: HTMLElement, value: unknown): void {
    if (typeof value === 'string') {
      element.style.cssText = value;
    } else if (value && typeof value === 'object') {
      Object.entries(value as Record<string, unknown>).forEach(([property, propertyValue]) => {
        element.style.setProperty(kebabCase(property), String(propertyValue));
      });
    }
  }

  private applyGenericAttribute(element: HTMLElement, attr: string, value: unknown): void {
    if (!value) {
      element.removeAttribute(attr);
    } else if (value === true) {
      element.setAttribute(attr, '');
    } else {
      if (element instanceof HTMLInputElement && attr === 'value') {
        element.value = String(value);
      } else {
        element.setAttribute(attr, String(value));
      }
    }
  }
}

export const attributeManager = AttributeManager.getInstance();
