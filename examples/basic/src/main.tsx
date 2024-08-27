function App() {
  const $value = 'hello word';
  return (
    <div>
      <p>{$value}</p>
      <input type="text" bind:value={$value} />
    </div>
  );
}

(<App />).mount(document.querySelector('#app')!);
