/**
 *     const router = signal('A');
    const key = Symbol('test-key');

 *     const ChildA = () => {
      const value = inject(key, 'default');
      return template(`<div>ChildA:${value}</div>`)();
    };

    const ChildB = () => {
      const value = inject(key, 'default');
      return template(`<div>ChildB:${value}</div>`)();
    };

    const Middle = () => {
      const el = document.createElement('div');
      insert(el, () => {
        return [router.value === 'A' ? createComponent(ChildA) : createComponent(ChildB)];
      });
      return el;
    };


    const Parent = () => {
      provide(key, 'root-value');
      return createComponent(Middle);
    };
*
 */

import { inject, provide, signal } from 'essor';

const key = Symbol('test-key');
const router = signal('A');
function ChildA() {
  const value = inject(key, 'default');
  return <div>ChildA:${value}</div>;
}

function ChildB() {
  const value = inject(key, 'default');
  return <div>ChildB:${value}</div>;
}

export function Middle() {
  return (
    <div onClick={() => (router.value = router.value === 'A' ? 'B' : 'A')}>
      {router.value === 'A' ? <ChildA /> : <ChildB />}
    </div>
  );
}

export function DynamicProvider() {
  provide(key, 'root-value');
  return <Middle />;
}
