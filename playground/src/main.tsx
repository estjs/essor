import { useEffect, useSignal } from 'essor';

function Component(props) {
  return (
    <p
      onClick={() => {
        props.updateValue('Component');
      }}
    >
      {props.value}
    </p>
  );
}

function App() {
  const signal = useSignal('hello ');

  useEffect(() => {
    console.log(signal.value);
  });

  return (
    <form action="" method="get" class="form-example">
      <div class="form-example">
        <label for="name">Enter your name: </label>
        <input type="text" name="name" id="name" bind:value={signal.value} required />
      </div>
      <div class="form-example">
        <label for="email">Enter your email: </label>
        <input type="email" name="email" id="email" required />
      </div>
      <div>
        <Component bind:value={signal.value}></Component>
      </div>
      <div class="form-example">
        <input type="submit" value="Subscribe!" />
      </div>
    </form>
  );
}
(<App />).mount(document.querySelector('#app')!);
