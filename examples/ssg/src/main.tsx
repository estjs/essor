import { type InjectionKey, useInject, useProvide, reactive } from 'essor';

const ProvideKey = Symbol('ProvideKey') as InjectionKey<{ count: number }>;

function Com() {
  const injectValue = useInject(ProvideKey)!;
  return <div>inject value:{injectValue.count}</div>;
}

function App() {
  const value = reactive({ count: 0 });
  useProvide<any>(ProvideKey, { count: 1 });
  return (
    <div>
      <Com></Com>
      {value.count}
    </div>
  );
}

(<App />).mount(document.querySelector('#app')!);
