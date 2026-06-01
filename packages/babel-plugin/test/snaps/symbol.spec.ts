import { getTransform } from './transform';

const transformCode = getTransform('symbol');
describe('transform symbol', () => {
  it('should work with basic types', () => {
    const list = [false, true, 0, 1, '1', `${1}23`, null, undefined, Number.NaN];

    for (const item of list) {
      expect(transformCode(`const $a = ${item}; $a = 1`)).toMatchSnapshot();
    }
  });

  it('should work with array', () => {
    const list = ['[1,2,3]', '[1,{a:1},3,4]', '[1,2,3,4,5]'];
    for (const item of list) {
      expect(transformCode(`const $a = ${item}; $a = 2`)).toMatchSnapshot();
    }
  });
  it('should work with object', () => {
    const list = ['{a:1}', '{a:1,b:2}', '{a:1,b:{c:1}}'];
    for (const item of list) {
      // if has assignment, transform signal
      expect(transformCode(`const $a = ${item}; $a = 2`)).toMatchSnapshot();
      expect(transformCode(`const $a = ${item}; `)).toMatchSnapshot();
    }
  });

  it('should work with const function transform computed', () => {
    const list = ['() => 1', '(a) => a + 1'];
    for (const item of list) {
      expect(transformCode(`const $a = ${item}; $a = 2`)).toMatchSnapshot();
    }
  });

  it('should work with let function transform computed', () => {
    const list = ['() => 1', '(a) => a + 1'];
    for (const item of list) {
      expect(transformCode(`let $a = ${item}; $a = 2`)).toMatchSnapshot();
    }
  });
  it('should work with object pattern', () => {
    const input = `
      const {$a,b} = {$a:1,b:2};
      const [$c,d] = [1,2];
      const [{$d,e}] = [{$d:1,e:2}];
      console.log($a,b);
      console.log($c,d);
      console.log($d,e);
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });
  it('should work with object pattern alias', () => {
    const input = `
      const {a:$a,b} = {a:1,b:2};
      const [{d:$d}] = [{d:1,e:2}];
      console.log($a,b);
      console.log($d,);
  `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('should work with import value', () => {
    const input = `
      import {$a} from 'a';
      import {b} from 'b';
      console.log($a,b);
  `;

    expect(transformCode(input)).toMatchSnapshot();
  });

  it('should work with array index', () => {
    const input = `
      const $a = [1];
      console.log($a[0]);
  `;

    expect(transformCode(input)).toMatchSnapshot();
  });
  it('should not work with add value symbol', () => {
    const input = `
      const $a = [1];
      $a.value.push(2);
  `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('should transform signal in arrow function expression body', () => {
    const input = `
      let $todos = [];
      watch(() => $todos, val => { console.log(val); });
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('should transform signal in arrow function expression body with deep option', () => {
    const input = `
      let $todos = [];
      let $filter = 'all';
      watch(() => $todos, val => {
        localStorage.setItem('key', JSON.stringify(val));
      }, { deep: true });
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('should not transform signal used as arrow function parameter', () => {
    const input = `
      let $a = 1;
      const fn = ($a) => $a + 1;
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('should transform signal in nested arrow expression body', () => {
    const input = `
      let $count = 0;
      const getter = () => $count;
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('should keep reactivity when destructuring a signal object', () => {
    // `$`-prefixed targets become computed (reactive); plain targets snapshot.
    const input = `
      let $obj = { a: 1, b: 2 };
      const { $a, b } = $obj;
      console.log($a, b);
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('should keep reactivity when destructuring a signal array', () => {
    const input = `
      let $items = [1, 2, 3];
      const [$first, second] = $items;
      console.log($first, second);
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('should support aliased destructuring of a signal object', () => {
    const input = `
      let $obj = { a: 1, b: 2 };
      const { a: $a, b } = $obj;
      console.log($a, b);
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('should support nested destructuring of a signal object', () => {
    const input = `
      let $obj = { n: { x: 1 }, m: 2 };
      const { n: { $x, z }, m } = $obj;
      console.log($x, z, m);
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('should snapshot plain destructuring of a signal (reads .value)', () => {
    const input = `
      let $obj = { a: 1, b: 2 };
      const { a, b } = $obj;
      console.log(a, b);
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('should support default values and rest in signal destructuring', () => {
    const input = `
      let $obj = { a: 1, b: 2, c: 3 };
      const { $a = 9, ...rest } = $obj;
      let $items = [1, 2, 3];
      const [head, ...$tail] = $items;
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });
});

const transformCustomSignalPrefix = getTransform('symbol', { signalPrefix: '__' });
describe('transform custom signalPrefix', () => {
  it('should work with basic types', () => {
    const list = [false, true, 0, 1, '1', `${1}23`, null, undefined, Number.NaN];
    for (const item of list) {
      expect(transformCustomSignalPrefix(`const __a = ${item}; __a = 1`)).toMatchSnapshot();
    }
  });
});
