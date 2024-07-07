import { h, template } from '../src';
import { mount } from './test-utils';

describe('h', () => {
  it('should work with template', () => {
    const _tmpl$ = template('<div>hello</div>');

    const element = () => h(_tmpl$, {});

    const render = mount(element);
    expect(render.innerHTML()).toBe('<div>hello</div>');
  });

  it('should work with component', () => {
    const _tmpl$ = template('<div>hello</div>');
    const element = () => h(_tmpl$, {});
    const element2 = () => h(element, {});
    const render = mount(element2);
    expect(render.innerHTML()).toBe('<div>hello</div>');
  });

  it('should work with html tag', () => {
    const element = () =>
      h('div', {
        class: 'text-red',
        children: [[() => 'hello world', null]],
      });
    const render = mount(element);
    expect(render.innerHTML()).toBe('<div class="text-red">hello world</div>');
  });
  it('should work with empty string', () => {
    const element = () =>
      h('', {
        children: [[() => 'hello world', null]],
      });
    const render = mount(element);
    expect(render.innerHTML()).toBe('hello world');
  });
});
