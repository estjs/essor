import { batch, createApp, shallowSignal } from 'essor';
// import './style.css';

/** @typedef {{ id: number, label: import('essor').Signal<string> }} Row */
/** @typedef {{
 * run: () => void,
 * runLots: () => void,
 * add: () => void,
 * update: () => void,
 * clear: () => void,
 * swapRows: () => void,
 * remove: (id: number) => void,
 * select: (id: number) => void
 * }} Actions */
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
/** @param {number} max */
const random = max => Math.round(Math.random() * 1000) % max;
/** @param {number} count @returns {Row[]} */
const buildData = count => {
  /** @type {Row[]} */
  const data = Array.from({ length: count });
  for (let i = 0; i < count; i++) {
    data[i] = {
      id: nextId++,
      label: shallowSignal(`${A[random(A.length)]} ${C[random(C.length)]} ${N[random(N.length)]}`),
    };
  }
  return data;
};
/** @type {import('essor').Signal<Row[]>} */
const data = shallowSignal([]);
const selected = shallowSignal(0);
/** @type {Actions} */
const actions = {
  run: () => {
    nextId = 1;
    data.value = buildData(1000);
    selected.value = 0;
  },
  runLots: () => {
    nextId = 1;
    data.value = buildData(10000);
    selected.value = 0;
  },
  add: () => {
    data.value = data.value.slice().concat(buildData(1000));
  },
  update: () => {
    batch(() => {
      const rows = data.value;
      for (let i = 0; i < rows.length; i += 10) {
        rows[i].label.value += ' !!!';
      }
    });
  },
  clear: () => {
    data.value = [];
    selected.value = 0;
  },
  swapRows: () => {
    const _rows = data.value.slice();
    if (_rows.length > 998) {
      const d1 = _rows[1];
      const d998 = _rows[998];
      _rows[1] = d998;
      _rows[998] = d1;
    }
    data.value = _rows;
  },
  /** @param {number} id */
  remove: id => {
    data.value = data.value.toSpliced(
      data.value.findIndex(d => d.id === id),
      1,
    );
  },
  /** @param {number} id */
  select: id => {
    selected.value = id;
  },
};
/** @param {{ id: string, onClick: () => void, children: unknown }} props */
function Button(props) {
  return (
    <div class="col-sm-6 smallpad">
      <button type="button" class="btn btn-primary btn-block" id={props.id} onClick={props.onClick}>
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
          <h1>Essor Benchmark Keyed</h1>
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
          {data.value.map(item => {
            const rowId = item.id;
            return (
                <tr key={rowId} class={selected.value === rowId ? 'danger' : ''}>
                <td class="col-md-1 1" textContent={rowId} />
                <td class="col-md-4 2">
                  <a onClick={() => actions.select(rowId)} textContent={item.label.value} />
                </td>
                <td class="col-md-1 3">
                  <a onClick={() => actions.remove(rowId)}>
                    <span class="glyphicon glyphicon-remove" aria-hidden="true" />
                  </a>
                </td>
                <td class="col-md-6 4" />
              </tr>
            );
          })}
        </tbody>
      </table>
      <span class="preloadicon glyphicon glyphicon-remove" aria-hidden="true" />
    </div>
  );
}

createApp(Main, '#app');
