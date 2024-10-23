function App() {
  const $v = 'Hello, World!';

  return (
    <div>
      <p>{$v}</p>
      <input type="text" bind:value={$v} />
    </div>
  );
}
export default function MDXContent(props = {}) {
  const { wrapper: MDXLayout } = props.components || {};
  let $v = true;

  setTimeout(() => {
    $v = false;
    console.log($v);
  }, 2000);
  return <div>{$v ? <_createMdxContent {...props}></_createMdxContent> : <Page2 />}</div>;
}

(<MDXContent />).mount(document.querySelector('#app')!);
