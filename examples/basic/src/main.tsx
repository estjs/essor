import { useEffect } from 'essor';

function App() {
  const $v = 'hello world';

  useEffect(() => {
    console.log($v);
  });

  return (
    <div>
      <p class={$v === 'hello world' ? 'red' : 'blue'}>{$v}</p>
      <input type="text" bind:value={$v} />
    </div>
  );
}
(<App />).mount(document.querySelector('#app')!);
