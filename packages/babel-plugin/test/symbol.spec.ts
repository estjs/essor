import { getTransform } from './transform-util';

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
});
