import { type InjectionKey, useProvide, useReactive } from 'essor';
import InjectComponent from './inject';

export const ProvideKey: InjectionKey<{ count: number }> = Symbol('ProvideKey');
function App() {
  const value = useReactive({ count: 10 });
  useProvide(ProvideKey, value);

  setInterval(() => {
    value.count++;
  }, 600);

  return <InjectComponent key={123}></InjectComponent>;
}
(<App />).mount(document.querySelector('#app')!);
