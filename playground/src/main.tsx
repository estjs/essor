import { useSignal } from 'essor';

function Component(props) {
  return (
    <p
      onClick={() => {
        props['update:value']('Component');
      }}
    >
      {props.value}
    </p>
  );
}

function App() {
  const signal = useSignal('hello ');

  return (
    <>
      <Component bind:value={signal.value}></Component>
    </>
  );
}
(<App />).mount(document.querySelector('#app')!);
