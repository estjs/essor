function App() {
  const $v = 'hello world';

  return (
    <div>
      <p>{$v}</p>
      <input type="text" bind:value={$v} />
    </div>
  );
}
(<App />).mount(document.querySelector('#app')!);
