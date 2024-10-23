import { h as _h$, template } from 'essor';
import App from './demo';
import { Page2 } from './page2';
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
const _tmpl$ = template(
  '<h1 id="runtime-api"><a aria-hidden="true" href="#runtime-api" class="header-anchor">#</a>Runtime API</h1>\n\n\n<p>During theme development, we generally need the following key APIs to get the data or state of the page:</p>\n<h2 id="usepagedata"><a aria-hidden="true" href="#usepagedata" class="header-anchor">#</a>usePageData</h2>\n<div class="at-directive tip"><p class="at-directive-title">TIP</p><div class="at-directive-content"><p><code>usePageData</code> is a Hook used to get the data of the current page.</p></div></div>\n<!>\n<h2 id="content"><a aria-hidden="true" href="#content" class="header-anchor">#</a>Content</h2>\n<div class="at-directive tip"><p class="at-directive-title">TIP</p><div class="at-directive-content"><p><code>Content</code> is a Hook used to get the content of the current page.</p></div></div>\n<!>\n<h2 id="route-hook"><a aria-hidden="true" href="#route-hook" class="header-anchor">#</a>Route Hook</h2>\n<div class="at-directive tip"><p class="at-directive-title">TIP</p><div class="at-directive-content"><p><code>RouteHook</code> is a Hook used to get the routing information of the current page.</p></div></div>\n<!>\n<h2 id="example"><a aria-hidden="true" href="#example" class="header-anchor">#</a>Example</h2>\n<div class="at-directive tip"><p class="at-directive-title">TIP</p><div class="at-directive-content"><p><code>App</code> is an Essor component used to demonstrate the usage of key APIs during theme development.</p></div></div>\n',
);
function _createMdxContent(props) {
  const _components = {
    a: 'a',
    code: 'code',
    div: 'div',
    h1: 'h1',
    h2: 'h2',
    p: 'p',
    ...props.components,
  };
  return _h$(_tmpl$, {
    '0': {
      children: [
        [() => _h$(App, {}), 23],
        [() => _h$(App, {}), 39],
        [() => _h$(App, {}), 55],
        [() => _h$(App, {}), null],
      ],
    },
  });
}
export default function MDXContent(props = {}) {
  const { wrapper: MDXLayout } = props.components || {};
  let $v = true;

  setTimeout(() => {
    $v = false;
    console.log($v);
  }, 2000);
  return <div>{$v ? <_createMdxContent {...props}></_createMdxContent> : <Page2 />}</div>;
}

(<MDXContent />).mount(document.querySelector('#app')!);
