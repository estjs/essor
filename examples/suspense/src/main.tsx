import { Suspense, createApp, createResource } from 'essor';

type Workspace = 'alpha' | 'beta' | 'gamma';

const profiles: Record<Workspace, { title: string; owner: string }> = {
  alpha: { title: 'Alpha workspace', owner: 'Platform team' },
  beta: { title: 'Beta workspace', owner: 'Experience team' },
  gamma: { title: 'Gamma workspace', owner: 'Delivery team' },
};

const timelines: Record<Workspace, string[]> = {
  alpha: ['Alpha kickoff', 'Alpha rehearsal'],
  beta: ['Beta review', 'Beta checklist'],
  gamma: ['Gamma publish', 'Gamma handoff'],
};

function waitFor<T>(value: T, delay: number, signal: AbortSignal) {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }

    let timer: ReturnType<typeof setTimeout>;

    function cleanup() {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
    }

    function onAbort() {
      cleanup();
      reject(new DOMException('Aborted', 'AbortError'));
    }

    timer = setTimeout(() => {
      cleanup();
      resolve(value);
    }, delay);

    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function ProfileCard({ view }: { view: Workspace }) {
  const [profile] = createResource((signal) => waitFor(profiles[view], 500, signal));

  return (
    <div class="box stack" data-test="profile-card">
      <h2>{profile()?.title}</h2>
      <p>Owner: {profile()?.owner}</p>
    </div>
  );
}

function TimelineCard({ view }: { view: Workspace }) {
  const [items] = createResource((signal) => waitFor(timelines[view], 750, signal));

  return (
    <div class="box stack">
      <h2>Activity</h2>
      <ul data-test="timeline-list">
        {(items() ?? []).map((item) => (
          <li>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function WorkspacePanels({ view }: { view: Workspace }) {
  return (
    <div class="stack">
      <Suspense
        fallback={
          (
            <div class="box" data-test="loading-profile">
              Loading profile…
            </div>
          ) as unknown as Node
        }>
        {(<ProfileCard view={view} />) as unknown as Node}
      </Suspense>

      <Suspense
        fallback={
          (
            <div class="box" data-test="loading-timeline">
              Loading timeline…
            </div>
          ) as unknown as Node
        }>
        {(<TimelineCard view={view} />) as unknown as Node}
      </Suspense>
    </div>
  );
}

function App() {
  let $workspace: Workspace = 'alpha';

  return (
    <main data-test="example-root" class="page">
      <h1>Suspense Example</h1>
      <p class="note">Each workspace waits for async profile and activity data.</p>

      <section class="stack">
        <div class="row">
          <button onClick={() => ($workspace = 'alpha')}>Load Alpha</button>
          <button onClick={() => ($workspace = 'beta')}>Load Beta</button>
          <button onClick={() => ($workspace = 'gamma')}>Load Gamma</button>
        </div>

        {$workspace === 'alpha' ? (
          <WorkspacePanels view="alpha" />
        ) : $workspace === 'beta' ? (
          <WorkspacePanels view="beta" />
        ) : (
          <WorkspacePanels view="gamma" />
        )}
      </section>
    </main>
  );
}

createApp(App, '#app');
