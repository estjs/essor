import { createApp } from 'essor';

const rows = [
  {
    id: 'alpha',
    label: 'Alpha workspace',
    owner: 'Platform team',
    note: 'Fragments can return sibling rows without wrapper elements.',
  },
  {
    id: 'beta',
    label: 'Beta workspace',
    owner: 'Product team',
    note: 'Each entry expands into a summary row and a detail row.',
  },
];

function App() {
  let $showDetails = false;

  const renderedRowCount = () => rows.length + ($showDetails ? rows.length : 0);

  return (
    <main data-test="example-root" class="page">
      <h1>Fragment Example</h1>
      <p class="note">A table body rendered with fragments only.</p>

      <section class="stack">
        <div class="row">
          <button onClick={() => ($showDetails = !$showDetails)}>
            {$showDetails ? 'Hide details' : 'Show details'}
          </button>
          <span data-test="row-count">{renderedRowCount()} rows rendered</span>
        </div>

        <table>
          <thead>
            <tr>
              <th>Workspace</th>
              <th>Owner</th>
            </tr>
          </thead>
          <tbody data-test="fragment-body">
            {rows.map((row) => (
              <>
                <tr data-test="summary-row">
                  <td>{row.label}</td>
                  <td>{row.owner}</td>
                </tr>
                <tr data-test="detail-row" hidden={!$showDetails}>
                  <td colSpan={2}>{row.note}</td>
                </tr>
              </>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}

createApp(App, '#app');
