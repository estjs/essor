import {
  BOUNDARY_NAME,
  BOUNDARY_STATUS,
  PRIMARY_ACTION_LABEL,
  PRIMARY_ACTION_STEP,
} from '../demo-content';
import { workbenchState } from '../demo-state';
import { DORMANT_BOUNDARY_LABEL } from './DormantBoundary';

function setCount(nextValue: number, action: string) {
  workbenchState.count.value = nextValue;
  workbenchState.lastAction.value = action;
}

function runPrimaryAction() {
  setCount(
    workbenchState.count.value + PRIMARY_ACTION_STEP,
    `${PRIMARY_ACTION_LABEL} +${PRIMARY_ACTION_STEP}`,
  );
}

function decrement() {
  setCount(workbenchState.count.value - 1, 'Decrement -1');
}

function reset() {
  setCount(0, 'Reset');
}

function getDoubledCount() {
  return workbenchState.count.value * 2;
}

function getCountParity() {
  return workbenchState.count.value % 2 === 0 ? 'even' : 'odd';
}

function getBoundarySummary() {
  return `${BOUNDARY_NAME} / ${BOUNDARY_STATUS} / ${DORMANT_BOUNDARY_LABEL}`;
}

export function CounterWorkbench() {
  return (
    <section class="stack" data-test="hmr-counter-panel">
      <h2>Interactive state</h2>
      <div class="row">
        <button onClick={decrement}>Decrement</button>
        <button onClick={runPrimaryAction}>{PRIMARY_ACTION_LABEL}</button>
        <button onClick={reset}>Reset</button>
      </div>
      <p>
        Count: <strong data-test="hmr-count">{workbenchState.count.value}</strong>
      </p>
      <p>
        Double: <strong data-test="hmr-double">{getDoubledCount()}</strong>
      </p>
      <p>
        Parity: <strong data-test="hmr-parity">{getCountParity()}</strong>
      </p>
      <p>
        Last action: <strong data-test="hmr-last-action">{workbenchState.lastAction.value}</strong>
      </p>
    </section>
  );
}

export function ModuleBoundaryPanel() {
  return (
    <section class="stack" data-test="hmr-module-panel">
      <h2>Hot module boundary</h2>
      <p data-test="hmr-module-label">Boundary: {BOUNDARY_NAME}</p>
      <p data-test="hmr-module-badge">Status: {BOUNDARY_STATUS}</p>
      <p data-test="hmr-module-summary">Summary: {getBoundarySummary()}</p>
      <p data-test="hmr-update-count">Runtime updates: {workbenchState.updates.value}</p>
    </section>
  );
}
