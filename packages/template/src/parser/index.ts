import { Parser } from './Parser';

export function parseDocument(data: string, options?): Document {
  const handler = new DomHandler(undefined, options);
  new Parser(handler, options).end(data);
  return handler.root;
}

export interface DomHandlerOptions {
  /**
   * Add a `startIndex` property to nodes.
   * When the parser is used in a non-streaming fashion, `startIndex` is an integer
   * indicating the position of the start of the node in the document.
   *
   * @default false
   */
  withStartIndices?: boolean;

  /**
   * Add an `endIndex` property to nodes.
   * When the parser is used in a non-streaming fashion, `endIndex` is an integer
   * indicating the position of the end of the node in the document.
   *
   * @default false
   */
  withEndIndices?: boolean;

  /**
   * Treat the markup as XML.
   *
   * @default false
   */
  xmlMode?: boolean;
}

// Default options
const defaultOpts: DomHandlerOptions = {
  withStartIndices: false,
  withEndIndices: false,
  xmlMode: false,
};

interface ParserInterface {
  startIndex: number | null;
  endIndex: number | null;
}

type Callback = (error: Error | null, dom: ChildNode[]) => void;
type ElementCallback = (element: Element) => void;

export class DomHandler {
  /** The elements of the DOM */
  public dom: ChildNode[] = [];

  /** The root element for the DOM */
  public root: Document = new Document(this.dom);

  /** Called once parsing has completed. */
  private readonly callback: Callback | null;

  /** Settings for the handler. */
  private readonly options: DomHandlerOptions;

  /** Callback whenever a tag is closed. */
  private readonly elementCB: ElementCallback | null;

  /** Indicated whether parsing has been completed. */
  private done = false;

  /** Stack of open tags. */
  protected tagStack: ParentNode[] = [this.root];

  /** A data node that is still being written to. */
  protected lastNode: DataNode | null = null;

  /** Reference to the parser instance. Used for location information. */
  private parser: ParserInterface | null = null;

  /**
   * @param callback Called once parsing has completed.
   * @param options Settings for the handler.
   * @param elementCB Callback whenever a tag is closed.
   */
  public constructor(
    callback?: Callback | null,
    options?: DomHandlerOptions | null,
    elementCB?: ElementCallback,
  ) {
    // Make it possible to skip arguments, for backwards-compatibility
    if (typeof options === 'function') {
      elementCB = options;
      options = defaultOpts;
    }
    if (typeof callback === 'object') {
      options = callback;
      callback = undefined;
    }

    this.callback = callback ?? null;
    this.options = options ?? defaultOpts;
    this.elementCB = elementCB ?? null;
  }

  public onparserinit(parser: ParserInterface): void {
    this.parser = parser;
  }

  // Resets the handler back to starting state
  public onreset(): void {
    this.dom = [];
    this.root = new Document(this.dom);
    this.done = false;
    this.tagStack = [this.root];
    this.lastNode = null;
    this.parser = null;
  }

  // Signals the handler that parsing is done
  public onend(): void {
    if (this.done) return;
    this.done = true;
    this.parser = null;
    this.handleCallback(null);
  }

  public onerror(error: Error): void {
    this.handleCallback(error);
  }

  public onclosetag(): void {
    this.lastNode = null;

    const elem = this.tagStack.pop() as Element;

    if (this.options.withEndIndices) {
      elem.endIndex = this.parser!.endIndex;
    }

    if (this.elementCB) this.elementCB(elem);
  }

  public onopentag(name: string, attribs: { [key: string]: string }): void {
    const type = this.options.xmlMode ? ElementType.Tag : undefined;
    const element = new Element(name, attribs, undefined, type);
    this.addNode(element);
    this.tagStack.push(element);
  }

  public ontext(data: string): void {
    const { lastNode } = this;

    if (lastNode && lastNode.type === ElementType.Text) {
      lastNode.data += data;
      if (this.options.withEndIndices) {
        lastNode.endIndex = this.parser!.endIndex;
      }
    } else {
      const node = new Text(data);
      this.addNode(node);
      this.lastNode = node;
    }
  }

  public oncomment(data: string): void {
    if (this.lastNode && this.lastNode.type === ElementType.Comment) {
      this.lastNode.data += data;
      return;
    }

    const node = new Comment(data);
    this.addNode(node);
    this.lastNode = node;
  }

  public oncommentend(): void {
    this.lastNode = null;
  }

  public oncdatastart(): void {
    const text = new Text('');
    const node = new CDATA([text]);

    this.addNode(node);

    text.parent = node;
    this.lastNode = text;
  }

  public oncdataend(): void {
    this.lastNode = null;
  }

  public onprocessinginstruction(name: string, data: string): void {
    const node = new ProcessingInstruction(name, data);
    this.addNode(node);
  }

  protected handleCallback(error: Error | null): void {
    if (typeof this.callback === 'function') {
      this.callback(error, this.dom);
    } else if (error) {
      throw error;
    }
  }

  protected addNode(node: ChildNode): void {
    const parent = this.tagStack[this.tagStack.length - 1];
    const previousSibling = parent.children[parent.children.length - 1] as ChildNode | undefined;

    if (this.options.withStartIndices) {
      node.startIndex = this.parser!.startIndex;
    }

    if (this.options.withEndIndices) {
      node.endIndex = this.parser!.endIndex;
    }

    parent.children.push(node);

    if (previousSibling) {
      node.prev = previousSibling;
      previousSibling.next = node;
    }

    node.parent = parent;
    this.lastNode = null;
  }
}

export default DomHandler;

interface SourceCodeLocation {
  /** One-based line index of the first character. */
  startLine: number;
  /** One-based column index of the first character. */
  startCol: number;
  /** Zero-based first character index. */
  startOffset: number;
  /** One-based line index of the last character. */
  endLine: number;
  /** One-based column index of the last character. Points directly *after* the last character. */
  endCol: number;
  /** Zero-based last character index. Points directly *after* the last character. */
  endOffset: number;
}

interface TagSourceCodeLocation extends SourceCodeLocation {
  startTag?: SourceCodeLocation;
  endTag?: SourceCodeLocation;
}

/**
 * A node that can have children.
 */
export type ParentNode = Document | Element | CDATA;

/**
 * A node that can have a parent.
 */
export type ChildNode =
  | Text
  | Comment
  | ProcessingInstruction
  | Element
  | CDATA
  // `Document` is also used for document fragments, and can be a child node.
  | Document;
export type AnyNode = ParentNode | ChildNode;

/**
 * This object will be used as the prototype for Nodes when creating a
 * DOM-Level-1-compliant structure.
 */
export abstract class Node {
  /** The type of the node. */
  abstract readonly type: ElementType;

  /** Parent of the node */
  parent: ParentNode | null = null;

  /** Previous sibling */
  prev: ChildNode | null = null;

  /** Next sibling */
  next: ChildNode | null = null;

  /** The start index of the node. Requires `withStartIndices` on the handler to be `true. */
  startIndex: number | null = null;

  /** The end index of the node. Requires `withEndIndices` on the handler to be `true. */
  endIndex: number | null = null;

  /**
   * `parse5` source code location info.
   *
   * Available if parsing with parse5 and location info is enabled.
   */
  sourceCodeLocation?: SourceCodeLocation | null;

  // Read-only aliases

  /**
   * [DOM spec](https://dom.spec.whatwg.org/#dom-node-nodetype)-compatible
   * node {@link type}.
   */
  abstract readonly nodeType: number;

  // Read-write aliases for properties

  /**
   * Same as {@link parent}.
   * [DOM spec](https://dom.spec.whatwg.org)-compatible alias.
   */
  get parentNode(): ParentNode | null {
    return this.parent;
  }

  set parentNode(parent: ParentNode | null) {
    this.parent = parent;
  }

  /**
   * Same as {@link prev}.
   * [DOM spec](https://dom.spec.whatwg.org)-compatible alias.
   */
  get previousSibling(): ChildNode | null {
    return this.prev;
  }

  set previousSibling(prev: ChildNode | null) {
    this.prev = prev;
  }

  /**
   * Same as {@link next}.
   * [DOM spec](https://dom.spec.whatwg.org)-compatible alias.
   */
  get nextSibling(): ChildNode | null {
    return this.next;
  }

  set nextSibling(next: ChildNode | null) {
    this.next = next;
  }

  /**
   * Clone this node, and optionally its children.
   *
   * @param recursive Clone child nodes as well.
   * @returns A clone of the node.
   */
  cloneNode<T extends Node>(this: T, recursive = false): T {
    return cloneNode(this, recursive);
  }
}

/**
 * A node that contains some data.
 */
export abstract class DataNode extends Node {
  /**
   * @param data The content of the data node
   */
  constructor(public data: string) {
    super();
  }

  /**
   * Same as {@link data}.
   * [DOM spec](https://dom.spec.whatwg.org)-compatible alias.
   */
  get nodeValue(): string {
    return this.data;
  }

  set nodeValue(data: string) {
    this.data = data;
  }
}

/**
 * Text within the document.
 */
export class Text extends DataNode {
  type: ElementType.Text = ElementType.Text;

  get nodeType(): 3 {
    return 3;
  }
}

/**
 * Comments within the document.
 */
export class Comment extends DataNode {
  type: ElementType.Comment = ElementType.Comment;

  get nodeType(): 8 {
    return 8;
  }
}

/**
 * Processing instructions, including doc types.
 */
export class ProcessingInstruction extends DataNode {
  'type': ElementType.Directive = ElementType.Directive;

  'constructor'(
    public name: string,
    data: string,
  ) {
    super(data);
  }

  override get 'nodeType'(): 1 {
    return 1;
  }

  /** If this is a doctype, the document type name (parse5 only). */
  'x-name'?: string;
  /** If this is a doctype, the document type public identifier (parse5 only). */
  'x-publicId'?: string;
  /** If this is a doctype, the document type system identifier (parse5 only). */
  'x-systemId'?: string;
}

/**
 * A node that can have children.
 */
export abstract class NodeWithChildren extends Node {
  /**
   * @param children Children of the node. Only certain node types can have children.
   */
  constructor(public children: ChildNode[]) {
    super();
  }

  // Aliases
  /** First child of the node. */
  get firstChild(): ChildNode | null {
    return this.children[0] ?? null;
  }

  /** Last child of the node. */
  get lastChild(): ChildNode | null {
    return this.children.length > 0 ? this.children[this.children.length - 1] : null;
  }

  /**
   * Same as {@link children}.
   * [DOM spec](https://dom.spec.whatwg.org)-compatible alias.
   */
  get childNodes(): ChildNode[] {
    return this.children;
  }

  set childNodes(children: ChildNode[]) {
    this.children = children;
  }
}

/**
 * CDATA nodes.
 */
export class CDATA extends NodeWithChildren {
  type: ElementType.CDATA = ElementType.CDATA;

  get nodeType(): 4 {
    return 4;
  }
}

/**
 * The root node of the document.
 */
export class Document extends NodeWithChildren {
  'type': ElementType.Root = ElementType.Root;

  get 'nodeType'(): 9 {
    return 9;
  }

  /** [Document mode](https://dom.spec.whatwg.org/#concept-document-limited-quirks) (parse5 only). */
  'x-mode'?: 'no-quirks' | 'quirks' | 'limited-quirks';
}

/**
 * The description of an individual attribute.
 */
interface Attribute {
  name: string;
  value: string;
  namespace?: string;
  prefix?: string;
}

/**
 * An element within the DOM.
 */
export class Element extends NodeWithChildren {
  /**
   * @param name Name of the tag, eg. `div`, `span`.
   * @param attribs Object mapping attribute names to attribute values.
   * @param children Children of the node.
   */
  'constructor'(
    public name: string,
    public attribs: { [name: string]: string },
    children: ChildNode[] = [],
    public type: ElementType.Tag | ElementType.Script | ElementType.Style = name === 'script'
      ? ElementType.Script
      : name === 'style'
        ? ElementType.Style
        : ElementType.Tag,
  ) {
    super(children);
  }

  get 'nodeType'(): 1 {
    return 1;
  }

  /**
   * `parse5` source code location info, with start & end tags.
   *
   * Available if parsing with parse5 and location info is enabled.
   */
  'sourceCodeLocation'?: TagSourceCodeLocation | null;

  // DOM Level 1 aliases

  /**
   * Same as {@link name}.
   * [DOM spec](https://dom.spec.whatwg.org)-compatible alias.
   */
  get 'tagName'(): string {
    return this.name;
  }

  set 'tagName'(name: string) {
    this.name = name;
  }

  get 'attributes'(): Attribute[] {
    return Object.keys(this.attribs).map(name => ({
      name,
      value: this.attribs[name],
      namespace: this['x-attribsNamespace']?.[name],
      prefix: this['x-attribsPrefix']?.[name],
    }));
  }

  /** Element namespace (parse5 only). */
  'namespace'?: string;
  /** Element attribute namespaces (parse5 only). */
  'x-attribsNamespace'?: Record<string, string>;
  /** Element attribute namespace-related prefixes (parse5 only). */
  'x-attribsPrefix'?: Record<string, string>;
}

/**
 * Checks if `node` is an element node.
 *
 * @param node Node to check.
 * @returns `true` if the node is an element node.
 */
export function isTag(node: Node): node is Element {
  return isTagRaw(node);
}

/**
 * Checks if `node` is a CDATA node.
 *
 * @param node Node to check.
 * @returns `true` if the node is a CDATA node.
 */
export function isCDATA(node: Node): node is CDATA {
  return node.type === ElementType.CDATA;
}

/**
 * Checks if `node` is a text node.
 *
 * @param node Node to check.
 * @returns `true` if the node is a text node.
 */
export function isText(node: Node): node is Text {
  return node.type === ElementType.Text;
}

/**
 * Checks if `node` is a comment node.
 *
 * @param node Node to check.
 * @returns `true` if the node is a comment node.
 */
export function isComment(node: Node): node is Comment {
  return node.type === ElementType.Comment;
}

/**
 * Checks if `node` is a directive node.
 *
 * @param node Node to check.
 * @returns `true` if the node is a directive node.
 */
export function isDirective(node: Node): node is ProcessingInstruction {
  return node.type === ElementType.Directive;
}

/**
 * Checks if `node` is a document node.
 *
 * @param node Node to check.
 * @returns `true` if the node is a document node.
 */
export function isDocument(node: Node): node is Document {
  return node.type === ElementType.Root;
}

/**
 * Checks if `node` has children.
 *
 * @param node Node to check.
 * @returns `true` if the node has children.
 */
export function hasChildren(node: Node): node is ParentNode {
  return Object.prototype.hasOwnProperty.call(node, 'children');
}

/**
 * Clone a node, and optionally its children.
 *
 * @param recursive Clone child nodes as well.
 * @returns A clone of the node.
 */
export function cloneNode<T extends Node>(node: T, recursive = false): T {
  let result: Node;

  if (isText(node)) {
    result = new Text(node.data);
  } else if (isComment(node)) {
    result = new Comment(node.data);
  } else if (isTag(node)) {
    const children = recursive ? cloneChildren(node.children) : [];
    const clone = new Element(node.name, { ...node.attribs }, children);
    children.forEach(child => (child.parent = clone));

    if (node.namespace != null) {
      clone.namespace = node.namespace;
    }
    if (node['x-attribsNamespace']) {
      clone['x-attribsNamespace'] = { ...node['x-attribsNamespace'] };
    }
    if (node['x-attribsPrefix']) {
      clone['x-attribsPrefix'] = { ...node['x-attribsPrefix'] };
    }

    result = clone;
  } else if (isCDATA(node)) {
    const children = recursive ? cloneChildren(node.children) : [];
    const clone = new CDATA(children);
    children.forEach(child => (child.parent = clone));
    result = clone;
  } else if (isDocument(node)) {
    const children = recursive ? cloneChildren(node.children) : [];
    const clone = new Document(children);
    children.forEach(child => (child.parent = clone));

    if (node['x-mode']) {
      clone['x-mode'] = node['x-mode'];
    }

    result = clone;
  } else if (isDirective(node)) {
    const instruction = new ProcessingInstruction(node.name, node.data);

    if (node['x-name'] != null) {
      instruction['x-name'] = node['x-name'];
      instruction['x-publicId'] = node['x-publicId'];
      instruction['x-systemId'] = node['x-systemId'];
    }

    result = instruction;
  } else {
    throw new Error(`Not implemented yet: ${node.type}`);
  }

  result.startIndex = node.startIndex;
  result.endIndex = node.endIndex;

  if (node.sourceCodeLocation != null) {
    result.sourceCodeLocation = node.sourceCodeLocation;
  }

  return result as T;
}

/**
 * Clone a list of child nodes.
 *
 * @param childs The child nodes to clone.
 * @returns A list of cloned child nodes.
 */
function cloneChildren(childs: ChildNode[]): ChildNode[] {
  const children = childs.map(child => cloneNode(child, true));

  for (let i = 1; i < children.length; i++) {
    children[i].prev = children[i - 1];
    children[i - 1].next = children[i];
  }

  return children;
}
/** Types of elements found in htmlparser2's DOM */
export enum ElementType {
  /** Type for the root element of a document */
  Root = 'root',
  /** Type for Text */
  Text = 'text',
  /** Type for <? ... ?> */
  Directive = 'directive',
  /** Type for <!-- ... --> */
  Comment = 'comment',
  /** Type for <script> tags */
  Script = 'script',
  /** Type for <style> tags */
  Style = 'style',
  /** Type for Any tag */
  Tag = 'tag',
  /** Type for <![CDATA[ ... ]]> */
  CDATA = 'cdata',
  /** Type for <!doctype ...> */
  Doctype = 'doctype',
}

/**
 * Tests whether an element is a tag or not.
 *
 * @param elem Element to test
 */
export function isTagRaw(elem: { type: ElementType }): boolean {
  return (
    elem.type === ElementType.Tag ||
    elem.type === ElementType.Script ||
    elem.type === ElementType.Style
  );
}

// Exports for backwards compatibility
/** Type for the root element of a document */
export const Root = ElementType.Root;
/** Type for Text */
export const Text = ElementType.Text;
/** Type for <? ... ?> */
export const Directive = ElementType.Directive;
/** Type for <!-- ... --> */
export const Comment = ElementType.Comment;
/** Type for <script> tags */
export const Script = ElementType.Script;
/** Type for <style> tags */
export const Style = ElementType.Style;
/** Type for Any tag */
export const Tag = ElementType.Tag;
/** Type for <![CDATA[ ... ]]> */
export const CDATA = ElementType.CDATA;
/** Type for <!doctype ...> */
export const Doctype = ElementType.Doctype;
