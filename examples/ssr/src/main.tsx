import { hydrate, renderToString } from 'essor';
function Com1(props) {
  const children = props.children;
  return <div>111{children}</div>;
}

function Com2() {
  return <div>222</div>;
}

function Com3() {
  return (
    <div>
      <Com5></Com5>
    </div>
  );
}

function Com5() {
  return (
    <div>
      <Com2></Com2>
      <Com6></Com6>
    </div>
  );
}

function Com6() {
  return <div>666</div>;
}

function Com4() {
  return (
    <div>
      444
      <Com1>
        <Com3></Com3>
      </Com1>
    </div>
  );
}

function App() {
  const $value = 'hello world';
  return (
    <div>
      <p>{$value}</p>
      <div>
        111
        <div>
          222<Com4></Com4>
        </div>
      </div>
      <input bind:value={$value} type="text" val={$value} placeholder="test" val2={$value} />
    </div>
  );
}

const html = renderToString(App);
console.log(html);
document.querySelector('#app')!.innerHTML = html;

hydrate(App, '#app');

// (<App></App>).mount(document.querySelector('#app')!);
