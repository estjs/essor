import { createApp, signal } from 'essor';

function App() {
  const value = signal('Hello, World!');

  return (
    <>
      <p>{value.value}</p>
    </>
  );
}

createApp(App, '#app');
