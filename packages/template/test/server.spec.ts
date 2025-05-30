//  eslint-disable
import { useSignal as _signal$ } from '@estjs/signal';
import { ssg as _ssg$, hydrate, renderToString } from '../src';
export function Com(props) {
  return _ssg$(_tmpl$, {
    '1': {
      children: [[() => props.count, null]],
    },
  });
}
const _tmpl$ = ['<div>', '</div>'];
const _tmpl$2 = ['<div><p>', '</p>', '<!><input', ' type="text"', '/>', '</div>'];
function App() {
  const $value = _signal$('Hello, World!');
  return _ssg$(_tmpl$2, {
    '1': {
      children: [
        [() => $value.value, null],
        [() => _ssg$(Com, { count: $value }), 3],
      ],
    },
    '4': {
      value: $value,
      updateValue: _value => ($value.value = _value),
    },
  });
}

describe('ssg render', () => {
  const html = renderToString(App);
  const container = document.createElement('div');
  container.innerHTML = html;
  it('should work renderToString', () => {
    expect(html).toMatchInlineSnapshot(
      `"<div data-ci="1"><p data-ci="1"></p><!><input data-ci="1" type="text"/></div>"`,
    );
  });
  it('should work hydrate', () => {
    hydrate(App, container);
    expect(container.innerHTML).toMatchInlineSnapshot(
      `"<div data-ci="1"><p data-ci="1"></p><!----><input data-ci="1" type="text"></div>"`,
    );
  });
});
