import { Fragment } from 'essor';

function Com() {
  return <div>com</div>;
}
function Com2() {
  return <div>com2</div>;
}
function App() {
  const $v = 'Hello, World!';

  return (
    <Fragment>
      <Com></Com>
      <p>{$v}</p>
      <input type="text" bind:value={$v} />
      {$v !== 'Hello, World!' ? <Com></Com> : <Com2></Com2>}
    </Fragment>
  );
}
(<App />).mount(document.querySelector('#app')!);
