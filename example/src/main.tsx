import { ssgRender } from 'essor';

function App() {
  const $value = 'hello word';
  return (
    <div>
      <p>{$value}</p>
      <input type="text" bind:value={$value} />
    </div>
  );
}

ssgRender(App, document.querySelector('#app')!);
