function App() {
  const $v = 1;

  return (
    <div>
      <p>{$v}</p>
      <input type="text" bind:value={$v} />
    </div>
  );
}
(<App />).mount(document.querySelector('#app')!);
