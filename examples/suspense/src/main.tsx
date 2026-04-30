import { For, Suspense, createApp, createResource } from 'essor';
import { signal } from '@estjs/signals';

function fetchUser(id: number) {
  return new Promise<{ id: number; name: string; email: string }>((resolve) => {
    setTimeout(() => {
      resolve({
        id,
        name: `User ${id}`,
        email: `user${id}@example.com`,
      });
    }, 2000);
  });
}

function fetchPosts(userId: number) {
  return new Promise<{ id: number; title: string; content: string }[]>((resolve) => {
    setTimeout(() => {
      resolve([
        { id: 1, title: `Post 1 by User ${userId}`, content: 'This is the first post content.' },
        { id: 2, title: `Post 2 by User ${userId}`, content: 'This is the second post content.' },
      ]);
    }, 1500);
  });
}

function UserProfile({ id }: { id: number }) {
  const [user] = createResource(() => fetchUser(id));

  return (
    <div class="user-profile">
      <h3>User Profile</h3>
      <p>
        <strong>ID:</strong> {user()?.id}
      </p>
      <p>
        <strong>Name:</strong> {user()?.name}
      </p>
      <p>
        <strong>Email:</strong> {user()?.email}
      </p>
    </div>
  );
}

function UserPosts({ userId }: { userId: number }) {
  const [posts] = createResource(() => fetchPosts(userId));

  return (
    <div class="user-posts">
      <h3>User Posts</h3>
      <For each={posts() ?? []} fallback={<p>No posts yet.</p>}>
        {(post) => (
          <div class="post-item">
            <h4>{post.title}</h4>
            <p>{post.content}</p>
          </div>
        )}
      </For>
    </div>
  );
}

function App() {
  const selectedUserId = signal(1);

  const loadUser = (id: number) => {
    selectedUserId.value = id;
  };

  return (
    <div class="suspense-demo">
      <h1>Suspense Example</h1>
      <p>This example demonstrates async data loading with Suspense boundaries.</p>

      <div class="controls">
        <button onClick={() => loadUser(1)}>Load User 1</button>
        <button onClick={() => loadUser(2)}>Load User 2</button>
        <button onClick={() => loadUser(3)}>Load User 3</button>
      </div>

      <div class="async-content">
        <Suspense fallback={<div class="loading-fallback">Loading user data...</div>}>
          <UserProfile id={selectedUserId.value} />
        </Suspense>

        <Suspense fallback={<div class="loading-fallback">Loading posts...</div>}>
          <UserPosts userId={selectedUserId.value} />
        </Suspense>
      </div>
    </div>
  );
}

createApp(App, '#app');
