import { type InjectionKey, reactive, useProvide } from 'essor';
import InjectComponent from './inject';

export const ProvideKey: InjectionKey<{ count: number }> = Symbol('ProvideKey');
function App() {
  const value = reactive({ count: 0 });
  useProvide(ProvideKey, value);

  setInterval(() => {
    value.count++;
  }, 600);

  return <InjectComponent></InjectComponent>;
}
(<App />).mount(document.querySelector('#app')!);
