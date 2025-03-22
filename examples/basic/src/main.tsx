import { createApp, signal } from '@estjs/core';

function App() {
  const value = signal('Hello, World!');

  return (
    <>
      <p>{value}</p>
      <input type="text" bind:value={value} />
    </>
  );
}

createApp(App, '#app');
