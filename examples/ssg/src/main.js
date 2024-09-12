import { h as _h$, useSignal as _signal$, template as _template$ } from 'essor';
const _tmpl$ = _template$('<div><p></p><input type="text"/>');
export function App() {
  const $value = _signal$('hello world');
  return _h$(_tmpl$, {
    2: {
      children: [[() => $value.value, null]],
    },
    3: {
      value: $value,
      updateValue: _value => ($value.value = _value),
    },
  });
}
