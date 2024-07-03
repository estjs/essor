import { onMount } from 'essor';

function App() {
  let $v = 1;
  onMount(() => {
    $v++;
    console.log($v);
  });
  return (
    <>
      {$v}
      <input type="text" bind:value={$v} />
    </>
  );
}
(<App />).mount(document.querySelector('#app')!);
