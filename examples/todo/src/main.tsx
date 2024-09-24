const C1 = () => <div>test1</div>;
const C2 = () => <div>test2</div>;
const C3 = () => <div>test3</div>;

const C4 = () => (
  <div>
    <C2></C2>
    <div>test4</div>
    <C1></C1>
    <C3></C3>
  </div>
);
function App() {
  const $list: string[] = [];
  let $val: string = '';
  const $checkedList: string[] = [];

  const addTodo = () => {
    if (!$val) return;
    $list.push($val);
    $val = '';
  };

  const deleteTodo = (index: number) => {
    $list.splice(index, 1);
  };

  const itemChecked = (e: Event, item: string) => {
    if ((e.target as HTMLInputElement)?.checked) {
      $checkedList.push(item);
    } else {
      $checkedList.splice($checkedList.indexOf(item), 1);
    }
  };
  return (
    <div>
      <input type="text" bind:value={$val} />
      <button onClick={addTodo}>Add</button>

      <ul>
        {$list.map((item, index) => (
          <li>
            <input type="checkbox" onChange={e => itemChecked(e, item)} />
            <span>{item}</span>
            <button onClick={() => deleteTodo(index)}>{`del-${index}`}</button>
          </li>
        ))}
      </ul>

      <C4></C4>
    </div>
  );
}
(<App />).mount(document.querySelector('#app')!);
