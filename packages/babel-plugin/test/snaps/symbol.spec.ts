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
      let $obj = {a:1,b:2};
      const {$a,b} = $obj;
      let $arr = [1,2];
      const [$c,d] = $arr;
      let $nested = [{d:1,e:2}];
      const [{$d,e}] = $nested;
      console.log($a,b);
      console.log($c,d);
      console.log($d,e);
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });
  it('should work with object pattern alias', () => {
    const input = `
      let $obj = {a:1,b:2};
      const {a:$a,b} = $obj;
      let $nested = [{d:1,e:2}];
      const [{d:$d}] = $nested;
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

describe('transform symbol — member access', () => {
  it('rewrites a signal used as a computed member key', () => {
    // `obj[$key]` reads the signal, so the key must become `$key.value`.
    const input = `
      let $key = 'a';
      const obj = { a: 1 };
      console.log(obj[$key]);
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('does not rewrite a signal used as a static member key', () => {
    // `obj.$key` is a property name, not a read — must stay untouched.
    const input = `
      let $key = 1;
      const obj = { $key: 5 };
      console.log(obj.$key);
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('rewrites both object and computed-key positions when nested', () => {
    const input = `
      let $arr = [10, 20];
      let $i = 0;
      console.log($arr[$i]);
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('rewrites a signal used as a computed object-literal key', () => {
    const input = `
      let $k = 'x';
      const o = { [$k]: 1 };
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('rewrites the object of a member assignment, not the assignment itself', () => {
    const input = `
      let $obj = { a: 1 };
      $obj.a = 2;
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('does not double-wrap an explicit .value read', () => {
    const input = `
      let $count = 0;
      console.log($count.value);
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('does not double-wrap an explicit optional .value read', () => {
    const input = `
      let $maybe = null;
      console.log($maybe?.value);
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });
});

describe('transform symbol — assignments & updates', () => {
  it('rewrites compound assignment operators', () => {
    const input = `
      let $x = 0;
      $x += 1;
      $x *= 2;
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('rewrites prefix and postfix update expressions', () => {
    const input = `
      let $x = 0;
      $x++;
      ++$x;
      $x--;
      --$x;
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });
});

describe('transform symbol — binding contexts left untouched', () => {
  it('does not mangle a rest parameter into invalid syntax', () => {
    // `...$args` is a binding; only body reads should gain `.value`.
    const input = `
      function f(...$args) {
        return $args;
      }
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('does not rewrite an export specifier local name', () => {
    const input = `
      let $a = 1;
      export { $a };
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('does not re-wrap an already-wrapped signal/computed call', () => {
    const input = `
      import { signal, computed } from 'essor';
      const $a = signal(1);
      const $b = computed(() => $a);
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });
});

describe('transform symbol — array destructuring edge cases', () => {
  it('skips holes in array patterns', () => {
    const input = `
      let $arr = [1, 2, 3];
      const [, $b, ] = $arr;
      console.log($b);
    `;
    expect(transformCode(input)).toMatchSnapshot();
  });

  it('supports default values in array destructuring targets', () => {
    const input = `
      let $arr = [1];
      const [$first = 9, $second = 8] = $arr;
      console.log($first, $second);
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

describe('transform symbol — $-prefixed store methods are not signals', () => {
  // The store exposes built-in methods as $-prefixed members ($patch, $reset,
  // $subscribe, $onAction, ...). These are MEMBER property keys, not bare
  // signal identifiers, so the signal transform must leave them untouched
  // (no `.value` rewrite). This guards against the symbol pass ever treating
  // `store.$patch` as a signal access.
  it('leaves store.$method() member calls intact', () => {
    const input = `
      const store = useStore();
      store.$patch({ count: 1 });
      store.$reset();
      store.$subscribe(cb);
      store.$onAction(cb);
      store.$unsubscribe(cb);
      store.$offAction(cb);
    `;
    const out = transformCode(input);
    expect(out).toContain('store.$patch(');
    expect(out).toContain('store.$reset(');
    expect(out).toContain('store.$subscribe(');
    expect(out).not.toContain('.value');
  });

  it('leaves optional-chained and computed store member access intact', () => {
    expect(transformCode(`store?.$patch({ a: 1 });`)).not.toContain('.value');
    expect(transformCode(`store["$patch"]({ a: 1 });`)).not.toContain('.value');
  });

  it('preserves the $subscribe return value capture', () => {
    const out = transformCode(`const stop = store.$subscribe(cb); stop();`);
    expect(out).toContain('store.$subscribe(');
    expect(out).not.toContain('.value');
  });
});
