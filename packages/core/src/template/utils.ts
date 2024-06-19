import { isFalsy, kebabCase } from 'essor-shared';
import { isJsxElement } from './template';

// 将任意数据转换为 Node 或 JSX.Element 类型
export function coerceNode(data: unknown) {
  if (isJsxElement(data) || data instanceof Node) {
    return data;
  }
  const text = isFalsy(data) ? '' : String(data);
  return document.createTextNode(text);
}

export function insertChild(
  parent: Node,
  child: Node | JSX.Element,
  before: Node | JSX.Element | null = null,
): void {
  const beforeNode = isJsxElement(before) ? before.firstChild : before;
  if (isJsxElement(child)) {
    child.mount(parent, beforeNode);
  } else if (beforeNode) {
    (beforeNode as HTMLElement).before(child);
  } else {
    (parent as HTMLElement).append(child);
  }
}

export function removeChild(child: Node | JSX.Element): void {
  if (isJsxElement(child)) {
    child.unmount();
  } else {
    const parent = child.parentNode;
    if (parent) {
      (child as HTMLElement).remove();
    }
  }
}

export function replaceChild(
  parent: Node,
  node: Node | JSX.Element,
  child: Node | JSX.Element,
): void {
  // 先插入新节点，再移除旧节点
  insertChild(parent, node, child);
  removeChild(child);
}
export function setAttribute(element: HTMLElement, attr: string, value: unknown): void {
  if (attr === 'class') {
    if (typeof value === 'string') {
      element.className = value;
    } else if (Array.isArray(value)) {
      element.className = value.join(' ');
    } else if (value && typeof value === 'object') {
      element.className = Object.entries(value)
        .reduce((acc, [key, value]) => acc + (value ? ` ${key}` : ''), '')
        .trim();
    }
    return;
  }

  if (attr === 'style') {
    if (typeof value === 'string') {
      element.style.cssText = value;
    } else if (value && typeof value === 'object') {
      const obj = value as Record<string, unknown>;

      Object.keys(obj).forEach(key => {
        element.style.setProperty(kebabCase(key), String(obj[key]));
      });
    }
    return;
  }

  if (isFalsy(value)) {
    element.removeAttribute(attr);
  } else if (value === true) {
    element.setAttribute(attr, '');
  } else {
    element.setAttribute(attr, String(value));
  }
}

export function binNode(node: Node, setter: (value: any) => void) {
  if (node instanceof HTMLInputElement) {
    // checkbox
    if (node.type === 'checkbox') {
      return addEventListener(node, 'change', () => {
        setter(Boolean(node.checked));
      });
    }

    // date
    if (node.type === 'date') {
      return addEventListener(node, 'change', () => {
        setter(node.value ? node.value : '');
      });
    }

    // file
    if (node.type === 'file') {
      return addEventListener(node, 'change', () => {
        if (node.files) {
          setter(node.files);
        }
      });
    }

    // number
    if (node.type === 'number') {
      return addEventListener(node, 'input', () => {
        const value = Number.parseFloat(node.value);
        setter(Number.isNaN(value) ? '' : String(value));
      });
    }

    // radio
    if (node.type === 'radio') {
      return addEventListener(node, 'change', () => {
        setter(node.checked ? node.value : '');
      });
    }

    // text
    if (node.type === 'text') {
      return addEventListener(node, 'input', () => {
        setter(node.value);
      });
    }
  }

  if (node instanceof HTMLSelectElement) {
    return addEventListener(node, 'change', () => {
      setter(node.value);
    });
  }

  if (node instanceof HTMLTextAreaElement) {
    return addEventListener(node, 'input', () => {
      setter(node.value);
    });
  }
}
const p = Promise.resolve();
export function nextTick(fn?: () => void): Promise<void> {
  return fn ? p.then(fn) : p;
}

export type Listener<T> = (value: T) => void;

export interface EventTarget {
  // 添加事件监听器
  addEventListener(type: string, listener: Listener<unknown>): void;
  // 移除事件监听器
  removeEventListener(type: string, listener: Listener<unknown>): void;
}

export function addEventListener(
  node: EventTarget,
  eventName: string,
  handler: Listener<any>,
): () => void {
  node.addEventListener(eventName, handler);
  return () => node.removeEventListener(eventName, handler);
}
const selfClosingTags = [
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
];

/**
 * A function that converts a tag to an HTML tag based on whether it is a self-closing tag or not.
 *
 * @param {string} tag - The tag to convert to an HTML tag.
 * @return {string} The converted HTML tag.
 */
export function convertToHtmlTag(tag) {
  if (selfClosingTags.includes(tag)) {
    return `<${tag}/>`;
  } else {
    return `<${tag}></${tag}>`;
  }
}

const htmlTags = [
  'a',
  'abbr',
  'acronym',
  'address',
  'applet',
  'area',
  'article',
  'aside',
  'audio',
  'b',
  'base',
  'basefont',
  'bdi',
  'bdo',
  'bgsound',
  'big',
  'blink',
  'blockquote',
  'body',
  'br',
  'button',
  'canvas',
  'caption',
  'center',
  'cite',
  'code',
  'col',
  'colgroup',
  'command',
  'content',
  'data',
  'datalist',
  'dd',
  'del',
  'details',
  'dfn',
  'dialog',
  'dir',
  'div',
  'dl',
  'dt',
  'em',
  'embed',
  'fieldset',
  'figcaption',
  'figure',
  'font',
  'footer',
  'form',
  'frame',
  'frameset',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'head',
  'header',
  'hgroup',
  'hr',
  'html',
  'i',
  'iframe',
  'image',
  'img',
  'input',
  'ins',
  'kbd',
  'keygen',
  'label',
  'legend',
  'li',
  'link',
  'listing',
  'main',
  'map',
  'mark',
  'marquee',
  'menu',
  'menuitem',
  'meta',
  'meter',
  'nav',
  'nobr',
  'noframes',
  'noscript',
  'object',
  'ol',
  'optgroup',
  'option',
  'output',
  'p',
  'param',
  'picture',
  'plaintext',
  'pre',
  'progress',
  'q',
  'rb',
  'rp',
  'rt',
  'rtc',
  'ruby',
  's',
  'samp',
  'script',
  'section',
  'select',
  'shadow',
  'small',
  'source',
  'spacer',
  'span',
  'strike',
  'strong',
  'style',
  'sub',
  'summary',
  'sup',
  'table',
  'tbody',
  'td',
  'template',
  'textarea',
  'tfoot',
  'th',
  'thead',
  'time',
  'title',
  'tr',
  'track',
  'tt',
  'u',
  'ul',
  'var',
  'video',
  'wbr',
  'xmp',
];

export function isHtmlTagName(str) {
  return htmlTags.includes(str);
}
