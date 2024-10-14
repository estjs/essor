import { Fragment, useComputed, useReactive } from 'essor';

const DocHomeLayout = () => {
  return <div>DocHomeLayout</div>;
};
const Doc = () => {
  return <div>doc</div>;
};

const NotFound = () => {
  return <div>NotFound</div>;
};

const pageData = useReactive({
  pageType: 'doc',
});
function App() {
  const content = useComputed(() => {
    let content;

    switch (pageData.pageType) {
      case 'home':
        content = <DocHomeLayout />;
        break;
      case 'doc':
        content = (
          <Fragment>
            <Doc></Doc>
          </Fragment>
        );
        break;
      default:
        content = <NotFound />;
    }
    return content;
  });

  return (
    <div class="doc-content h-full w-full" onClick={() => (pageData.pageType = 'home')}>
      {content.value}
    </div>
  );
}

(<App />).mount(document.querySelector('#app')!);
