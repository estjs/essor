import { describe, it } from 'vitest';
import {
  isHtmlFormElement,
  isHtmlInputElement,
  isHtmlSelectElement,
  isHtmlTextAreaElement,
  isTextNode,
} from '../src';

describe('hTML element type guards', () => {
  it('should identify HTMLInputElement', () => {
    const input = document.createElement('input');
    const div = document.createElement('div');

    expect(isHtmlInputElement(input)).toBe(true);
    expect(isHtmlInputElement(div)).toBe(false);
    expect(isHtmlInputElement(null)).toBe(false);
  });

  it('should identify HTMLSelectElement', () => {
    const select = document.createElement('select');
    const div = document.createElement('div');

    expect(isHtmlSelectElement(select)).toBe(true);
    expect(isHtmlSelectElement(div)).toBe(false);
    expect(isHtmlSelectElement(null)).toBe(false);
  });

  it('should identify HTMLTextAreaElement', () => {
    const textarea = document.createElement('textarea');
    const div = document.createElement('div');

    expect(isHtmlTextAreaElement(textarea)).toBe(true);
    expect(isHtmlTextAreaElement(div)).toBe(false);
    expect(isHtmlTextAreaElement(null)).toBe(false);
  });

  it('should identify HTMLFormElement', () => {
    const form = document.createElement('form');
    const div = document.createElement('div');

    expect(isHtmlFormElement(form)).toBe(true);
    expect(isHtmlFormElement(div)).toBe(false);
    expect(isHtmlFormElement(null)).toBe(false);
  });

  it('should identify Text node', () => {
    const text = document.createTextNode('text');
    const div = document.createElement('div');

    expect(isTextNode(text)).toBe(true);
    expect(isTextNode(div)).toBe(false);
    expect(isTextNode(null)).toBe(false);
  });
});
