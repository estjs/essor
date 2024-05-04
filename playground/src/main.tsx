import { useSignal } from 'essor';

function Component(props) {
  return <p class={props.a}>{props.a}</p>;
}

function App() {
  const signal = useSignal('hello ');
  const props = { a: 'b' };
  const onClick = () => {
    signal.value = ' world';
  };
  return (
    <div class="red" props={props} onClick={onClick}>
      <p {...props}>{signal.value} </p>
      <Component a={signal.value}></Component>
    </div>
  );
}
(<App />).mount(document.querySelector('#app')!);
