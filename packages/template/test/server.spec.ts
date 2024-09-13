import { useSignal as _signal$ } from '@estjs/signal';
import { ssg as _ssg$, renderToString } from '../src';
export function Com(props) {
  return _ssg$(_tmpl$, {
    '1': {
      children: [[() => props.count, null]],
    },
  });
}
const _tmpl$ = ['<div>', '</div>'],
  _tmpl$2 = ['<div><p>', '</p>', '<!><input', ' type="text"', '/>', '</div>'];
function App() {
  const $value = _signal$('hello world');
  return _ssg$(_tmpl$2, {
    '1': {
      children: [
        [() => $value.value, null],
        [
          () =>
            _ssg$(Com, {
              count: $value,
            }),
          3,
        ],
      ],
    },
    '4': {
      value: $value,
      updateValue: _value => ($value.value = _value),
    },
  });
}

describe('server render', () => {
  it('should work renderToString', () => {
    const html = renderToString(App);
    // eslint-disable-next-line prettier/prettier
    expect(html).toMatchInlineSnapshot(`"<div><p>hello world </p><div>hello world </div><input type="text" value="hello world"/></div>"`);
  });
});
