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
    <div style="border: 1px solid #ddd; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
      <h3>🔢 Stateful Component</h3>
      <p style="font-size: 2em; margin: 10px 0;">{$count}</p>
      <div style="gap: 10px; display: flex;">
        <button onClick={dec}>- Decrease</button>
        <button onClick={inc}>+ Increase</button>
      </div>
      <p style="color: #666; font-size: 0.8em; margin-top: 10px;">
        State is preserved during HMR updates
      </p>
    </div>
  );
}
