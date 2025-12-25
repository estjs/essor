import { createApp } from 'essor';
import { DynamicProvider } from './Dynamic';
import { SignalProvider } from './Signal';

function App() {
  return (
    <>
      <SignalProvider />
      <br />
      <DynamicProvider />
    </>
  );
}

createApp(App, '#app');
