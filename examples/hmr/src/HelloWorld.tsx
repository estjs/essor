/**
 * HMR Update Test
 * Try changing the text below. It should update instantly without reload.
 */
import { VERSION } from './constants';

export function HelloWorld() {
  return (
    <div style="border: 1px solid #ddd; padding: 20px; border-radius: 8px; background: #f9f9f9;">
      <h3>👋 Hello World</h3>
      <p>Edit this text to see HMR updates instantly.</p>
      <p style="color: blue;">Current Version: {VERSION}</p>
    </div>
  );
}
