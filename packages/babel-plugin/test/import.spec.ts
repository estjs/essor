import { getTransform } from './transform-util';

const transformCode = getTransform('import');
describe('import symbol transform', () => {
  it('should add .value to primitive import', () => {
    const inputCode = `
    import $a from "./test";
      <div>{$a}</div>;
  `;

    const code = transformCode(inputCode);
    expect(code).toMatchInlineSnapshot(`
      "import $a from "./test";
      <div>{$a.value}</div>;"
    `);
  });
  it('should add .value to object import', () => {
    const inputCode = `
    import {$a} from "./test";
      <div>{$a.b}</div>;
  `;

    const code = transformCode(inputCode);
    expect(code).toMatchInlineSnapshot(`
      "import { $a } from "./test";
      <div>{$a.b}</div>;"
    `);
  });

  it('should add .value to deep object import', () => {
    const inputCode = `
    import {$a} from "./test";
      <div>{$a.b.c.d.e.f}</div>;
  `;

    const code = transformCode(inputCode);
    expect(code).toMatchInlineSnapshot(`
      "import { $a } from "./test";
      <div>{$a.b.c.d.e.f}</div>;"
    `);
  });
});
