import { type InjectionKey, useSignal } from 'essor';

export const ProvideKey: InjectionKey<{ count: number }> = Symbol('ProvideKey');
function App() {
  const count = useSignal(0);

  setInterval(() => {
    count.value++;
  }, 600);

  const reset = () => {
    count.value = 0;
  };
  return <div onClick={() => reset()}>{count.value}</div>;
}

const html = (<App />).mount();

document.querySelector('#app')!.innerHTML = html;
