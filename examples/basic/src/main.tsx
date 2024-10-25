import { h as _h$, useSignal as _signal$, template as _template$ } from 'essor';
const _tmpl$ = _template$('<div>app2'),
  _tmpl$2 = _template$('<div>app3'),
  _tmpl$3 = _template$('<div>com4'),
  _tmpl$4 = _template$('<div>com5'),
  _tmpl$5 = _template$('<div><p></p><input type="text"/>'),
  _tmpl$6 = _template$(
    '<h1 id="runtime-api"><a aria-hidden="true" href="#runtime-api" class="header-anchor">#</a>Runtime API</h1>\n\n\n<p>During theme development, we generally need the following key APIs to get the data or state of the page:</p>\n<h2 id="usepagedata"><a aria-hidden="true" href="#usepagedata" class="header-anchor">#</a>usePageData</h2>\n<div class="at-directive tip"><p class="at-directive-title">TIP</p><div class="at-directive-content"><p><code>usePageData</code> is a Hook used to get the data of the current page.</div></div>\n<!>\n<h2 id="content"><a aria-hidden="true" href="#content" class="header-anchor">#</a>Content</h2>\n<div class="at-directive tip"><p class="at-directive-title">TIP</p><div class="at-directive-content"><p><code>Content</code> is a Hook used to get the content of the current page.</div></div>\n<!>\n<h2 id="route-hook"><a aria-hidden="true" href="#route-hook" class="header-anchor">#</a>Route Hook</h2>\n<div class="at-directive tip"><p class="at-directive-title">TIP</p><div class="at-directive-content"><p><code>RouteHook</code> is a Hook used to get the routing information of the current page.</div></div>\n<!>\n<h2 id="example"><a aria-hidden="true" href="#example" class="header-anchor">#</a>Example</h2>\n<div class="at-directive tip"><p class="at-directive-title">TIP</p><div class="at-directive-content"><p><code>App</code> is an Essor component used to demonstrate the usage of key APIs during theme development.</div></div>\n',
  ),
  _tmpl$7 = _template$('<div>');
const App2 = () => {
  return _h$(_tmpl$, {});
};
function App3() {
  return _h$(_tmpl$2, {});
}
function Com4() {
  return _h$(_tmpl$3, {});
}
function Com5() {
  return _h$(_tmpl$4, {});
}
function App() {
  const $v = _signal$('Hello, World!');
  return _h$(_tmpl$5, {
    '2': {
      children: [[() => $v.value, null]],
    },
    '3': {
      value: $v,
      updateValue: _value => ($v.value = _value),
    },
  });
}
export const frontmatter = void 0;
export const toc = [
  {
    id: 'usepagedata',
    text: 'usePageData',
    depth: 2,
  },
  {
    id: 'content',
    text: 'Content',
    depth: 2,
  },
  {
    id: 'route-hook',
    text: 'Route Hook',
    depth: 2,
  },
  {
    id: 'example',
    text: 'Example',
    depth: 2,
  },
];
export const title = 'Runtime API';
function _createMdxContent(props) {
  return _h$(_tmpl$6, {
    '0': {
      children: [
        [() => _h$(App3, {}), 23],
        [() => _h$(App2, {}), 39],
        [() => _h$(Com4, {}), 55],
        [() => _h$(App, {}), null],
      ],
    },
  });
}
export default function MDXContent(props = {}) {
  const $v = _signal$(true);
  setTimeout(() => {
    $v.value = false;
  }, 2e3);
  return _h$(_tmpl$7, {
    '1': {
      children: [[() => ($v.value ? _createMdxContent(props) : _h$(Com5, {})), null]],
    },
  });
}
_h$(MDXContent, {}).mount(document.querySelector('#app'));
