import { useSignal } from '../src';
import { h as _h$, template as _template$ } from '../src/template';
import { mount } from './test-utils';

describe('ref', () => {
  const _tmpl$ = _template$('<div>ref</div>');

  let normal;
  let signal;

  let normalRef;
  let signalRef;

  function normalValue() {
    return _h$(_tmpl$, {
      '1': {
        ref: r => (normalRef = r),
      },
    });
  }

  function signalValue() {
    const ref = (signalRef = useSignal());
    return _h$(_tmpl$, {
      '1': {
        ref,
      },
    });
  }

  beforeEach(() => {
    normal = mount(normalValue);
    signal = mount(signalValue);
  });

  afterEach(() => {
    normalRef = null;
    signalRef = null;
    normal = null;
    signal = null;
  });
  it('should work with normal value', () => {
    expect(normal.text()).toBe('ref');
    expect(normalRef.innerHTML).toBe('ref');
  });

  it('should work with signal value', () => {
    expect(signal.text()).toBe('ref');
    expect(signalRef.value.innerHTML).toBe('ref');
  });
});
