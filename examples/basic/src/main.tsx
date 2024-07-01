function App() {
  const $v = 1;
  return (
    <>
      <p>{$v}</p>
      <input type="text" bind:value={$v} />
    </>
  );
}
(<App />).mount(document.querySelector('#app')!);
