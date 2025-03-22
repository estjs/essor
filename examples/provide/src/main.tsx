import { type InjectionKey, provide, reactive } from 'est';
import InjectComponent from './inject';

export const ProvideKey: InjectionKey<{ count: number }> = Symbol('ProvideKey');
function App() {
  const value = reactive({ count: 0 });
  provide(ProvideKey, value);

  setInterval(() => {
    value.count++;
  }, 600);

  return <InjectComponent></InjectComponent>;
}
(<App />).mount(document.querySelector('#app')!);
