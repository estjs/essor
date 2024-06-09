import { useEffect, useReactive } from 'essor';

const MyComponent = ({ val, ...rest }) => {
  useEffect(() => {
    console.log('useEffect', rest);
  });
  return (
    <p
      onClick={() => {
        rest.value = 'xxxx';
      }}
    >
      {rest.value}
      {val}
      {rest.val2}
    </p>
  );
};

const AnotherComponent = ({ name, age }) => {
  return (
    <div>
      {name}
      {age}
    </div>
  );
};

function App() {
  const signal = useReactive<{ value: string }>({
    value: 'hello',
  });

  let val = 1;
  const val2 = '123';

  setTimeout(() => {
    val = 2;
  }, 2000);

  function updateValue(value: string) {
    console.log('updateValue', value);

    signal.value = value;
  }

  return (
    <>
      <MyComponent bind:value={signal.value} updateValue={updateValue} val={val} val2={val2} />
      <AnotherComponent name="John" age={30} />
    </>
  );
}

// 渲染 App 组件
(<App />).mount(document.querySelector('#app')!);
