function App() {
  const $val = 1;
  return (
    <div>
      <p>{$val}</p>
      <input type="text" bind:value={$val} />
    </div>
  );
}
(<App />).mount(document.querySelector('#app')!);
