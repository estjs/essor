import { describe, expect, it } from 'vitest';
import { Parser } from '../src/html-parser';
describe('hTML Parser', () => {
  it('parses a simple HTML string', () => {
    const parser = new Parser();
    const htmlString = '<div>Hello, World!</div>';
    const dom = parser.parse(htmlString);

    expect(dom).toEqual([
      {
        type: 'tag',
        name: 'div',
        attributes: {},
        children: [{ type: 'text', data: 'Hello, World!' }],
      },
    ]);
  });

  it('parses nested elements', () => {
    const parser = new Parser();
    const htmlString = '<div><span>Text</span></div>';
    const dom = parser.parse(htmlString);

    expect(dom).toEqual([
      {
        type: 'tag',
        name: 'div',
        attributes: {},
        children: [
          {
            type: 'tag',
            name: 'span',
            attributes: {},
            children: [{ type: 'text', data: 'Text' }],
          },
        ],
      },
    ]);
  });

  it('parses elements with attributes', () => {
    const parser = new Parser();
    const htmlString = '<img src="image.jpg" alt="Image">';
    const dom = parser.parse(htmlString);

    expect(dom).toEqual([
      {
        type: 'tag',
        name: 'img',
        attributes: {
          src: 'image.jpg',
          alt: 'Image',
        },
        children: [],
      },
    ]);
  });

  it('handles self-closing tags', () => {
    const parser = new Parser();
    const htmlString = '<img src="image.jpg" />';
    const dom = parser.parse(htmlString);

    expect(dom).toEqual([
      {
        type: 'tag',
        name: 'img',
        attributes: {
          src: 'image.jpg',
        },
        children: [],
      },
    ]);
  });

  it('handles text content outside of tags', () => {
    const parser = new Parser();
    const htmlString = 'Just text outside of tags';
    const dom = parser.parse(htmlString);

    expect(dom).toEqual([
      {
        type: 'text',
        data: 'Just text outside of tags',
      },
    ]);
  });

  it('handles mixed content (tags and text)', () => {
    const parser = new Parser();
    const htmlString = '<div>Hello <b>World</b>!</div>';
    const dom = parser.parse(htmlString);

    expect(dom).toEqual([
      {
        type: 'tag',
        name: 'div',
        attributes: {},
        children: [
          { type: 'text', data: 'Hello ' },
          {
            type: 'tag',
            name: 'b',
            attributes: {},
            children: [{ type: 'text', data: 'World' }],
          },
          { type: 'text', data: '!' },
        ],
      },
    ]);
  });

  it('handles invalid HTML gracefully', () => {
    const parser = new Parser();
    const htmlString = '<div><span>Unclosed tag</div>';
    const dom = parser.parse(htmlString);

    expect(dom).toEqual([
      {
        type: 'tag',
        name: 'div',
        attributes: {},
        children: [
          {
            type: 'tag',
            name: 'span',
            attributes: {},
            children: [{ type: 'text', data: 'Unclosed tag' }],
          },
        ],
      },
    ]);
  });
});
