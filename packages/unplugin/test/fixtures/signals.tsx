import { createApp, signal } from 'essor';

function SignalComponent() {
  const count = signal(0);
  return (
    <div onClick={() => count.value++}>
      Count: {count.value}
    </div>
  );
}

createApp(SignalComponent, '#root');
