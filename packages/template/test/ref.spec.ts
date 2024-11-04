import { signal } from '@estjs/signal';
import { h as _h$, template as _template$, useRef } from '../src';
import { mount } from './testUtils';

describe('html element ref', () => {
  const _tmpl$ = _template$('<div>ref');

  let normal;
  let app;

  let normalRef;
  let signalRef;

  function normalValue() {
    const ref = (normalRef = useRef());
    return _h$(_tmpl$, {
      '1': {
        ref,
      },
    });
  }

  function App() {
    const ref = (signalRef = signal());
    return _h$(_tmpl$, {
      '1': {
        ref,
      },
    });
  }

  beforeEach(() => {
    normal = mount(normalValue);
    app = mount(App);
  });

  afterEach(() => {
    normalRef = null;
    signalRef = null;
    normal = null;
    app = null;
  });
  it('should work with normal value', () => {
    expect(normal.text()).toBe('ref');
    expect(normalRef.value.innerHTML).toBe('ref');
  });

  it('should work with signal value', () => {
    expect(app.text()).toBe('ref');
    expect(signalRef.value.innerHTML).toBe('ref');
  });
});
