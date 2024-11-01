import { mount } from './testUtils';
import FragmentAbbr from './snippet/FragmentAbbr';
import FragmentRoot from './snippet/Fragment';
describe('fragmentNode', () => {
  let app;
  let app2;

  beforeEach(() => {
    app = mount(FragmentRoot);
    app2 = mount(FragmentAbbr);
  });

  afterEach(() => {});

  it('should work with fragment node', () => {
    expect(app.innerHTML()).toMatchInlineSnapshot(
      `"<div class="fragment-node"><div class="fragment-node"><p>component-1</p><div><h1>App1</h1></div><p>component-2</p><p>component-3</p><div class="fragment-node"><h1>App2</h1></div><p>component-4</p><div class="fragment-node"><p>component-5</p></div><p>component-6</p><div class="fragment-node"><h1>App3</h1></div><p>component-6</p><div class="fragment-node"><p>component-7</p><p>component-8</p></div><p>component-9</p><div class="fragment-node"><h1>App4</h1></div></div></div>"`,
    );
    expect(app2.innerHTML()).toMatchInlineSnapshot(
      `"<div class="fragment-node"><div class="fragment-node"><p><div class="fragment-node"><h1>App1</h1></div>component-1</p><!----><p>component-2</p><p><div class="fragment-node"><h1>App2</h1></div>component-3</p><!----><p>component-4</p><p>component-5</p><p><div class="fragment-node"><h1>App3</h1></div>component-6</p><!----><p>component-6</p><p>component-7</p><p>component-8</p><p>component-9</p><p></p><div class="fragment-node"><h1>App4</h1></div></div></div>"`,
    );
  });
});
