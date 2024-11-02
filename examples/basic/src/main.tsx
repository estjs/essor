function App() {
  const $v = 'Hello, World!';

  return (
    <>
      <p key={$v}>{$v}</p>
      <input type="text" bind:value={$v} />
    </>
  );
}

(<App></App>).mount(document.body.querySelector('#app')!);
