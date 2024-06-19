import { h, isJsxElement, template } from '../src/template';
import {
  type EventTarget,
  type Listener,
  addEventListener,
  binNode,
  coerceNode,
  convertToHtmlTag,
  insertChild,
  isHtmlTagName,
  removeChild,
  replaceChild,
  setAttribute,
} from '../src/template/utils';

const tmpl = template('<div>Hello World</div>');
const element = h(tmpl, {});

describe('coerceNode', () => {
  it('should return a text node when given a string', () => {
    const result = coerceNode('test') as HTMLElement;
    expect(result instanceof Text).toBe(true);
    expect(result.nodeValue).toBe('test');
  });

  it('should return a text node when given a number', () => {
    const result = coerceNode(123) as HTMLElement;
    expect(result instanceof Text).toBe(true);
    expect(result.nodeValue).toBe('123');
  });

  it('should return a text node when given a boolean', () => {
    const result = coerceNode(true) as HTMLElement;
    expect(result instanceof Text).toBe(true);
    expect(result.nodeValue).toBe('true');
  });

  it('should return a JSX element when given JSX', () => {
    const resultTmpl = coerceNode(tmpl);
    const resultElement = coerceNode(element);
    expect(resultTmpl).toEqual(tmpl);
    expect(resultElement).toEqual(element);
  });

  it('should return a text node when given null or undefined', () => {
    const result1 = coerceNode(null);
    const result2 = coerceNode(undefined);
    expect(result1 instanceof Text).toBe(true);
    //@ts-expect-error
    expect(result1.nodeValue).toBe('');
    expect(result2 instanceof Text).toBe(true);
    //@ts-expect-error
    expect(result2.nodeValue).toBe('');
  });
});

describe('insertChild', () => {
  it('should insert child into parent without before argument', () => {
    const parent = document.createElement('div');
    const child = document.createElement('span');
    insertChild(parent, child);
    expect(parent.firstChild).toBe(child);
  });

  it('should insert child into parent with before argument', () => {
    const parent = document.createElement('div');
    const child1 = document.createElement('span');
    const child2 = document.createElement('span');
    parent.append(child1);
    insertChild(parent, child2, child1);
    expect(parent.childNodes[1]).toStrictEqual(child2);
  });

  it('should insert JSX element into parent without before argument', () => {
    const parent = document.createElement('div');
    insertChild(parent, element as JSX.Element);
    expect(isJsxElement(parent.firstChild)).toBe(false);
    expect(parent.firstChild).toMatchInlineSnapshot(`
      <div>
        Hello World
      </div>
    `);
  });

  it('should insert JSX element into parent with before argument', () => {
    const parent = document.createElement('div');
    const child1 = document.createElement('span');
    parent.append(child1);
    insertChild(parent, element as JSX.Element, child1);
    expect(isJsxElement(parent.childNodes[1])).toBe(false);
    expect(parent.childNodes[1]).toMatchInlineSnapshot(`<span />`);
  });
});

describe('removeChild', () => {
  it('should remove child from parent', () => {
    const parent = document.createElement('div');
    const child = document.createElement('span');
    parent.append(child);
    removeChild(child);
    expect(parent.firstChild).toBe(null);
  });

  it('should remove JSX element from parent', () => {
    const parent = document.createElement('div');
    insertChild(parent, element);
    removeChild(element);
    expect(parent.firstChild).toBe(null);
  });
});

describe('replaceChild', () => {
  it('should replace child with node', () => {
    const parent = document.createElement('div');
    const child = document.createElement('span');
    const newNode = document.createElement('div');
    parent.append(child);
    replaceChild(parent, newNode, child);
    expect(parent.firstChild).toBe(newNode);
  });

  it('should replace child with JSX element', () => {
    const parent = document.createElement('div');
    const child = document.createElement('span');
    parent.append(child);
    replaceChild(parent, element, child);
    expect(parent.firstChild).toMatchInlineSnapshot(`
      <div>
        Hello World
      </div>
    `);
  });
});

describe('setAttribute', () => {
  it('should set attribute on element', () => {
    const element = document.createElement('div');
    setAttribute(element, 'id', 'test');
    expect(element.getAttribute('id')).toBe('test');
  });

  it('should set class attribute on element', () => {
    const element = document.createElement('div');
    setAttribute(element, 'class', 'test');
    expect(element.className).toBe('test');
  });

  it('should set style attribute on element', () => {
    const element = document.createElement('div');
    setAttribute(element, 'style', { color: 'red', fontSize: '16px' });
    expect(element.style.color).toBe('red');
    expect(element.style.fontSize).toBe('16px');
  });

  it('should remove attribute if value is falsy', () => {
    const element = document.createElement('div');
    element.setAttribute('id', 'test');
    setAttribute(element, 'id', '');
    expect(element.hasAttribute('id')).toBe(false);
  });

  it('should set boolean attribute on element', () => {
    const element = document.createElement('input');
    setAttribute(element, 'disabled', true);
    expect(element.hasAttribute('disabled')).toBe(true);
  });
});

describe('binNode', () => {
  it('should bind change event for checkbox', () => {
    const node = document.createElement('input');
    node.type = 'checkbox';
    const setter = vitest.fn();
    binNode(node, setter);
    node.checked = true;
    node.dispatchEvent(new Event('change'));
    expect(setter).toHaveBeenCalledWith(true);
  });

  it('should bind change event for date input', () => {
    const node = document.createElement('input');
    node.type = 'date';
    const setter = vitest.fn();
    binNode(node, setter);
    node.value = '2024-03-05';
    node.dispatchEvent(new Event('change'));
    expect(setter).toHaveBeenCalledWith('2024-03-05');
  });

  it('should bind change event for file input', () => {
    const node = document.createElement('input');
    node.type = 'file';
    const setter = vitest.fn();
    binNode(node, setter);
    const file = new File([''], 'test.txt', { type: 'text/plain' });
    Object.defineProperty(node, 'files', { value: [file] });
    node.dispatchEvent(new Event('change'));
    expect(setter).toHaveBeenCalledWith([file]);
  });

  it('should bind input event for number input', () => {
    const node = document.createElement('input');
    node.type = 'number';
    const setter = vitest.fn();
    binNode(node, setter);
    node.value = '123';
    node.dispatchEvent(new Event('input'));
    expect(setter).toHaveBeenCalledWith('123');
  });

  it('should bind change event for radio input', () => {
    const node = document.createElement('input');
    node.type = 'radio';
    node.value = 'test';
    const setter = vitest.fn();
    binNode(node, setter);
    node.checked = true;
    node.dispatchEvent(new Event('change'));
    expect(setter).toHaveBeenCalledWith('test');
  });

  it('should bind input event for text input', () => {
    const node = document.createElement('input');
    node.type = 'text';
    const setter = vitest.fn();
    binNode(node, setter);
    node.value = 'hello';
    node.dispatchEvent(new Event('input'));
    expect(setter).toHaveBeenCalledWith('hello');
  });

  it('should bind change event for select element', () => {
    const node = document.createElement('select');
    const option = document.createElement('option');
    option.value = 'test';
    node.append(option);
    const setter = vitest.fn();
    binNode(node, setter);
    node.value = 'test';
    node.dispatchEvent(new Event('change'));
    expect(setter).toHaveBeenCalledWith('test');
  });

  it('should bind input event for textarea element', () => {
    const node = document.createElement('textarea');
    const setter = vitest.fn();
    binNode(node, setter);
    node.value = 'hello';
    node.dispatchEvent(new Event('input'));
    expect(setter).toHaveBeenCalledWith('hello');
  });
});

describe('addEventListener', () => {
  it('should add event listener and return a function to remove it', () => {
    const mockNode: EventTarget = {
      addEventListener: vitest.fn(),
      removeEventListener: vitest.fn(),
    };
    const eventName = 'click';
    const handler: Listener<any> = vitest.fn();

    const removeListener = addEventListener(mockNode, eventName, handler);
    expect(mockNode.addEventListener).toHaveBeenCalledWith(eventName, handler);

    removeListener();
    expect(mockNode.removeEventListener).toHaveBeenCalledWith(eventName, handler);
  });
});
describe('convertToHtmlTag', () => {
  it('should convert a normal tag to its HTML element string', () => {
    expect(convertToHtmlTag('div')).toBe('<div></div>');
    expect(convertToHtmlTag('span')).toBe('<span></span>');
    expect(convertToHtmlTag('p')).toBe('<p></p>');
  });

  it('should convert a self-closing tag to its self-closing HTML element string', () => {
    expect(convertToHtmlTag('img')).toBe('<img/>');
    expect(convertToHtmlTag('input')).toBe('<input/>');
    expect(convertToHtmlTag('br')).toBe('<br/>');
    expect(convertToHtmlTag('meta')).toBe('<meta/>');
    expect(convertToHtmlTag('link')).toBe('<link/>');
  });

  it('should handle tags that are not in the self-closing list as normal tags', () => {
    expect(convertToHtmlTag('custom-tag')).toBe('<custom-tag></custom-tag>');
  });
});
describe('isHtmlTagName', () => {
  it('should return true for valid HTML tags', () => {
    expect(isHtmlTagName('div')).toBe(true);
    expect(isHtmlTagName('img')).toBe(true);
    expect(isHtmlTagName('span')).toBe(true);
    expect(isHtmlTagName('p')).toBe(true);
  });

  it('should return false for invalid HTML tags', () => {
    expect(isHtmlTagName('custom-tag')).toBe(false);
    expect(isHtmlTagName('notatag')).toBe(false);
    expect(isHtmlTagName('123')).toBe(false);
    expect(isHtmlTagName('')).toBe(false);
  });

  it('should return false for null or undefined input', () => {
    expect(isHtmlTagName(null)).toBe(false);
    expect(isHtmlTagName(undefined)).toBe(false);
  });
});
