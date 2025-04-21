import { createApp, signal } from 'essor';

function App() {
  const value = signal('Hello, World!');

  return (
    <div>
      <p>{value.value}</p>
      <input type="text" value={value.value} oninput={e => (value.value = e.target.value)} />
    </div>
  );
}

createApp(App, '#app');
