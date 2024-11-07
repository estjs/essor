import { h, inject, onDestroy, onMount, provide, template } from '../src';

describe('lifecycle Hooks', () => {
  let ComptNode;
  let App;
  const root = document.createElement('div');

  const mountFn = vitest.fn();
  const destroyFn = vitest.fn();

  beforeEach(() => {
    const templ = template('');

    ComptNode = () => {
      onMount(mountFn);
      onDestroy(destroyFn);
      return h(templ, {
        '0': {
          children: [[() => 'hello word', null]],
        },
      });
    };

    App = h(ComptNode, {});
    App.mount(root);
  });

  afterEach(() => {
    ComptNode = null;
    App = null;
  });

  it('should run lifecycle hooks', () => {
    expect(mountFn).toBeCalledTimes(1);
    expect(destroyFn).toBeCalledTimes(0);
    App.unmount();
    expect(mountFn).toBeCalledTimes(1);
  });
});

describe('provide and inject', () => {
  let ComptNode;
  let ComptNodeRoot;
  let App;
  const root = document.createElement('div');

  beforeEach(() => {
    const templ1 = template('<div class="temp1"></div>');
    const templ2 = template('<div class="temp2"></div>');

    ComptNode = () => {
      const value = inject('key') || '12';
      return h(templ2, {
        '1': {
          children: [[() => value, 2]],
        },
      });
    };
    ComptNodeRoot = () => {
      provide('key', 'value');
      return h(templ1, {
        '0': {
          children: [[() => h(ComptNode, {}), 1]],
        },
      });
    };

    App = h(ComptNodeRoot, {});
    App.mount(root);
  });

  afterEach(() => {
    ComptNode = null;
    App = null;
    ComptNodeRoot = null;
  });

  it('provide should add value to ComptNode context', () => {
    expect(root.querySelector('.temp2')?.innerHTML).toBe('value');
  });
});
