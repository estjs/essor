function App() {
  const $v = 1;

  return (
    <div>
      <p>{$v}</p>
      {$v == 2 ? <p>Second render</p> : null}
      <input type="text" bind:value={$v} />
    </div>
  );
}
(<App />).mount(document.querySelector('#app')!);
