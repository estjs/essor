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
      expect(transformCode(`const $a = ${item}; $a = 2`)).toMatchSnapshot();
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

  it('should work with array index ', () => {
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
});

const transformCustomSymbol = getTransform('symbol', { symbol: '__' });
describe('transform custom symbol', () => {
  it('should work with basic types', () => {
    const list = [false, true, 0, 1, '1', `${1}23`, null, undefined, Number.NaN];
    for (const item of list) {
      expect(transformCustomSymbol(`const __a = ${item}; __a = 1`)).toMatchSnapshot();
    }
  });
});
