import { h } from './template';
import { MockNode, getInnerHTML, mockDocument } from './node-mock';
/**
 *
 * @param component
 * @param props
 * @returns string
 *
 *
 * @example const app = createSSRApp(App, { title: 'hello' })
 *              const html = renderToString(app)
 */
export function renderToString(component: any, props?): string {
  (globalThis.document as unknown as any) = mockDocument;
  (globalThis.Node as unknown as any) = MockNode;
  const dom = mockDocument.createElement('div');

  component.mount(dom, props);

  //@ts-ignore
  return getInnerHTML(dom.children[0]);
}

/**
 *
 * @param Component
 * @param props
 *
 * @example const app = createSSRApp(App, { title: 'hello' })
 *            // in client
 *            app.mount(document.querySelector('#app'))
 */
export function createSSRApp(Component: any, props) {
  return h(Component, props || {});
}
