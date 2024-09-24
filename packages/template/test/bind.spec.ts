import { useSignal } from '@estjs/signal';
import { h as _h$, template as _template$ } from '../src';
import { mount } from './test-utils';

describe('bind value', () => {
  let inputRef;
  let componentRef;
  let signal;
  function inoutBind() {
    signal = useSignal('hello');
    return _h$(_template$('<input/>'), {
      '1': {
        value: signal.value,
        updateValue: _value => (signal.value = _value),
      },
    });
  }
  function Component(props) {
    return _h$(_template$('<p>'), {
      '1': {
        onClick: () => {
          props.updateValue('Component');
        },
        children: [[() => props.value, null]],
      },
    });
  }
  function componentBind() {
    const signal = useSignal('hello');
    return _h$(_template$(''), {
      '0': {
        children: [
          [
            () =>
              _h$(Component, {
                value: signal,
                updateValue: _value2 => (signal.value = _value2),
              }),
            null,
          ],
        ],
      },
    });
  }

  beforeEach(() => {
    inputRef = mount(inoutBind);
    componentRef = mount(componentBind);
  });

  afterEach(() => {
    inputRef = null;
    componentRef = null;
  });

  it('should work with input bind value change', () => {
    expect(inputRef.get('input').value).toBe('hello');
    inputRef.get('input').value = 'world';
    inputRef.get('input').dispatchEvent(new Event('input'));
    expect(inputRef.get('input').value).toBe('world');
  });

  it('should work with component bind value change', () => {
    expect(componentRef.get('p').innerHTML).toBe('hello');
    componentRef.get('p').click();
    expect(componentRef.get('p').innerHTML).toBe('Component');
  });
});
