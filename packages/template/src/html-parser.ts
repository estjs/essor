interface Token {
  type: string;
  name?: string;
  attributes?: Record<string, string>;
  data?: string;
  isSelfClosing?: boolean;
}

export interface DomElement {
  type: 'tag' | 'text';
  name?: string;
  attributes?: Record<string, string>;
  children?: DomElement[];
  data?: string;
}

class Tokenizer {
  html: string;
  index: number;
  state: () => Token | undefined;

  constructor(html: string) {
    this.html = html;
    this.index = 0;
    this.state = this.dataState;
  }

  // Main tokenizer function that returns a list of tokens
  tokenize(): Token[] {
    const tokens: Token[] = [];
    let token;
    while (this.index < this.html.length) {
      token = this.state();
      if (token) tokens.push(token);
    }
    return tokens;
  }

  // Handle text and tag opening
  dataState(): Token | undefined {
    const char = this.html[this.index];
    if (char === '<') {
      return this.tagOpenState();
    }
    return this.consumeText();
  }

  // Handle tag opening
  tagOpenState(): Token | undefined {
    const char = this.html[++this.index];
    if (char === '/') {
      return this.endTagOpenState();
    }
    return this.tagNameState();
  }

  // Handle end tag
  endTagOpenState(): Token {
    const tagName = this.consumeTagName();
    return { type: 'endTag', name: tagName };
  }

  // Handle start tag
  tagNameState(): Token {
    const tagName = this.consumeTagName();
    const attributes = this.consumeAttributes();
    const isSelfClosing = this.html[this.index] === '/';
    this.index++;
    return { type: 'startTag', name: tagName, attributes, isSelfClosing };
  }

  // Consume text content
  consumeText(): Token | undefined {
    let text = '';
    while (this.index < this.html.length && this.html[this.index] !== '<') {
      text += this.html[this.index++];
    }
    if (text.trim()) {
      return { type: 'text', data: text.trim() };
    }
  }

  // Extract tag name
  consumeTagName(): string {
    let tagName = '';
    while (this.index < this.html.length && /[\da-z]/i.test(this.html[this.index])) {
      tagName += this.html[this.index++];
    }
    return tagName;
  }

  // Extract attributes for the tag
  consumeAttributes(): Record<string, string> {
    const attributes: Record<string, string> = {};
    let attrName = '',
      attrValue = '',
      inName = true;
    while (
      this.index < this.html.length &&
      this.html[this.index] !== '>' &&
      this.html[this.index] !== '/'
    ) {
      const char = this.html[this.index++];
      if (inName && /\S/.test(char) && char !== '=') {
        attrName += char;
      } else if (char === '=') {
        inName = false;
      } else if (!inName && /\S/.test(char) && char !== '"' && char !== "'") {
        attrValue += char;
      }
      if (char === '"' || char === "'") {
        inName = true;
        attributes[attrName] = attrValue;
        attrName = attrValue = '';
      }
    }
    return attributes;
  }
}

/**
 * Example Usage
    const htmlString = '<div class="container"><h1>Hello, World!</h1><img src="example.jpg" /></div>';
    const parser = new Parser();
    const dom = parser.parse(htmlString);
    console.log(JSON.stringify(dom, null, 2));
 *
 */
export class Parser {
  dom: DomElement[] = [];
  tagStack: DomElement[] = [];

  // Main function that parses HTML string to DOM elements
  parse(html: string): DomElement[] {
    const tokenizer = new Tokenizer(html);
    const tokens = tokenizer.tokenize();

    for (const token of tokens) {
      if (token.type === 'startTag') {
        this.handleStartTag(token);
      } else if (token.type === 'endTag') {
        this.handleEndTag(token);
      } else if (token.type === 'text') {
        this.handleText(token);
      }
    }

    return this.dom;
  }

  // Handle start tag tokens
  handleStartTag(token: Token): void {
    const element: DomElement = {
      type: 'tag',
      name: token.name,
      attributes: token.attributes,
      children: [],
    };
    if (this.tagStack.length > 0) {
      this.tagStack[this.tagStack.length - 1].children!.push(element);
    } else {
      this.dom.push(element);
    }
    if (!token.isSelfClosing) {
      this.tagStack.push(element);
    }
  }

  // Handle end tag tokens
  handleEndTag(token: Token): void {
    for (let i = this.tagStack.length - 1; i >= 0; i--) {
      if (this.tagStack[i].name === token.name) {
        this.tagStack.pop();
        break;
      }
    }
  }

  // Handle text tokens
  handleText(token: Token): void {
    const textNode: DomElement = { type: 'text', data: token.data };
    if (this.tagStack.length > 0) {
      this.tagStack[this.tagStack.length - 1].children!.push(textNode);
    } else {
      this.dom.push(textNode);
    }
  }
}
