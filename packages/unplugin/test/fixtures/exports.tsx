import { createApp } from 'essor';

export function ComponentA() {
  return <div>A</div>;
}

export const ComponentB = () => <div>B</div>;

export default function App() {
  return (
    <div>
      <ComponentA />
      <ComponentB />
    </div>
  );
}

createApp(App, '#root');
