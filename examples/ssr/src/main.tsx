import { hydrate, renderToString } from 'aube';

function Com1(props) {
  const children = props.children;
  return <div>9{children}</div>;
}

function Com2() {
  return <div>10</div>;
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
  return <div>11</div>;
}

function Com4() {
  return (
    <div>
      8
      <Com1>
        <Com3></Com3>
      </Com1>
    </div>
  );
}

function App2() {
  const $value = 'Hello, World!2';
  return (
    <div>
      <p>{$value}</p>
      <div>
        3
        <div>
          4<Com4></Com4>
        </div>
      </div>
      <input bind:value={$value} type="text" val={$value} placeholder="test" val2={$value} />
    </div>
  );
}
function App3() {
  const $value = 'Hello, World!3';
  return (
    <div>
      <p>{$value}</p>
      <div>
        5{$value}
        <div>
          6<Com4></Com4>
        </div>
      </div>
      <input bind:value={$value} type="text" val={$value} placeholder="test" val2={$value} />
    </div>
  );
}
function App() {
  const $value = 'Hello, World!1';
  return (
    <div>
      <p>{$value}</p>
      <div>
        1{$value}2<App2></App2>
        <div>
          <App3></App3>7<Com4></Com4>
        </div>
      </div>
      <input bind:value={$value} type="text" val={$value} placeholder="test" val2={$value} />
    </div>
  );
}

const html = renderToString(App);
document.querySelector('#app')!.innerHTML = html;
hydrate(App, '#app');
