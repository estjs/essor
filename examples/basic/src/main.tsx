function App() {
  const $v = 'Hello, World!';

  return (
    <div>
      <p>{$v}</p>
      <input type="text" bind:value={$v} />
    </div>
  );
}
(<App />).mount(document.querySelector('#app')!);
