function App() {
  const $v = 'hello world';

  return (
    <div>
      <p style={{ 'color': $v === 'hello world' ? 'green' : 'red', 'font-size': '20px' }}>{$v}</p>
      <input type="text" bind:value={$v} />
    </div>
  );
}
(<App />).mount(document.querySelector('#app')!);
