function Com2({ ...rest }) {
  return (
    <div>
      {rest.v}
      {rest.val}
      {rest.xxx}
    </div>
  );
}
function Com({ ...rest }) {
  return (
    <div>
      {rest.v}
      {rest.val}
      {rest.xxx}
      <Com2 v={rest.v} val={1} xxx={123}></Com2>
    </div>
  );
}

function App() {
  const $v = 1;
  return (
    <>
      <Com v={$v} val={1} xxx={123}></Com>;
      <input type="text" bind:value={$v} />
    </>
  );
}
(<App />).mount(document.querySelector('#app')!);
