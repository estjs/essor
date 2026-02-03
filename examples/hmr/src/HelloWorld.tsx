/**
 * HMR Update Test
 * Try changing the text below. It should update instantly without reload.
 */
import { VERSION } from './constants';

export function HelloWorld() {
  return (
    <div class="hello-world-component">
      <h3 class="hello-world-title">👋 Hello World</h3>
      <p class="hello-world-description">Edit this text to see HMR updates instantly.</p>
      <p class="hello-world-version">Current Version: {VERSION}</p>
    </div>
  );
}
