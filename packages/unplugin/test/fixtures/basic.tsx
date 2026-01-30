import { createApp } from "essor";

function Foo() {
  return <div>Foo</div>;
}

function Bar() {
  return <div>Bar</div>;
}

function App() {
  return <div>
    <Foo />
    <Bar />
  </div>;
}

createApp(App, "#root")
