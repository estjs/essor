/**
 * Create a template factory function from HTML string.
 *
 * This function creates a reusable template factory that efficiently clones
 * DOM nodes from the provided HTML string. The template is parsed once.
 *
 * Security note: `template(html)` is a raw HTML entrypoint. The caller is
 * responsible for ensuring `html` is trusted and not derived from unsanitized
 * user input.
 *
 * @param html - The HTML string to create template from.
 * @returns Factory function that returns a cloned node of the template.
 * @throws {Error} When template content is empty or invalid.
 *
 * @example
 * ```typescript
 * const buttonTemplate = template('<button>Click me</button>');
 * const button1 = buttonTemplate(); // Creates first button instance
 * const button2 = buttonTemplate(); // Creates second button instance
 * ```
 */
export function template(html: string) {
  let node: Node | undefined;

  /**
   * Creates the cached template root node on first use.
   */
  const create = (): Node => {
    // Regular HTML template
    const tmpl = document.createElement('template');
    tmpl.innerHTML = html;
    const firstChild = tmpl.content.firstChild;
    if (!firstChild) {
      throw new Error('Invalid template: empty content');
    }
    return firstChild;
  };

  // return a factory function: create the template when first called, reuse the cached template when called later
  return () => (node || (node = create())).cloneNode(true);
}
