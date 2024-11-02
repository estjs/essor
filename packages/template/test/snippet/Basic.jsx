import { Fragment as _fragment$, h as _h$, template as _template$ } from '../../src';
import { useSignal } from '@estjs/signal';

const _tmpl$ = _template$ ('<div><p></p><input type="text"/>');
export default function App() {
  const $v = useSignal('Hello, World!');

  return  _h$(_tmpl$, {
    '2': {
      style: () => ({
        'color': $v.value === 'Hello, World!' ? 'green' : 'red',
        'font-size': $v.value === 'Hello, World!' ? '30px' : '12px',
      }),
      children: [[() => $v.value, null]],
    },
    '3': {
      value: $v,
      updateValue: _value => ($v.value = _value),
    },
  });
}
