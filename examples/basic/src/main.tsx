import { useComputed } from 'essor';
import { Com } from './Com';

function App() {
  const $v = 'hello world';

  const value = useComputed(() => {
    return $v
      ? {
          color: 'red',
        }
      : {
          color: 'blue',
        };
  });

  return (
    <div>
      <p class={$v === 'hello world' ? 'red' : 'blue'}>{$v}</p>
      <input type="text" bind:value={$v} />
      <Com value={value} />
    </div>
  );
}
(<App />).mount(document.querySelector('#app')!);
