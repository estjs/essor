import { signal } from 'essor';
const A = [
  'pretty',
  'large',
  'big',
  'small',
  'tall',
  'short',
  'long',
  'handsome',
  'plain',
  'quaint',
  'clean',
  'elegant',
  'easy',
  'angry',
  'crazy',
  'helpful',
  'mushy',
  'odd',
  'unsightly',
  'adorable',
  'important',
  'inexpensive',
  'cheap',
  'expensive',
  'fancy',
];
const C = [
  'red',
  'yellow',
  'blue',
  'green',
  'pink',
  'brown',
  'purple',
  'brown',
  'white',
  'black',
  'orange',
];
const N = [
  'table',
  'chair',
  'house',
  'bbq',
  'desk',
  'car',
  'pony',
  'cookie',
  'sandwich',
  'burger',
  'pizza',
  'mouse',
  'keyboard',
];
let nextId = 1;
const random = (max) => Math.round(Math.random() * 1000) % max;
const buildData = (count) => {
  const data = Array.from({ length: count });
  for (let i = 0; i < count; i++) {
    data[i] = {
      id: nextId++,
      label: `${A[random(A.length)]} ${C[random(C.length)]} ${N[random(N.length)]}`,
    };
  }
  return data;
};
const data = signal([]);
const selected = signal(0);
const actions = {
  run: () => {
    data.set(buildData(1000));
    selected.set(0);
  },
  runLots: () => {
    const data2 = buildData(10000);
    console.log(data2);
    data.value = data2;
    selected.set(0);
  },
  add: () => {
    data.value = data.value.concat(buildData(1000));
  },
  update: () => {
    const _rows = data.value;
    for (let i = 0; i < _rows.length; i += 10) {
      _rows[i].label += ' !!!';
    }
    data.set(_rows);
  },
  clear: () => {
    data.set([]);
    selected.set(0);
  },
  swapRows: () => {
    const _rows = data.value;
    if (_rows.length > 998) {
      const d1 = _rows[1];
      const d998 = _rows[998];
      _rows[1] = d998;
      _rows[998] = d1;
      data.set(_rows);
    }
  },
  remove: (id) => {
    data.update(data => {
      const idx = data.findIndex((d) => d.id === id);
      return [...data.slice(0, idx), ...data.slice(idx + 1)];
    })
  },
  select: (id) => {
    selected.set(id);
  },
};
function Row(props) {
  return (
    <tr class={selected.value === props.item.id ? 'danger' : ''}>
      <td class="col-md-1">{props.item.id}</td>
      <td class="col-md-4">
        <a onClick={() => actions.select(props.item.id)}>{props.item.label}</a>
      </td>
      <td class="col-md-1">
        <a onClick={() => actions.remove(props.item.id)}>
          <span class="glyphicon glyphicon-remove" aria-hidden="true" />
        </a>
      </td>
      <td class="col-md-6" />
    </tr>
  );
}

function Button(props) {
  return (
    <div class="col-sm-6 smallpad">
      <button type="button" class="btn btn-primary btn-block" id={props.id}>
        {props.children}
      </button>
    </div>
  );
}

function Jumbotron() {
  return (
    <div class="jumbotron">
      <div class="row">
        <div class="col-md-6">
          <h1>Essor keyed</h1>
        </div>
        <div class="col-md-6">
          <div class="row">
            <Button id="run" onClick={() => actions.run()}>
              Create 1,000 rows
            </Button>
            <Button id="runlots" onClick={() => actions.runLots()}>
              Create 10,000 rows
            </Button>
            <Button id="add" onClick={() => actions.add()}>
              Append 1,000 rows
            </Button>
            <Button id="update" onClick={() => actions.update()}>
              Update every 10th row
            </Button>
            <Button id="clear" onClick={() => actions.clear()}>
              Clear
            </Button>
            <Button id="swaprows" onClick={() => actions.swapRows()}>
              Swap Rows
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Main() {
  return (
    <div class="container">
      <Jumbotron />
      <table class="table table-hover table-striped test-data">
        <tbody>
          {data.value.map(item => (
            <Row key={item.id} item={item} />
          ))}
        </tbody>
      </table>
      <span class="preloadicon glyphicon glyphicon-remove" aria-hidden="true" />
    </div>
  );
}

(<Main />).mount(document.querySelector('#app'));
