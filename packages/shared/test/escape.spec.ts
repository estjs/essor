import { escape } from '../src';
describe('escape', () => {
  it('escapes ampersands', () => {
    expect(escape('AT&T')).toBe('AT&amp;T');
  });

  it('escapes less than signs', () => {
    expect(escape('3 < 5')).toBe('3 &lt; 5');
  });

  it('escapes greater than signs', () => {
    expect(escape('5 > 3')).toBe('5 &gt; 3');
  });

  it('escapes double quotes', () => {
    expect(escape('"Hello"')).toBe('&quot;Hello&quot;');
  });

  it('escapes single quotes', () => {
    expect(escape("It's OK")).toBe('It&#039;s OK');
  });

  it('escapes multiple special characters', () => {
    expect(escape('5 > 3 & 3 < 5')).toBe('5 &gt; 3 &amp; 3 &lt; 5');
  });

  it('returns the same string if no special characters', () => {
    expect(escape('Hello, World!')).toBe('Hello, World!');
  });

  it('handles empty strings', () => {
    expect(escape('')).toBe('');
  });

  it('handles strings with only special characters', () => {
    expect(escape('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#039;');
  });

  it('handles strings with repeated special characters', () => {
    expect(escape('&&&&')).toBe('&amp;&amp;&amp;&amp;');
    expect(escape('<<>>')).toBe('&lt;&lt;&gt;&gt;');
    expect(escape('""""')).toBe('&quot;&quot;&quot;&quot;');
    expect(escape("''''")).toBe('&#039;&#039;&#039;&#039;');
  });
});
