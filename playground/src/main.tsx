import { useReactive } from 'essor';

function Component(props) {
  return (
    <p
      onClick={() => {
        props['update:value']('Component');
      }}
    >
      {props.value}
      {props.val}
    </p>
  );
}

function App() {
  const signal = useReactive({
    value: 'hello',
  });

  let val = 1;

  setTimeout(() => {
    val = 2;
  }, 2000);

  return (
    <>
      <Component bind:value={signal.value} val={val}></Component>
    </>
  );
}
(<App />).mount(document.querySelector('#app')!);
