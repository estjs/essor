import { template as _template$, Fragment as _fragment$, h as _h$ } from "../../src";
import {useSignal as _signal$ } from "@estjs/signal"
const _tmpl$ = _template$("<h1>App1"),
  _tmpl$2 = _template$("<h1>App2"),
  _tmpl$3 = _template$("<h1>App3"),
  _tmpl$4 = _template$("<h1>App4"),
  _tmpl$5 = _template$("<p>component-1</p><!><p>component-2</p><p>component-3</p><!><p>component-4</p><p>component-5<p>component-6</p><!><p>component-6</p><p>component-7</p><p>component-8</p><p>component-9</p>"),
  _tmpl$6 = _template$("<p></p><input type=\"text\"/>"),
  _tmpl$7 = _template$("");
const App1 = () => {
  return _fragment$(_tmpl$, {});
};
const App2 = () => {
  return _fragment$(_tmpl$2, {});
};
const App3 = () => {
  return _fragment$(_tmpl$3, {});
};
const App4 = () => {
  return _fragment$(_tmpl$4, {});
};
function FragmentComponent() {
  return _fragment$(_tmpl$5, {
    "0": {
      "children": [[() => _h$(App1, {}), 3], [() => _h$(App2, {}), 8], [() => _h$(App3, {}), 15], [() => _h$(App4, {}), null]]
    }
  });
}
export function App() {
  const $v = _signal$("Hello, World!");
  return _fragment$(_tmpl$6, {
    "1": {
      "children": [[() => $v.value, null]]
    },
    "2": {
      "value": $v,
      "updateValue": _value => $v.value = _value
    }
  }, $v.value);
}
export default function Root() {
  let $v = _signal$(true);
  setTimeout(() => {
    $v.value = false;
  }, 2e3);
  return _fragment$(_tmpl$7, {
    "0": {
      "children": [[() => $v.value ? _h$(FragmentComponent, {}) : _h$(App, {}), null]]
    }
  });
}
