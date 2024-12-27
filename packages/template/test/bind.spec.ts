import { useSignal } from '@aube/signal';
import { h as _h$ } from '../src';
import { mount } from './testUtils';

describe('bind value', () => {
  let inputRef;
  let componentRef;
  let signalValue;
  function inoutBind() {
    signalValue = useSignal('hello');
    return _h$('input', {
      value: signalValue.value,
      updateValue: _value => (signalValue.value = _value),
    });
  }
  function Component(props) {
    return _h$('p', {
      onClick: () => {
        props.updateValue('Component');
      },
      children: [[() => props.value, null]],
    });
  }
  function componentBind() {
    const signalValue = useSignal('hello');
    return _h$('', {
      children: [
        [
          () =>
            _h$(Component, {
              value: signalValue,
              updateValue: _value2 => (signalValue.value = _value2),
            }),
          null,
        ],
      ],
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
