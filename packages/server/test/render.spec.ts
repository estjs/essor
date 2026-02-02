import { describe, expect, it, vi } from 'vitest';
import { getHydrationKey } from '@estjs/template';
import { createSSGComponent, render, renderToString } from '../src/render';

describe('server/render', () => {
  describe('renderToString', () => {
    it('renders component to string', () => {
      const Component = () => '<div>hello</div>';
      expect(renderToString(Component)).toBe('<div>hello</div>');
    });

    it('passes props to component', () => {
      const Component = (props: any) => `<div>${props.msg}</div>`;
      expect(renderToString(Component, { msg: 'hello' })).toBe('<div>hello</div>');
    });

    it('resets hydration key before render', () => {
      const Component = () => {
        return `<div data-hk="${getHydrationKey()}"></div>`;
      };
      // First render
      expect(renderToString(Component)).toBe('<div data-hk="0"></div>');
      // Second render should reset key and start from 0
      expect(renderToString(Component)).toBe('<div data-hk="0"></div>');
    });

    it('returns empty string and logs error if component is not a function', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(renderToString(null as any)).toBe('');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('createSSGComponent', () => {
    it('creates ssg component string', () => {
      const Component = () => '<div>hello</div>';
      expect(createSSGComponent(Component)).toBe('<div>hello</div>');
    });

    it('passes props', () => {
      const Component = (props: any) => `<div>${props.msg}</div>`;
      expect(createSSGComponent(Component, { msg: 'hello' })).toBe('<div>hello</div>');
    });

    it('returns empty string and logs error if component is not a function', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      expect(createSSGComponent(null as any)).toBe('');
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('render', () => {
    it('interpolates templates and components', () => {
      const templates = ['<div>', '<span>', '</span>', '</div>'];
      const comp1 = 'hello';
      const comp2 = 'world';
      const comp3 = '!';

      const result = render(templates, '0', comp1, comp2, comp3);
      // Expected: <div data-hk="0">hello<span>world</span>!</div>
      // Note: addAttributes adds data-hk to the root element
      expect(result).toBe('<div data-hk="0">hello<span>world</span>!</div>');
    });

    it('handles missing components', () => {
      const templates = ['<div>', '</div>'];
      const result = render(templates, '0');
      expect(result).toBe('<div data-hk="0"></div>');
    });
  });
});
