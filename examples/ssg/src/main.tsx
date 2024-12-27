import { type InjectionKey, inject, provide, useReactive } from 'aube';

const ProvideKey = Symbol('ProvideKey') as InjectionKey<{ count: number }>;

function Com() {
  const injectValue = inject(ProvideKey)!;
  return <div>inject value:{injectValue.count}</div>;
}

function App() {
  const value = useReactive({ count: 0 });
  provide<any>(ProvideKey, { count: 1 });
  return (
    <div>
      <Com></Com>
      {value.count}
    </div>
  );
}

(<App />).mount(document.querySelector('#app')!);
