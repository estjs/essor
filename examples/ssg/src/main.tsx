import { renderToString } from 'essor';
export function Com(props) {
  return <div>{props.count}</div>;
}

function App() {
  const $value = 'hello world';
  return (
    <div>
      <p>{$value}</p>
      <Com count={$value}></Com>
      <input type="text" bind:value={$value} />
    </div>
  );
}

console.log(renderToString(App));

document.querySelector('#app')!.innerHTML = renderToString(App);
