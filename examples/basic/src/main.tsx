function App() {
  const $v = 'hello world';

  return (
    <div>
      <p key={$v}>{$v}</p>
      <input type="text" bind:value={$v} />
      {[1, 2, 3].map(v => (
        <p key={v}>{v}</p>
      ))}
    </div>
  );
}
(<App />).mount(document.querySelector('#app')!);
