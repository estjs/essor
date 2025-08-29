function App() {
  const $list: string[] = [];
  let $val = '';
  const $checkedList: string[] = [];

  const addTodo = () => {
    if (!$val) {
      return;
    }
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
    </div>
  );
}
(<App />).mount(document.querySelector('#app')!);
