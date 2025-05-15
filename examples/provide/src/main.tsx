import { type InjectionKey, provide, reactive } from 'essor';
import InjectComponent from './inject';

export const ProvideKey: InjectionKey<{ count: number }> = Symbol('ProvideKey');
function App() {
  const value = reactive({ count: 0 });
  provide(ProvideKey, value);

  setInterval(() => {
    value.count++;
  }, 600);

  return <InjectComponent />;
}
(<App />).mount(document.querySelector('#app')!);
