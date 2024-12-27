import { type InjectionKey, provide, useReactive } from 'aube';
import InjectComponent from './inject';

export const ProvideKey: InjectionKey<{ count: number }> = Symbol('ProvideKey');
function App() {
  const value = useReactive({ count: 0 });
  provide(ProvideKey, value);

  setInterval(() => {
    value.count++;
  }, 600);

  return <InjectComponent></InjectComponent>;
}
(<App />).mount(document.querySelector('#app')!);
