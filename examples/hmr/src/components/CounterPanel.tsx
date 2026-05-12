import { INCREMENT_LABEL } from '../config';
import { decrement, increment, reset } from '../actions';
import { getDoubledCount, getParity } from '../selectors';
import { demoState } from '../state';

export function CounterPanel() {
  return (
    <section class="stack" data-test="hmr-counter-panel">
      <h2>Stateful Counter</h2>
      <div class="row">
        <button onClick={decrement}>Decrement</button>
        <button onClick={increment}>{INCREMENT_LABEL}</button>
        <button onClick={reset}>Reset</button>
      </div>
      <p>
        Count: <strong data-test="hmr-count">{demoState.count.value}</strong>
      </p>
      <p>
        Double: <strong data-test="hmr-double">{getDoubledCount()}</strong>
      </p>
      <p>
        Parity: <strong data-test="hmr-parity">{getParity()}</strong>
      </p>
      <p>
        Last action: <strong data-test="hmr-last-action">{demoState.lastAction.value}</strong>
      </p>
    </section>
  );
}
