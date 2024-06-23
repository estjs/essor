function App() {
  let $v = 1;
  return (
    <>
      <input type="text" bind:value={$v} step={1} updateValue={v => ($v = v)} />
    </>
  );
}
(<App />).mount(document.querySelector('#app')!);
