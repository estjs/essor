//@ts-nocheck
import { HTMLParser } from './html-parser';
class Element {
  type: string;
  data?: string; // For text nodes
  children: DomElement[] = [];
  attributes: Record<string, string> = {};
  eventListeners: Record<string, Function[]> = {};
  parentNode: Element | null = null;

  constructor(type: string, data?: string) {
    this.type = type;
    this.data = data;
  }

  // Add event listener
  addEventListener(event: string, listener: Function) {
    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }
    this.eventListeners[event].push(listener);
  }

  // Remove event listener
  removeEventListener(event: string, listener: Function) {
    if (this.eventListeners[event]) {
      this.eventListeners[event] = this.eventListeners[event].filter(l => l !== listener);
    }
  }

  // Clone the node
  cloneNode(deep: boolean = false): Element {
    const cloned = new Element(this.type);
    cloned.attributes = { ...this.attributes };
    if (deep) {
      cloned.children = this.children.map(child => ({ ...child }));
    }
    return cloned;
  }

  get content() {
    return this;
  }

  get childNodes() {
    return this.children;
  }

  // Return innerHTML string
  get innerHTML(): string {
    if (this.type === 'text') {
      return this.data || '';
    }

    const attributes = Object.entries(this.attributes || {})
      .map(([key, value]) => `${key}="${value}"`)
      .join(' ');

    const childrenHTML = (this.children || []).map(child => this.getInnerHTML(child)).join('');

    return `<${this.name}${attributes ? ` ${attributes}` : ''}>${childrenHTML}</${this.name}>`;
  }

  // Set innerHTML
  set innerHTML(html: string) {
    const dom = HTMLParser(html);
    console.log(dom);

    this.children = dom;
  }

  // Append child nodes
  append(...nodes: Element[]): void {
    nodes.forEach(node => {
      node.parentNode = this;
      this.children.push(node);
    });
  }

  // Get/Set textContent
  get textContent(): string {
    if (this.type === 'text') {
      return this.data || '';
    }
    return this.children.map(child => child.textContent).join('');
  }

  set textContent(text: string) {
    this.children = [new Element('text', text)];
  }

  // Get the first child
  get firstChild(): Element | null {
    return this.children[0] || null;
  }

  // Get next sibling
  get nextSibling(): Element | null {
    if (!this.parentNode) return null;
    const siblings = this.parentNode.children;
    const index = siblings.indexOf(this);
    return siblings[index + 1] || null;
  }

  // Remove current node from parent
  remove(): void {
    if (this.parentNode) {
      const index = this.parentNode.children.indexOf(this);
      if (index > -1) {
        this.parentNode.children.splice(index, 1);
      }
    }
  }

  // Insert a node before this element
  before(newNode: Element): void {
    if (this.parentNode) {
      const index = this.parentNode.children.indexOf(this);
      if (index > -1) {
        newNode.parentNode = this.parentNode;
        this.parentNode.children.splice(index, 0, newNode);
      }
    }
  }

  // Get/Set className
  get className(): string {
    return this.attributes.class || '';
  }

  set className(value: string) {
    this.attributes.class = value;
  }
}

class Range {
  startContainer: Element | null = null;
  endContainer: Element | null = null;
  collapsed: boolean = true;

  setStartBefore(node: Element): void {
    this.startContainer = node.parentNode;
  }

  setEndBefore(node: Element): void {
    this.endContainer = node.parentNode;
    this.collapsed = false;
  }

  setEndAfter(node: Element): void {
    this.endContainer = node;
    this.collapsed = false;
  }

  deleteContents(): void {
    if (this.startContainer && this.endContainer) {
      this.startContainer.children = [];
      this.endContainer.children = [];
    }
  }
}

export const mockDocument = {
  createElement(type: string): Element {
    return new Element(type);
  },

  createTextNode(text: string): Element {
    return new Element('text', text);
  },

  createComment(data: string): Element {
    return new Element('comment', data);
  },

  createRange(): Range {
    return new Range();
  },
};

export class MockNode {
  ELEMENT_NODE = 1;
  ATTRIBUTE_NODE = 2;
  TEXT_NODE = 3;
  CDATA_SECTION_NODE = 4;
  PROCESSING_INSTRUCTION_NODE = 7;
  COMMENT_NODE = 8;
  DOCUMENT_NODE = 9;
  DOCUMENT_TYPE_NODE = 10;
  DOCUMENT_FRAGMENT_NODE = 11;
}

export function getInnerHTML(element: DomElement): string {
  if (element.type === 'text') {
    return element.data || '';
  }

  const attributes = Object.entries(element.attributes || {})
    .map(([key, value]) => `${key}="${value}"`)
    .join(' ');

  const childrenHTML = (element.children || []).map(child => getInnerHTML(child)).join('');
  console.log(
    `<${element.name}${attributes ? ` ${attributes}` : ''}>${childrenHTML}</${element.name}>`,
  );

  return `<${element.name}${attributes ? ` ${attributes}` : ''}>${childrenHTML}</${element.name}>`;
}
