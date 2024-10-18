import { useEffect } from 'essor';

function App() {
  const $v = 'hello world';

  useEffect(() => {
    console.log($v);
  });

  return (
    <div>
      <p style={{ 'color': $v === 'hello world' ? 'green' : 'red', 'font-size': '20px' }}>{$v}</p>
      <input type="text" bind:value={$v} />
    </div>
  );
}
(<App />).mount(document.querySelector('#app')!);
