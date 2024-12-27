import { Fragment as _fragment$, h as _h$, template as _template$ } from '../../src';
import { useComputed, useSignal } from '@aube/signal';

const _tmpl$ = _template$ ('<div><p></p><input type="text"/>');
export default function App() {
  const $v = useSignal('Hello, World!');

  return  _h$(_tmpl$, {
    '2': {
      style: {
        'color': useComputed(() => $v.value === 'Hello, World!' ? 'red' : 'blue'),
        'font-size': useComputed(() => $v.value === 'Hello, World!' ? '30px' : '12px'),
      },
      children: [[() => $v.value, null]],
    },
    '3': {
      value: $v,
      updateValue: _value => ($v.value = _value),
    },
  });
}
