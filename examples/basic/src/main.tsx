const App1 = () => {
  return (
    <>
      <h1>App1</h1>
    </>
  );
};

const App2 = () => {
  return (
    <>
      <h1>App2</h1>
    </>
  );
};

const App3 = () => {
  return (
    <>
      <h1>App3</h1>
    </>
  );
};

const App4 = () => {
  return (
    <>
      <h1>App4</h1>
    </>
  );
};

function FragmentComponent() {
  return (
    <>
      <p>component-1</p>
      <App1 />
      <p>component-2</p>
      <p>component-3</p>
      <App2 />
      <p>component-4</p>
      <>
        <p>component-5</p>
      </>
      <p>component-6</p>
      <App3 />

      <p>component-6</p>
      <>
        <p>component-7</p>
        <p>component-8</p>
      </>

      <p>component-9</p>
      <App4 />
    </>
  );
}

function App() {
  const $v = 'Hello, World!';

  return (
    <>
      <p key={$v}>{$v}</p>
      <input type="text" bind:value={$v} />
    </>
  );
}

export default function Root() {
  let $v = true;
  setTimeout(() => {
    $v = false;
  }, 2000);
  return <>{$v ? <FragmentComponent></FragmentComponent> : <App />}</>;
}

(<Root></Root>).mount(document.body.querySelector('#app')!);
