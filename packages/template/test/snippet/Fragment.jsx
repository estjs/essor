import { signal as _signal$ } from '@estjs/signal';
import { Fragment as _fragment$, h as _h$, template as _template$ } from '../../src';
const _tmpl$ = _template$('<div><h1>App1'),
  _tmpl$2 = _template$('<h1>App2'),
  _tmpl$3 = _template$('<h1>App3'),
  _tmpl$4 = _template$('<h1>App4'),
  _tmpl$5 = _template$('<p>component-1</p>'),
  _tmpl$6 = _template$('<p>component-2</p>'),
  _tmpl$7 = _template$('<p>component-3</p>'),
  _tmpl$8 = _template$('<p>component-4</p>'),
  _tmpl$9 = _template$('<p>component-5'),
  _tmpl$10 = _template$('<p>component-6</p>'),
  _tmpl$11 = _template$('<p>component-6</p>'),
  _tmpl$12 = _template$('<p>component-7</p><p>component-8</p>'),
  _tmpl$13 = _template$('<p>component-9</p>'),
  _tmpl$14 = _template$('<p></p>'),
  _tmpl$15 = _template$('<input type="text"/>'),
  _tmpl$16 = _template$('');
const App1 = () => {
  return _h$(_tmpl$, {});
};
const App2 = () => {
  return _fragment$('', {
    children: _h$(_tmpl$2, {}),
  });
};
const App3 = () => {
  return _fragment$('', {
    children: _h$(_tmpl$3, {}),
  });
};
const App4 = () => {
  return _fragment$('', {
    children: _h$(_tmpl$4, {}),
  });
};
function FragmentComponent() {
  return _fragment$('', {
    children: [
      _h$(_tmpl$5, {}),
      _h$(App1, {}),
      _h$(_tmpl$6, {}),
      _h$(_tmpl$7, {}),
      _h$(App2, {}),
      _h$(_tmpl$8, {}),
      _fragment$('', {
        children: _h$(_tmpl$9, {}),
      }),
      _h$(_tmpl$10, {}),
      _h$(App3, {}),
      _h$(_tmpl$11, {}),
      _fragment$(_tmpl$12, {}),
      _h$(_tmpl$13, {}),
      _h$(App4, {}),
    ],
  });
}
export function App() {
  const $v = _signal$('Hello, World!');
  return _fragment$('', {
    children: [
      _h$(
        _tmpl$14,
        {
          '1': {
            children: [[() => $v.value, null]],
          },
        },
        $v.value,
      ),
      _h$(_tmpl$15, {
        '1': {
          value: $v,
          updateValue: _value => ($v.value = _value),
        },
      }),
    ],
  });
}
export default function FragmentRoot() {
  const $v = _signal$(true);
  setTimeout(() => {
    $v.value = false;
  }, 2e3);
  return _fragment$(_tmpl$16, {
    children: () => ($v.value ? _h$(FragmentComponent, {}) : _h$(App, {})),
  });
}
