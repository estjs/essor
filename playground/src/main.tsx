import { createStore, reactive } from 'essor';

const sharedStore = createStore({
  state: {
    value: 'hello',
  },
  actions: {
    updateValue(value) {
      this.value = value;
    },
  },
  getters: {
    doubleValue() {
      return this.value + this.value;
    },
  },
});

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
  const signal = reactive({
    value: 'hello',
  });

  return (
    <>
      <Component bind:value={signal.value}></Component>
    </>
  );
}
(<App />).mount(document.querySelector('#app')!);
