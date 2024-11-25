import { isArray, isFalsy, kebabCase } from '@estjs/shared';
import { type Signal, isSignal } from '@estjs/signal';
import { isJsxElement } from './jsxRenderer';
import { renderContext } from './sharedConfig';
import { isSSGNode } from './ssgNode';

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
 * Extracts the value from a useSignal if given, or returns the given value if not a useSignal.
 * @param useSignal - The useSignal or value to extract.
 * @returns The extracted value.
 */
export function extractSignal<T>(useSignal: T | Signal<T>): T {
  if (isSignal(useSignal)) {
    return useSignal.value;
  } else {
    return useSignal;
  }
}
