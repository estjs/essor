import { isArray, isFalsy, kebabCase } from '@estjs/shared';
import { type Signal, isSignal } from '@estjs/signal';
import { isJsxElement } from './jsxRenderer';
import { renderContext } from './sharedConfig';
import { isSSGNode } from './ssgNode';

// 新增：常量定义
const SELF_CLOSING_TAGS =
  'area,base,br,col,embed,hr,img,input,link,meta,param,source,track,wbr'.split(',');
const HTML_TAGS =
  'a,abbr,acronym,address,applet,area,article,aside,audio,b,base,basefont,bdi,bdo,bgsound,big,blink,blockquote,body,br,button,canvas,caption,center,cite,code,col,colgroup,command,content,data,datalist,dd,del,details,dfn,dialog,dir,div,dl,dt,em,embed,fieldset,figcaption,figure,font,footer,form,frame,frameset,h1,h2,h3,h4,h5,h6,head,header,hgroup,hr,html,i,iframe,image,img,input,ins,kbd,keygen,label,legend,li,link,listing,main,map,mark,marquee,menu,menuitem,meta,meter,nav,nobr,noframes,noscript,object,ol,optgroup,option,output,p,param,picture,plaintext,pre,progress,q,rb,rp,rt,rtc,ruby,s,samp,script,section,select,shadow,small,source,spacer,span,strike,strong,style,sub,summary,sup,table,tbody,td,template,textarea,tfoot,th,thead,time,title,tr,track,tt,u,ul,var,video,wbr,xmp'.split(
    ',',
  );

/**
 * Converts any data to a Node or JSX.Element type.
 * @param data - The data to be coerced into a Node or JSX.Element.
 * @returns A Node or JSX.Element.
 */
export function coerceNode(data: unknown) {
  if (isJsxElement(data) || data instanceof Node || isSSGNode(data)) {
    return data;
  }
  const text = isFalsy(data) ? '' : String(data);
  return document.createTextNode(text);
}

/**
 * Inserts a child Node or JSX.Element into a parent Node at a specified position.
 * @param parent - The parent Node where the child will be inserted.
 * @param child - The child Node or JSX.Element to insert.
 * @param before - The Node or JSX.Element before which the new child will be inserted.
 */
export function insertChild(
  parent: Node,
  child: Node | JSX.Element,
  before: Node | JSX.Element | null = null,
): void {
  const beforeNode = isJsxElement(before) ? before.firstChild : before;
  const ssr = renderContext.isSSR;
  if (isJsxElement(child)) {
    child.mount(parent, beforeNode);
    // hack ssr compile node
  } else if (beforeNode && !ssr) {
    (beforeNode as HTMLElement).before(child);
    // hack ssr compile node
  } else if (!ssr) {
    (parent as HTMLElement).append(child);
  }
}

/**
 * Removes a child Node or JSX.Element from its parent.
 * @param child - The child Node or JSX.Element to remove.
 */
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

/**
 * Replaces an existing child Node or JSX.Element with a new one in a parent Node.
 * @param parent - The parent Node where the replacement will occur.
 * @param node - The new Node or JSX.Element to insert.
 * @param child - The existing Node or JSX.Element to be replaced.
 */
export function replaceChild(
  parent: Node,
  node: Node | JSX.Element,
  child: Node | JSX.Element,
): void {
  insertChild(parent, node, child);
  removeChild(child);
}

/**
 * Sets an attribute on an HTMLElement, handling special cases for 'class' and 'style'.
 * @param element - The HTMLElement on which to set the attribute.
 * @param attr - The attribute name.
 * @param value - The attribute value.
 */
export function setAttribute(element: HTMLElement, attr: string, value: unknown): void {
  if (attr === 'class') {
    setClassAttribute(element, value);
  } else if (attr === 'style') {
    setStyleAttribute(element, value);
  } else {
    setGenericAttribute(element, attr, value);
  }
}

function setClassAttribute(element: HTMLElement, value: unknown): void {
  if (typeof value === 'string') {
    element.className = value;
  } else if (isArray(value)) {
    element.className = value.join(' ');
  } else if (value && typeof value === 'object') {
    element.className = Object.entries(value)
      .reduce((acc, [key, value]) => acc + (value ? ` ${key}` : ''), '')
      .trim();
  }
}

function setStyleAttribute(element: HTMLElement, value: unknown): void {
  if (typeof value === 'string') {
    element.style.cssText = value;
  } else if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    Object.entries(obj).forEach(([key, value]) => {
      element.style.setProperty(kebabCase(key), String(value));
    });
  }
}

function setGenericAttribute(element: HTMLElement, attr: string, value: unknown): void {
  if (isFalsy(value)) {
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

/**
 * Binds an event listener to an input element to update a state setter based on the input type.
 * @param node - The input HTML element to bind the event listener to.
 * @param setter - The function to call when the input value changes.
 */
export function bindNode(node: Node, setter: (value: any) => void) {
  if (node instanceof HTMLInputElement) {
    switch (node.type) {
      case 'checkbox':
        return addEventListener(node, 'change', () => {
          setter(Boolean(node.checked));
        });
      case 'date':
        return addEventListener(node, 'change', () => {
          setter(node.value ? node.value : '');
        });
      case 'file':
        return addEventListener(node, 'change', () => {
          if (node.files) {
            setter(node.files);
          }
        });
      case 'number':
        return addEventListener(node, 'input', () => {
          const value = Number.parseFloat(node.value);
          setter(Number.isNaN(value) ? '' : String(value));
        });
      case 'radio':
        return addEventListener(node, 'change', () => {
          setter(node.checked ? node.value : '');
        });
      case 'text':
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

/**
 * Defers the execution of a function until the next tick of the event loop.
 * @param fn - The function to be executed on the next tick.
 * @returns A Promise that resolves after the next tick.
 */
const p = Promise.resolve();
export function nextTick(fn?: () => void): Promise<void> {
  return fn ? p.then(fn) : p;
}

export type Listener<T> = (value: T) => void;

export interface EventTarget {
  addEventListener(type: string, listener: Listener<unknown>): void;
  removeEventListener(type: string, listener: Listener<unknown>): void;
}

/**
 * Adds an event listener to a DOM node and returns a function to remove it.
 * @param node - The target node to add the event listener to.
 * @param eventName - The name of the event.
 * @param handler - The event handler function.
 * @returns A function to remove the event listener.
 */
export function addEventListener(
  node: EventTarget,
  eventName: string,
  handler: Listener<any>,
): () => void {
  node.addEventListener(eventName, handler);
  return () => node.removeEventListener(eventName, handler);
}

/**
 * Closes unclosed HTML tags in a given input string.
 * @param input - The input HTML string to process.
 * @returns The HTML string with unclosed tags properly closed.
 */
export function closeHtmlTags(input: string): string {
  const tagStack: string[] = [];
  const output: string[] = [];
  const tagPattern = /<\/?([\da-z-]+)([^>]*)>/gi;
  let lastIndex = 0;

  while (true) {
    const match = tagPattern.exec(input);
    if (!match) break;

    const [fullMatch, tagName] = match;
    const isEndTag = fullMatch[1] === '/';

    // Push text content between tags
    output.push(input.slice(lastIndex, match.index));
    lastIndex = match.index + fullMatch.length;

    if (isEndTag) {
      // Handle end tag
      while (tagStack.length > 0 && tagStack[tagStack.length - 1] !== tagName) {
        const unclosedTag = tagStack.pop();
        if (unclosedTag) {
          output.push(`</${unclosedTag}>`);
        }
      }
      if (tagStack.length > 0) {
        tagStack.pop(); // pop the matching start tag
      }
    } else if (!SELF_CLOSING_TAGS.includes(tagName)) {
      // Handle start tag
      tagStack.push(tagName);
    }
    output.push(fullMatch); // Push the current tag
  }

  // Add any remaining unclosed tags
  output.push(input.slice(lastIndex));
  while (tagStack.length > 0) {
    const unclosedTag = tagStack.pop();
    if (unclosedTag) {
      output.push(`</${unclosedTag}>`);
    }
  }

  return output.join('');
}

/**
 * Checks if a given tag name is a valid HTML tag.
 * @param tagName - The tag name to check.
 * @returns A boolean indicating if the tag name is valid.
 */
export function isHtmlTagName(tagName: string): tagName is keyof HTMLElementTagNameMap {
  return HTML_TAGS.includes(tagName);
}

/**
 * Converts a string to a valid HTML tag name.
 * @param tagName - The input string to convert.
 * @returns The valid HTML tag name.
 */
export function convertToHtmlTag(tagName: string): string {
  return SELF_CLOSING_TAGS.includes(tagName) ? `<${tagName}/>` : `<${tagName}></${tagName}>`;
}

/**
 * Extracts the value from a signal if given, or returns the given value if not a signal.
 * @param signal - The signal or value to extract.
 * @returns The extracted value.
 */
export function extractSignal<T>(signal: T | Signal<T>): T {
  if (isSignal(signal)) {
    return signal.value;
  } else {
    return signal;
  }
}
