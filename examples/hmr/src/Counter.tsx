/**
 * HMR State Test
 * Try updating this file (e.g. change color). The count should NOT reset.
 */
export function Counter() {
  // Local state
  let $count = 0;

  const inc = () => $count++;
  const dec = () => $count--;

  return (
    <div class="counter-component">
      <h3 class="counter-title">🔢 Stateful Component</h3>
      <p class="counter-display">{$count}</p>
      <div class="counter-buttons">
        <button class="counter-btn-decrease" onClick={dec}>
          - Decrease
        </button>
        <button class="counter-btn-increase" onClick={inc}>
          + Increase
        </button>
      </div>
      <p class="counter-info">State is preserved during HMR updates</p>
    </div>
  );
}
