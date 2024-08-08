function App() {
  const $v = 1;

  return (
    <div>
      <p
        style={{
          color: $v > 1 ? 'red' : 'blue',
        }}
      >
        {$v}
      </p>
      <input type="text" bind:value={$v} />
    </div>
  );
}
(<App />).mount(document.querySelector('#app')!);
