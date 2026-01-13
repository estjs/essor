/**
 * Checks if a value is an HTMLInputElement
 * @param val - The value to check
 * @returns true if the value is an HTMLInputElement
 */
export function isHtmlInputElement(val: unknown): val is HTMLInputElement {
  return typeof HTMLInputElement !== 'undefined' && val instanceof HTMLInputElement;
}

/**
 * Checks if a value is an HTMLSelectElement
 * @param val - The value to check
 * @returns true if the value is an HTMLSelectElement
 */
export function isHtmlSelectElement(val: unknown): val is HTMLSelectElement {
  return typeof HTMLSelectElement !== 'undefined' && val instanceof HTMLSelectElement;
}

/**
 * Checks if a value is an HTMLTextAreaElement
 * @param val - The value to check
 * @returns true if the value is an HTMLTextAreaElement
 */
export function isHtmlTextAreaElement(val: unknown): val is HTMLTextAreaElement {
  return typeof HTMLTextAreaElement !== 'undefined' && val instanceof HTMLTextAreaElement;
}

/**
 * Checks if a value is an HTMLFormElement
 * @param val - The value to check
 * @returns true if the value is an HTMLFormElement
 */
export function isHtmlFormElement(val: unknown): val is HTMLFormElement {
  return typeof HTMLFormElement !== 'undefined' && val instanceof HTMLFormElement;
}

/**
 * Checks if a value is a Text node
 * @param val - The value to check
 * @returns true if the value is a Text node
 */
export function isTextNode(val: unknown): val is Text {
  return typeof Text !== 'undefined' && val instanceof Text;
}

/**
 * Checks if a value is a Node
 * @param val - The value to check
 * @returns true if the value is a Node
 */
export function isNode(val: unknown): val is Node {
  return typeof Node !== 'undefined' && val instanceof Node;
}
