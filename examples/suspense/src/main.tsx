import { Suspense, createApp, createResource } from 'essor';

function fetchUser(id: number) {
  return new Promise<{ id: number; name: string }>(resolve => {
    setTimeout(() => {
      resolve({ id, name: `User ${id}` });
    }, 2000);
  });
}

function UserProfile({ id }: { id: number }) {
  const [user] = createResource(() => fetchUser(id));

  return (
    <div class="user-profile">
      <h3>User Profile</h3>
      <p>ID: {user()?.id}</p>
      <p>Name: {user()?.name}</p>
    </div>
  );
}

function App() {
  return (
    <div class="app">
      <h1>Suspense Example</h1>
      <Suspense fallback={<div class="loading">Loading user data...</div>}>
        <UserProfile id={1} />
      </Suspense>
    </div>
  );
}

createApp(App, '#app');
