import { mount } from './testUtils';
describe('fragmentNode', () => {
  let app;
  let app2;

  beforeEach(async () => {
    const FragmentRoot = await import('./snippet/Fragment');
    const FragmentAbbr = await import('./snippet/FragmentAbbr');
    app = mount(FragmentRoot.default);
    app2 = mount(FragmentAbbr.default);
  });

  afterEach(() => {});

  it('should work with fragment node', () => {
    expect(app.innerHTML()).toMatchInlineSnapshot(
      `"<p>component-1</p><div><h1>App1</h1></div><p>component-2</p><p>component-3</p><h1>App2</h1><p>component-4</p><p>component-5</p><p>component-6</p><h1>App3</h1><p>component-6</p><p>component-7</p><p>component-8</p><p>component-9</p><h1>App4</h1>"`,
    );
    expect(app2.innerHTML()).toMatchInlineSnapshot(
      `"<p>component-1</p><h1>App1</h1><!----><p>component-2</p><p>component-3</p><h1>App2</h1><!----><p>component-4</p><p>component-5</p><p>component-6</p><h1>App3</h1><!----><p>component-6</p><p>component-7</p><p>component-8</p><p>component-9</p><p></p><h1>App4</h1>"`,
    );
  });
});
