import { createApp, createResource } from 'essor';

type UserProfile = { name: string; role: string };

function waitFor<T>(value: T, delay: number, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve(value);
    }, delay);
    function onAbort() {
      clearTimeout(timer);
      reject(new DOMException('Aborted', 'AbortError'));
    }
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * A fetcher that fails a configurable number of times before succeeding —
 * lets the demo show both the error state and a successful retry.
 */
let flakyAttempts = 0;
const FAIL_TIMES = 2;

async function flakyFetcher(signal: AbortSignal): Promise<UserProfile> {
  await waitFor(null, 150, signal);
  flakyAttempts++;
  if (flakyAttempts <= FAIL_TIMES) {
    throw new Error(`Upstream unavailable (attempt ${flakyAttempts}/${FAIL_TIMES + 1})`);
  }
  return { name: 'Ada Lovelace', role: 'Engineer' };
}

/** Always succeeds — the control group. */
function stableFetcher(signal: AbortSignal): Promise<UserProfile> {
  return waitFor({ name: 'Grace Hopper', role: 'Admiral' }, 150, signal);
}

function ResourcePanel({
  title,
  testId,
  resource,
  refetch,
}: {
  title: string;
  testId: string;
  resource: ReturnType<typeof createResource<UserProfile>>[0];
  refetch: () => Promise<void>;
}) {
  return (
    <section class="box stack" data-test={`${testId}-panel`}>
      <h2>{title}</h2>
      <p>
        State: <strong data-test={`${testId}-state`}>{resource.state.value}</strong>
      </p>
      {resource.state.value === 'errored' && (
        <p class="error" data-test={`${testId}-error`}>
          {resource.error.value?.message}
        </p>
      )}
      {resource.state.value === 'ready' && (
        <p data-test={`${testId}-data`}>
          {resource()?.name} — {resource()?.role}
        </p>
      )}
      <button data-test={`${testId}-retry`} onClick={() => refetch()}>
        Retry
      </button>
    </section>
  );
}

function App() {
  // Error path: fails twice, succeeds on the third attempt (via Retry).
  const [flaky, flakyActions] = createResource<UserProfile>(flakyFetcher);
  // Success path for contrast.
  const [stable, stableActions] = createResource<UserProfile>(stableFetcher);

  return (
    <main data-test="example-root" class="page">
      <h1>Error Handling Example</h1>
      <p class="note">
        Essor has no built-in ErrorBoundary component — async failures are handled through the
        resource's <code>error</code> / <code>state</code> signals, with <code>refetch()</code> for
        retries.
      </p>

      <div class="row" style={{ display: 'flex', gap: '2rem' }}>
        <ResourcePanel
          title="Flaky resource (fails twice)"
          testId="flaky"
          resource={flaky}
          refetch={flakyActions.refetch}
        />
        <ResourcePanel
          title="Stable resource"
          testId="stable"
          resource={stable}
          refetch={stableActions.refetch}
        />
      </div>
    </main>
  );
}

createApp(App, '#app');
