import { createApp } from 'essor';

function PropsComponent(props: { name: string }) {
  return <div>Hello {props.name}</div>;
}

createApp(() => <PropsComponent name="World" />, '#root');
