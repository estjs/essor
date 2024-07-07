function App() {
  const $v = false;

  return (
    <footer>
      <div>
        {$v ? <a>{$v}</a> : null}
        <div></div>
      </div>

      <div></div>
    </footer>
  );
}
(<App />).mount(document.querySelector('#app')!);
