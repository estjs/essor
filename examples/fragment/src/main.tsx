import { Fragment, createApp, signal } from 'essor';

function App() {
  const value = signal('Hello, World!');

  return (
    <Fragment>
      <p>{value.value}</p>
      <input type="text" value={value.value} oninput={e => (value.value = e.target.value)} />
    </Fragment>
  );
}

createApp(App, '#app');
