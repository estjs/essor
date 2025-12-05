import { Portal, createApp, signal } from 'essor';

function App() {
  const value = signal('Hello, World!');

  return (
    <div id="portal-target">
      <div>
        <Portal target="#portal-target">
          <div>
            <p>{value.value}</p>
            <input type="text" value={value.value} oninput={e => (value.value = e.target.value)} />
          </div>
        </Portal>
      </div>
    </div>
  );
}

createApp(App, '#app');
