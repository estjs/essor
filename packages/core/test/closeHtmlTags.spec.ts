import { closeHtmlTags } from '../src/template/utils';

describe('closeHtmlTags', () => {
  it('should close a single unclosed tag', () => {
    const input = '<div>';
    const expectedOutput = '<div></div>';
    expect(closeHtmlTags(input)).toBe(expectedOutput);
  });

  it('should handle already closed tags', () => {
    const input = '<div></div>';
    const expectedOutput = '<div></div>';
    expect(closeHtmlTags(input)).toBe(expectedOutput);
  });

  it('should close nested tags correctly', () => {
    const input = '<div><span>';
    const expectedOutput = '<div><span></span></div>';
    expect(closeHtmlTags(input)).toBe(expectedOutput);
  });

  it('should close multiple nested tags correctly', () => {
    const input = '<div><span><p>';
    const expectedOutput = '<div><span><p></p></span></div>';
    expect(closeHtmlTags(input)).toBe(expectedOutput);
  });

  it('should handle self-closing tags correctly', () => {
    const input = '<div><br/><img src="image.png"><p>';
    const expectedOutput = '<div><br/><img src="image.png"><p></p></div>';
    expect(closeHtmlTags(input)).toBe(expectedOutput);
  });

  it('should handle text content correctly', () => {
    const input = '<div>Hello <span>world</div>';
    const expectedOutput = '<div>Hello <span>world</span></div>';
    expect(closeHtmlTags(input)).toBe(expectedOutput);
  });

  it('should handle mixed closed and unclosed tags', () => {
    const input = '<div><span>Test</span><p>';
    const expectedOutput = '<div><span>Test</span><p></p></div>';
    expect(closeHtmlTags(input)).toBe(expectedOutput);
  });

  it('should handle empty input', () => {
    const input = '';
    const expectedOutput = '';
    expect(closeHtmlTags(input)).toBe(expectedOutput);
  });

  it('should handle input with only text', () => {
    const input = 'Hello world';
    const expectedOutput = 'Hello world';
    expect(closeHtmlTags(input)).toBe(expectedOutput);
  });

  it('should handle unclosed tags with attributes', () => {
    const input = '<div class="container"><p id="para">';
    const expectedOutput = '<div class="container"><p id="para"></p></div>';
    expect(closeHtmlTags(input)).toBe(expectedOutput);
  });

  it('should handle nested tags with attributes', () => {
    const input = '<div class="container"><span class="text">Hello<p id="para">';
    const expectedOutput =
      '<div class="container"><span class="text">Hello<p id="para"></p></span></div>';
    expect(closeHtmlTags(input)).toBe(expectedOutput);
  });
  it('should handle lang class ant atom class', () => {
    const code = `
<header class="fixed top-0 left-0 w-full z-10">
  <div class="flex items-center justify-between h-14 border-b nav">
    <div>
      <a href="/" class="w-full h-full text-xl font-semibold flex items-center hover:opacity-60">
        essor.js
    </div>
    <div class="search flex-1 pl-8">
    </div>
    <div class="flex items-center">
      <div class="flex items-center">
      </div>
      <div>
      </div>
      <div class="ml-2 social-link-icon">
        <a href="/">
        <div class="i-icon w-5 h-5 fill-current">
      </div>
    </div>

    `;

    expect(closeHtmlTags(code)).toMatchInlineSnapshot(`
      "
      <header class="fixed top-0 left-0 w-full z-10">
        <div class="flex items-center justify-between h-14 border-b nav">
          <div>
            <a href="/" class="w-full h-full text-xl font-semibold flex items-center hover:opacity-60">
              essor.js
          </a></div>
          <div class="search flex-1 pl-8">
          </div>
          <div class="flex items-center">
            <div class="flex items-center">
            </div>
            <div>
            </div>
            <div class="ml-2 social-link-icon">
              <a href="/">
              <div class="i-icon w-5 h-5 fill-current">
            </div>
          </a></div>

          </div></div></header>"
    `);
  });
});
