# AGENTS.md - Essor Framework Development Guidelines

This file contains comprehensive guidelines and documentation for AI agents working on the Essor frontend framework codebase.

## Quick Reference Commands

```bash
# Development & Building
pnpm run dev              # Start development with watch mode
pnpm run build            # Build all packages
pnpm run build:package    # Build specific package (run from package dir)

# Code Quality
pnpm run lint             # Run ESLint with auto-fix
pnpm run typecheck        # TypeScript strict type checking
pnpm run format           # Format code with Prettier

# Testing
pnpm run test             # Run all unit tests
pnpm run test:watch       # Watch mode for unit tests
pnpm run test:e2e         # Run Playwright E2E tests
pnpm run coverage         # Generate coverage report

# Single Test Commands (from package directories)
pnpm vitest run signal.spec.ts          # Run specific test file
pnpm vitest run signal.spec.ts -t "test name"  # Run specific test
pnpm vitest --reporter=verbose          # Detailed test output
```

---

## Project Architecture

Essor is a signal-based reactive frontend framework with a monorepo structure:

```
packages/
├── core/          # Main framework entry point, re-exports signals + template
├── signals/       # Reactive primitives (signals, effects, computed, reactive, store, watch)
├── template/      # Template rendering, components, lifecycle, SSR/SSG support
├── shared/        # Utility functions, type guards, DOM helpers
├── babel-plugin/  # JSX transformation plugin for Babel
└── unplugin/      # Universal plugin for Vite/Webpack/Rollup integration
```

---

## Package Details

### @estjs/core

**Purpose**: Main entry point for the Essor framework. Re-exports all APIs from `@estjs/signals` and `@estjs/template`.

**Exports**:
```typescript
// Re-exports everything from signals and template
export * from '@estjs/signals';
export * from '@estjs/template';
export { __version };
```

**Usage (JSX with $ prefix for signals)**:
```tsx
import { createApp } from 'essor';

// Variables prefixed with $ are automatically converted to signals by babel plugin
function App() {
  const $count = 0;  // Automatically becomes a signal
  
  return (
    <div>
      <p>Count: {$count}</p>
      <button onClick={() => $count++}>Increment</button>
    </div>
  );
}

createApp(App, '#app');
```

**Two-way Data Binding**:
```tsx
import { createApp } from 'essor';

function App() {
  const $value = 'Hello, World!';
  
  return (
    <div>
      <p>{$value}</p>
      <input type="text" bind:value={$value} />
    </div>
  );
}

createApp(App, '#app');
```

---

### @estjs/signals

**Purpose**: Core reactive primitives for state management. Implements a fine-grained reactivity system with automatic dependency tracking.

#### Signal API

```typescript
import { signal, shallowSignal, isSignal } from '@estjs/signals';

// Create a reactive signal
const count = signal(0);
console.log(count.value);  // 0

// Update signal
count.value = 1;           // Triggers reactive updates
count.set(2);              // Alternative setter
count.update(v => v + 1);  // Functional update

// Read without tracking dependencies
count.peek();              // Returns value without tracking

// Shallow signal (only top-level reactive)
const state = shallowSignal({ nested: { value: 1 } });
// state.nested is reactive, state.nested.value is NOT

// Type guard
if (isSignal(value)) { /* ... */ }
```

**Types**:
```typescript
interface Signal<T> {
  value: T;
  peek(): T;
  set(value: T): void;
  update(updater: (prev: T) => T): void;
}

type SignalValue<T> = T extends Signal<infer V> ? V : never;
type SignalType<T> = T extends Signal<infer V> ? V : never;
```

#### Effect API

```typescript
import { effect, memoEffect, stop, isEffect } from '@estjs/signals';

// Basic effect - runs immediately and re-runs when dependencies change
const runner = effect(() => {
  console.log('Count:', count.value);
});

// Effect with options
const runner = effect(() => {
  console.log(count.value);
}, {
  scheduler: 'post',           // 'sync' | 'pre' | 'post'
  flush: 'post',               // Alias for scheduler
  onStop: () => console.log('Stopped'),
  onTrack: (event) => { },     // Debug: dependency tracked
  onTrigger: (event) => { },   // Debug: effect triggered
});

// Manual control
runner();                      // Re-run effect
runner.effect.pause();         // Pause effect
runner.effect.resume();        // Resume effect
runner.stop();                 // Stop and cleanup
stop(runner);                  // Alternative stop

// Memoized effect - remembers previous state
memoEffect((prev) => {
  const current = width.value;
  if (current !== prev.width) {
    element.style.width = `${current}px`;
    prev.width = current;
  }
  return prev;
}, { width: 0 });
```

**Types**:
```typescript
type EffectFunction<T = any> = () => T;
type EffectScheduler = (effect: EffectImpl) => void;
type FlushTiming = 'sync' | 'pre' | 'post';

interface EffectOptions {
  scheduler?: EffectScheduler | FlushTiming;
  flush?: FlushTiming;
  onStop?: () => void;
  onTrack?: (event: DebuggerEvent) => void;
  onTrigger?: (event: DebuggerEvent) => void;
}

interface EffectRunner<T = any> {
  (): T;
  effect: EffectImpl<T>;
  stop: () => void;
}
```

#### Computed API

```typescript
import { computed, isComputed } from '@estjs/signals';

// Read-only computed
const doubled = computed(() => count.value * 2);
console.log(doubled.value);  // Lazy evaluation

// Writable computed
const fullName = computed({
  get: () => `${firstName.value} ${lastName.value}`,
  set: (value) => {
    const [first, last] = value.split(' ');
    firstName.value = first;
    lastName.value = last;
  }
});

fullName.value = 'Jane Doe';  // Triggers setter

// Read without tracking
doubled.peek();
```

**Types**:
```typescript
interface Computed<T> {
  readonly value: T;
  peek(): T;
}

interface ComputedOptions<T> {
  get: ComputedGetter<T>;
  set?: ComputedSetter<T>;
  onTrack?: (event: DebuggerEvent) => void;
  onTrigger?: (event: DebuggerEvent) => void;
}
```

#### Reactive API

```typescript
import { reactive, shallowReactive, isReactive, toRaw, isShallow, toReactive } from '@estjs/signals';

// Deep reactive object
const state = reactive({
  count: 0,
  nested: { value: 1 }
});
state.count++;                 // Triggers updates
state.nested.value++;          // Also triggers updates

// Shallow reactive (only root level)
const shallow = shallowReactive({ nested: { value: 1 } });
shallow.nested = { value: 2 }; // Triggers
shallow.nested.value = 3;      // Does NOT trigger

// Get raw object
const raw = toRaw(state);

// Type guards
isReactive(state);  // true
isShallow(shallow); // true

// Convert to reactive if object
const maybeReactive = toReactive(value);
```

**Supported Types**:
- Plain objects
- Arrays (with instrumented methods: push, pop, map, filter, etc.)
- Map and Set (with instrumented methods)
- WeakMap and WeakSet

#### Batch API

```typescript
import { batch, startBatch, endBatch, isBatching, getBatchDepth } from '@estjs/signals';

// Batch multiple updates
batch(() => {
  count.value = 1;
  name.value = 'John';
  // Effects run once after batch completes
});

// Manual batch control
startBatch();
try {
  count.value = 1;
  name.value = 'John';
} finally {
  endBatch();
}

// Check batch state
if (isBatching()) { /* ... */ }
const depth = getBatchDepth();
```

#### Scheduler API

```typescript
import { nextTick, queueJob, queuePreFlushCb } from '@estjs/signals';

// Wait for next tick
await nextTick();

// Queue a job
queueJob(() => {
  console.log('Runs after current flush');
});

// Queue pre-flush callback
queuePreFlushCb(() => {
  console.log('Runs before flush');
});
```

#### Store API

```typescript
import { createStore } from '@estjs/signals';

// Options-based store
const useCounter = createStore({
  state: { count: 0 },
  getters: {
    double: (state) => state.count * 2,
    isPositive: (state) => state.count > 0
  },
  actions: {
    increment() {
      this.count++;
    },
    decrement() {
      this.count--;
    },
    reset() {
      this.count = 0;
    }
  }
});

// Usage
const counter = useCounter();
console.log(counter.count);      // 0
console.log(counter.double);     // 0 (computed getter)
counter.increment();             // Action
counter.patch$({ count: 10 });   // Batch update
counter.reset$();                // Reset to initial state

// Subscribe to changes
counter.subscribe$((state) => console.log('Changed:', state));
counter.onAction$((state) => console.log('Action executed'));

// Class-based store
class CounterStore {
  count = 0;
  
  get double() {
    return this.count * 2;
  }
  
  increment() {
    this.count++;
  }
}

const useCounter = createStore(CounterStore);
```

**Built-in Store Actions**:
```typescript
interface StoreActions<S> {
  patch$(payload: Partial<S>): void;      // Batch update state
  subscribe$(callback: (state: S) => void): void;
  unsubscribe$(callback: (state: S) => void): void;
  onAction$(callback: (state: S) => void): void;
  reset$(): void;                          // Reset to initial state
}
```

#### Watch API

```typescript
import { watch } from '@estjs/signals';

// Watch a signal
const stop = watch(count, (newValue, oldValue) => {
  console.log(`Changed from ${oldValue} to ${newValue}`);
});

// Watch with options
watch(count, callback, {
  immediate: true,  // Run callback immediately
  deep: true        // Deep watch for objects
});

// Watch a getter function
watch(() => state.nested.value, callback);

// Watch multiple sources
watch([count, name], ([newCount, newName], [oldCount, oldName]) => {
  console.log('Multiple values changed');
});

// Stop watching
stop();
```

#### Other APIs

```typescript
import { untrack, trigger, Ref, ref, isRef } from '@estjs/signals';

// Read without tracking
const value = untrack(() => count.value);

// Manually trigger updates
trigger(target, 'set', key, newValue);

// Ref (wrapper for primitives)
const countRef = ref(0);
countRef.value++;
isRef(countRef);  // true
```

---

### @estjs/template

**Purpose**: Template rendering, component system, lifecycle hooks, and server-side rendering support.

#### Template & App Creation

```tsx
import { createApp } from 'essor';

// Basic component with JSX
function App() {
  return <div>Hello World</div>;
}

// Mount application to DOM
createApp(App, '#app');

// Or with DOM element
const container = document.getElementById('app');
createApp(App, container);
```

**Note**: The `template()` function is used internally by the babel plugin. You write JSX directly, and the babel plugin transforms it into optimized template calls.

#### Component System

```tsx
import { createApp, onMount } from 'essor';

// Functional component with $ prefix signals
function Counter({ initial = 0 }) {
  const $count = initial;  // $ prefix makes it reactive
  
  return (
    <div>
      <span>Count: {$count}</span>
      <button onClick={() => $count++}>+</button>
      <button onClick={() => $count--}>-</button>
    </div>
  );
}

// Usage
function App() {
  return <Counter initial={10} />;
}

createApp(App, '#app');
```

**Component with Children**:
```tsx
function Card({ title, children }) {
  return (
    <div class="card">
      <h2>{title}</h2>
      <div class="card-body">{children}</div>
    </div>
  );
}

function App() {
  return (
    <Card title="Welcome">
      <p>This is the card content</p>
    </Card>
  );
}
```

#### Lifecycle Hooks

```tsx
import { createApp, onMount, onDestroy, onUpdate } from 'essor';

function MyComponent() {
  const $data = null;
  
  // Called after component is mounted to DOM
  onMount(() => {
    console.log('Mounted!');
    // Fetch data, setup subscriptions, etc.
    fetchData().then(result => $data = result);
    
    // Return cleanup function (optional)
    return () => console.log('Cleanup on unmount');
  });
  
  // Called before component is removed
  onDestroy(() => {
    console.log('Destroying...');
  });
  
  // Called after component updates
  onUpdate(() => {
    console.log('Updated!');
  });
  
  return <div>{$data ? $data.name : 'Loading...'}</div>;
}
```

#### Dependency Injection (Provide/Inject)

```tsx
import { createApp, provide, inject, type InjectionKey } from 'essor';

// Define injection key with type
const ThemeKey: InjectionKey<string> = Symbol('theme');

// Parent component provides value
function Parent() {
  provide(ThemeKey, 'dark');
  provide('user', { name: 'John' });
  
  return (
    <div>
      <Child />
    </div>
  );
}

// Child component injects value
function Child() {
  const theme = inject(ThemeKey);           // 'dark'
  const user = inject('user');              // { name: 'John' }
  const missing = inject('missing', 'default'); // 'default'
  
  return <div>Theme: {theme}, User: {user.name}</div>;
}
```

#### Data Binding & Events

```typescript
import { addEventListener, bindElement, insert, mapNodes, delegateEvents } from '@estjs/template';

// Add event listener with auto-cleanup
addEventListener(element, 'click', handler, { capture: true });

// Two-way binding for form elements
bindElement(inputElement, 'value', '', (newValue) => {
  signal.value = newValue;
});

// Reactive node insertion
insert(parent, () => message.value, beforeNode);
insert(parent, staticElement);
insert(parent, 'Hello World');

// Map nodes from template by indexes
const nodes = mapNodes(templateNode, [1, 3, 5]);

// Setup event delegation
delegateEvents(['click', 'input']);
```

#### DOM Operations

```typescript
import { patchAttr, patchClass, patchStyle, setSpread } from '@estjs/template';

// Patch single attribute
patchAttr(element, 'title', 'New Title');

// Patch class (string, array, or object)
patchClass(element, 'active');
patchClass(element, ['btn', 'primary']);
patchClass(element, { active: true, disabled: false });

// Patch styles
patchStyle(element, { color: 'red', fontSize: '14px' });
patchStyle(element, 'color: red; font-size: 14px');

// Spread multiple attributes
setSpread(element, { class: 'btn', disabled: true, 'data-id': '123' });
```

#### Built-in Components

##### Fragment
```tsx
import { Fragment, createApp } from 'essor';

// Render multiple children without wrapper
function List() {
  return (
    <Fragment>
      <li>Item 1</li>
      <li>Item 2</li>
      <li>Item 3</li>
    </Fragment>
  );
}

// Or using shorthand <>...</>
function ListShorthand() {
  return (
    <>
      <li>Item 1</li>
      <li>Item 2</li>
    </>
  );
}
```

##### Portal
```tsx
import { Portal, createApp } from 'essor';

// Render children into different DOM node
function Modal() {
  const $isOpen = false;
  
  return (
    <div>
      <button onClick={() => $isOpen = true}>Open Modal</button>
      {$isOpen && (
        <Portal target="#modal-root">
          <div class="modal">
            <h2>Modal Title</h2>
            <p>Modal content</p>
            <button onClick={() => $isOpen = false}>Close</button>
          </div>
        </Portal>
      )}
    </div>
  );
}

// Or with DOM element reference
function TooltipPortal() {
  return (
    <Portal target={document.body}>
      <div class="tooltip">Teleported content</div>
    </Portal>
  );
}
```

##### Suspense
```tsx
import { Suspense, createResource, createApp } from 'essor';

// Async data fetching function
function fetchUser(id: number) {
  return new Promise<{ id: number; name: string }>(resolve => {
    setTimeout(() => {
      resolve({ id, name: `User ${id}` });
    }, 2000);
  });
}

// Component using createResource
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

// Suspense with fallback
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
```

##### createResource
```tsx
import { createResource, Suspense } from 'essor';

// Basic resource - fetcher function
const [data] = createResource(() => fetch('/api/data').then(r => r.json()));

// Resource with source signal (refetches when source changes)
function UserDetails() {
  const $userId = 1;
  
  const [user] = createResource(
    () => $userId,                    // Source - triggers refetch when changed
    (id) => fetch(`/api/users/${id}`).then(r => r.json())  // Fetcher
  );

  return (
    <div>
      <input type="number" bind:value={$userId} />
      <Suspense fallback={<div>Loading...</div>}>
        <p>User: {user()?.name}</p>
      </Suspense>
    </div>
  );
}

// Resource with actions
const [posts, { refetch, mutate }] = createResource(() => fetchPosts());

// Refetch data
await refetch();

// Optimistic update
mutate(currentPosts => [...currentPosts, newPost]);
```

#### Server-Side Rendering (SSR/SSG)

```typescript
import { 
  renderToString, 
  render, 
  createSSGComponent,
  getHydrationKey,
  hydrate,
  mapSSRNodes,
  getRenderedElement,
  setSSGAttr,
  escapeHTML
} from '@estjs/template';

// Render component to HTML string
const html = renderToString(App, { title: 'My App' });

// SSG component creation
const componentHtml = createSSGComponent(MyComponent, { prop: 'value' });

// Hydration on client
hydrate(App, document.getElementById('root'));

// Get hydration key for SSR
const key = getHydrationKey();

// Escape HTML for safe rendering
const safe = escapeHTML('<script>alert("xss")</script>');
```

---

### @estjs/shared

**Purpose**: Utility functions, type guards, and DOM helpers shared across all packages.

#### Type Guards

```typescript
import {
  isString, isNumber, isBoolean, isObject, isArray,
  isFunction, isPromise, isSymbol, isNull, isNil,
  isUndefined, isNaN, isMap, isSet, isWeakMap, isWeakSet,
  isPrimitive, isPlainObject, isHTMLElement, isStringNumber,
  isFalsy
} from '@estjs/shared';

isString('hello');        // true
isNumber(42);             // true
isArray([1, 2, 3]);       // true
isFunction(() => {});     // true
isPromise(Promise.resolve()); // true
isNil(null);              // true (null or undefined)
isPrimitive('str');       // true (string, number, boolean, symbol, null, undefined)
isPlainObject({});        // true
isStringNumber('42');     // true
```

#### Base Utilities

```typescript
import {
  noop, extend, hasChanged, coerceArray, hasOwn,
  startsWith, generateUniqueId, isBrowser,
  cacheStringFunction, isOn, isExclude,
  EMPTY_OBJ, EMPTY_ARR, getGlobalThis
} from '@estjs/shared';

// No-op function
const callback = noop;

// Object.assign alias
const merged = extend({}, obj1, obj2);

// Check if value changed (handles NaN)
hasChanged(newVal, oldVal);  // true if different

// Ensure array
coerceArray('item');     // ['item']
coerceArray(['a', 'b']); // ['a', 'b']

// Check own property
hasOwn(obj, 'key');

// String starts with (optimized)
startsWith('onClick', 'on');  // true

// Generate unique ID
const id = generateUniqueId();  // 'xK9mP2nQ'

// Check browser environment
if (isBrowser()) { /* ... */ }

// Cache string function results
const cached = cacheStringFunction((str) => str.toUpperCase());

// Check if event handler prop
isOn('onClick');  // true
isOn('onclick');  // false (must be camelCase)

// Empty constants
const obj = EMPTY_OBJ;  // Frozen empty object
const arr = EMPTY_ARR;  // Frozen empty array
```

#### String Utilities

```typescript
import { camelCase, kebabCase, capitalize } from '@estjs/shared';

camelCase('foo-bar');     // 'fooBar'
kebabCase('fooBar');      // 'foo-bar'
capitalize('hello');      // 'Hello'
```

#### DOM Utilities

```typescript
import {
  isHTMLTag, isSVGTag, isMathMLTag, isVoidTag, isSelfClosingTag,
  isDelegatedEvent, isBooleanAttr, isSpecialBooleanAttr,
  isKnownHtmlAttr, isKnownSvgAttr, isSSRSafeAttrName,
  isRenderAbleAttrValue, includeBooleanAttr, propsToAttrMap
} from '@estjs/shared';

isHTMLTag('div');           // true
isSVGTag('circle');         // true
isVoidTag('img');           // true
isDelegatedEvent('click');  // true
isBooleanAttr('disabled');  // true

// Props to attribute mapping
propsToAttrMap.className;   // 'class'
propsToAttrMap.htmlFor;     // 'for'
```

#### Escape Utilities

```typescript
import { escapeHTML, escapeHTMLComment, getEscapedCssVarName } from '@estjs/shared';

escapeHTML('<script>');           // '&lt;script&gt;'
escapeHTMLComment('--comment');   // Escaped comment
getEscapedCssVarName('--my-var'); // Safe CSS variable name
```

#### Logging

```typescript
import { warn, info, error } from '@estjs/shared';

warn('Deprecated API used');
info('Component rendered');
error('Critical error occurred');
```

---

### babel-plugin-essor

**Purpose**: Babel plugin for transforming JSX into optimized Essor template code. The key feature is automatic signal transformation - variables prefixed with `$` are automatically converted to reactive signals.

#### Plugin Configuration

```javascript
// babel.config.js
module.exports = {
  plugins: [
    ['babel-plugin-essor', {
      symbol: '$',        // Signal prefix symbol (default: '$')
      mode: 'client',     // 'client' | 'ssr' | 'ssg'
      props: true,        // Transform props destructuring
      hmr: true           // Enable HMR support
    }]
  ]
};
```

#### Signal Transformation ($ prefix)

The babel plugin automatically transforms variables with `$` prefix into reactive signals:

```tsx
// Input (what you write)
function Counter() {
  const $count = 0;
  const $name = 'John';
  
  return (
    <div>
      <p>Count: {$count}</p>
      <p>Name: {$name}</p>
      <button onClick={() => $count++}>+</button>
    </div>
  );
}

// Output (what babel plugin generates - simplified)
import { signal } from '@estjs/signals';
import { template, mapNodes, insert, addEventListener } from '@estjs/template';

function Counter() {
  const $count = signal(0);
  const $name = signal('John');
  
  const _$tmpl = template('<div><p></p><p></p><button>+</button></div>');
  return (() => {
    const _$el = _$tmpl();
    const _$nodes = mapNodes(_$el, [2, 3, 4]);
    insert(_$nodes[0], () => $count.value);
    insert(_$nodes[1], () => $name.value);
    addEventListener(_$nodes[2], 'click', () => $count.value++);
    return _$el;
  })();
}
```

#### Two-way Binding Transformation

```tsx
// Input
function Form() {
  const $value = '';
  
  return <input type="text" bind:value={$value} />;
}

// Output (simplified)
function Form() {
  const $value = signal('');
  
  const _$tmpl = template('<input type="text"/>');
  return (() => {
    const _$el = _$tmpl();
    bindElement(_$el, 'value', () => $value.value, (v) => $value.value = v);
    return _$el;
  })();
}
```

#### Props Transformation

```tsx
// Input
function Component({ title, count = 0, ...rest }) {
  return <div>{title} {count}</div>;
}

// Output
function Component(__props = { count: 0 }) {
  const rest = omitProps(__props, ['title', 'count']);
  
  const _$tmpl = template('<div></div>');
  return (() => {
    const _$el = _$tmpl();
    insert(_$el, () => __props.title);
    insert(_$el, () => __props.count);
    return _$el;
  })();
}
```

#### Array/List Rendering

```tsx
// Input
function TodoList() {
  const $list: string[] = [];
  let $val = '';

  const addTodo = () => {
    if (!$val) return;
    $list.push($val);
    $val = '';
  };

  const deleteTodo = (index: number) => {
    $list.splice(index, 1);
  };

  return (
    <div>
      <input type="text" bind:value={$val} />
      <button onClick={addTodo}>Add</button>
      <ul>
        {$list.map((item, index) => (
          <li>
            <span>{item}</span>
            <button onClick={() => deleteTodo(index)}>Delete</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
```

#### SSG Mode Transformation

```tsx
// Input
function Page({ title }) {
  return (
    <div>
      <h1>{title}</h1>
    </div>
  );
}

// Output (SSG mode - generates HTML strings for server rendering)
function Page(__props) {
  return render(
    ['<div data-hk="', '"><h1 data-hk="', '">', '</h1></div>'],
    getHydrationKey(),
    getHydrationKey(),
    escapeHTML(__props.title)
  );
}
```

#### Plugin Internals

**Visitor Hooks**:
- `Program`: Setup imports and declarations
- `FunctionDeclaration` / `ArrowFunctionExpression`: Transform props destructuring and $ prefix variables
- `JSXElement` / `JSXFragment`: Transform JSX to template calls

**Key Modules**:
- `jsx/client.ts`: Client-side JSX transformation
- `jsx/ssg.ts`: SSG/SSR JSX transformation
- `jsx/tree.ts`: JSX AST to TreeNode conversion
- `signals/props.ts`: Props destructuring transformation
- `import.ts`: Import management

---

### unplugin-essor

**Purpose**: Universal build plugin supporting Vite, Webpack, Rollup, esbuild, and other bundlers.

#### Vite Configuration

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import essor from 'unplugin-essor/vite';

export default defineConfig({
  plugins: [
    essor({
      include: ['**/*.tsx', '**/*.jsx'],
      exclude: ['node_modules/**'],
      symbol: '$',        // Signal prefix (default: '$')
      mode: 'client',
      props: true,
      hmr: true
    })
  ]
});
```

#### Webpack Configuration

```javascript
// webpack.config.js
const essor = require('unplugin-essor/webpack');

module.exports = {
  plugins: [
    essor({
      mode: 'client',
      props: true
    })
  ]
};
```

#### Rollup Configuration

```javascript
// rollup.config.js
import essor from 'unplugin-essor/rollup';

export default {
  plugins: [
    essor({
      mode: 'client'
    })
  ]
};
```

#### Other Bundlers

```typescript
// esbuild
import essor from 'unplugin-essor/esbuild';

// Rspack
import essor from 'unplugin-essor/rspack';

// Farm
import essor from 'unplugin-essor/farm';

// Rolldown
import essor from 'unplugin-essor/rolldown';

// Astro
import essor from 'unplugin-essor/astro';
```

#### Plugin Options

```typescript
interface Options {
  include?: string | string[];    // Files to include
  exclude?: string | string[];    // Files to exclude
  symbol?: string;                // Signal prefix (default: '$')
  mode?: 'client' | 'ssr' | 'ssg'; // Rendering mode
  props?: boolean;                // Transform props (default: true)
  hmr?: boolean;                  // Enable HMR (default: true)
}
```

#### HMR Support

The plugin provides automatic HMR for:
- JSX/TSX component files
- CSS/SCSS/SASS style files
- Proper module invalidation and dependency tracking

---

## Code Style Guidelines

### Formatting & Structure

- **2-space indentation**, LF line endings
- **TypeScript strict mode** - all code must pass strict type checking
- **80-100 character line limit** where practical
- **Trailing commas** in multi-line structures
- **No semicolons** (ESLint configured for ASI)

### Naming Conventions

```typescript
// Files and directories
signal-manager.ts      // kebab-case for utilities
ComponentRenderer.ts   // PascalCase for main classes

// Functions and variables
const isActive = signal(false);           // camelCase
function createSignal<T>(value: T) {}     // camelCase

// Constants and enums
const MAX_RECURSION_DEPTH = 1000;         // UPPER_SNAKE_CASE
enum EffectState { Active, Disposed }     // PascalCase

// Types and interfaces
export type Signal<T> = { ... };          // PascalCase
interface ComponentOptions { ... }        // PascalCase
```

### Import/Export Patterns

```typescript
// External packages (alphabetical order)
import { computed, effect, signal } from '@estjs/signals';
import { template, createApp } from '@estjs/template';
import { isArray, isFunction } from '@estjs/shared';

// Type imports grouped separately
import type { ComponentFn, AnyNode } from './types';
import type { Signal } from '@estjs/signals';

// Internal modules (relative imports)
import { createScope, runWithScope } from './scope';
import { warn, error } from './debug';

// Exports
export { signal, computed, effect };      // Named exports
export type { Signal, EffectOptions };    // Type exports
export * from './operations';             // Re-exports
```

---

## TypeScript Guidelines

### Type Definitions

```typescript
// Always use explicit types for public APIs
export function createSignal<T>(initialValue: T): Signal<T> {
  // Implementation
}

// Prefer generic types over 'any'
export type ComponentFn<P extends ComponentProps = ComponentProps> = (
  props: P,
) => AnyNode;

// Use utility types for reactive unwrapping
export type Unwrap<T> = T extends Signal<infer V> ? V : T;
```

### Generic Constraints

```typescript
// Use proper constraints for generics
function setObjectProperty<T extends object, K extends keyof T>(
  obj: T,
  key: K,
  value: T[K],
): void {
  obj[key] = value;
}
```

---

## Error Handling Patterns

### Development vs Production

```typescript
import { warn, error } from '@estjs/shared';

function validateComponent(
  component: unknown,
): asserts component is ComponentFn {
  if (!isFunction(component)) {
    if (__DEV__) {
      error(
        `Invalid component provided. Expected function, got ${typeof component}`,
      );
    }
    throw new Error('Invalid component');
  }
}
```

### Error Categories

- **Development warnings** (`warn()`) for misuse/deprecated APIs
- **Runtime errors** (`error()`) for invalid operations
- **Silent failures** for non-critical edge cases
- **Type guards** for runtime type validation

---

## Testing Guidelines

### Unit Test Structure

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signal, computed, effect, nextTick } from '../src';

describe('signal primitive', () => {
  beforeEach(() => {
    // Reset test environment
  });

  it('should initialize with correct value', () => {
    const count = signal(0);
    expect(count.value).toBe(0);
  });

  it('should update value and trigger effects', async () => {
    const count = signal(0);
    const fn = vi.fn();

    effect(() => fn(count.value));

    count.value = 1;
    await nextTick();

    expect(fn).toHaveBeenCalledWith(1);
  });
});
```

### Test Organization

- **Test files**: `*.spec.ts` in `test/` directories
- **Describe blocks**: Logical grouping of related functionality
- **It blocks**: Individual test cases with descriptive names
- **Setup/Teardown**: Use `beforeEach`/`afterEach` for isolation
- **Mocking**: Use `vi.fn()` from Vitest for spies/mocks

### DOM Testing

```typescript
import { mount } from './test-utils';
import MyComponent from '../src/MyComponent';

it('should render correctly', () => {
  const container = mount(MyComponent, { prop: 'value' });
  expect(container.querySelector('button')).toBeTruthy();
});
```

---

## Development Workflow

### Making Changes

1. Run `pnpm run typecheck` before committing
2. Run `pnpm run lint` to ensure code style compliance
3. Run relevant tests: `pnpm vitest run <test-file>`
4. Test changes manually with `pnpm run dev`

### Adding New Features

1. Create feature branch from `main`
2. Add types first, then implementation
3. Write comprehensive tests
4. Update documentation if public API changes
5. Run full test suite before PR

### Performance Considerations

- Minimize effect re-runs
- Use `computed()` for derived values
- Avoid unnecessary signal creation in loops
- Profile with benchmark tests for critical paths

---

## Package-Specific Development Notes

### @estjs/signals

- Core reactive primitives with no DOM dependencies
- Focus on performance and correctness
- Key files:
  - `signal.ts`: Signal implementation with dependency tracking
  - `effect.ts`: Effect system with scheduling
  - `computed.ts`: Lazy computed values
  - `reactive.ts`: Proxy-based reactivity for objects/arrays/collections
  - `store.ts`: State management with actions and getters
  - `watch.ts`: Watch API for observing changes

### @estjs/template

- JSX template compilation and component lifecycle
- DOM manipulation utilities
- Key files:
  - `renderer.ts`: Template factory and app creation
  - `component.ts`: Component class and lifecycle
  - `lifecycle.ts`: onMount, onDestroy, onUpdate hooks
  - `provide.ts`: Dependency injection system
  - `binding.ts`: Data binding and event handling
  - `server/`: SSR/SSG rendering utilities

### @estjs/babel-plugin

- JSX AST transformation
- Source map generation
- Key files:
  - `jsx/client.ts`: Client-side JSX transformation
  - `jsx/ssg.ts`: SSG mode transformation
  - `jsx/tree.ts`: JSX to TreeNode conversion
  - `signals/props.ts`: Props destructuring transformation

### @estjs/unplugin

- Universal build tool integration
- HMR support for development
- Key files:
  - `index.ts`: Main unplugin factory
  - `vite.ts`, `webpack.ts`, etc.: Bundler-specific exports

---

## Debug Utilities

Use the built-in debug utilities for consistent logging:

```typescript
import { warn, error, info } from '@estjs/shared';

info('Component rendered');
warn('Deprecated API used');
error('Critical error occurred');
```

---

## Release Process

Only maintainers should perform releases:

1. `pnpm run prerelease` - Run checks and build
2. `pnpm run release` - Bump versions and publish
3. Update changelog and version tags

---

## Common Patterns

### Creating a Reactive Component (with $ prefix)

```tsx
import { createApp, onMount, onDestroy } from 'essor';

function Counter({ initial = 0 }) {
  // $ prefix variables are automatically converted to signals
  const $count = initial;
  
  // Computed values - just use regular expressions with $ variables
  const doubled = () => $count * 2;
  
  // Lifecycle
  onMount(() => {
    console.log('Counter mounted');
    return () => console.log('Counter cleanup');
  });
  
  onDestroy(() => {
    console.log('Counter destroyed');
  });
  
  // Event handlers - directly mutate $ variables
  const increment = () => $count++;
  const decrement = () => $count--;
  
  return (
    <div>
      <span>Count: {$count} (Doubled: {doubled()})</span>
      <button onClick={decrement}>-</button>
      <button onClick={increment}>+</button>
    </div>
  );
}

createApp(Counter, '#app');
```

### Todo List Example (Arrays with $ prefix)

```tsx
import { createApp } from 'essor';

function TodoApp() {
  const $list: string[] = [];
  let $val = '';
  const $checkedList: string[] = [];

  const addTodo = () => {
    if (!$val) return;
    $list.push($val);  // Array methods work reactively
    $val = '';
  };

  const deleteTodo = (index: number) => {
    $list.splice(index, 1);
  };

  const itemChecked = (e: Event, item: string) => {
    if ((e.target as HTMLInputElement)?.checked) {
      $checkedList.push(item);
    } else {
      $checkedList.splice($checkedList.indexOf(item), 1);
    }
  };

  return (
    <div>
      <input type="text" bind:value={$val} />
      <button onClick={addTodo}>Add</button>

      <ul>
        {$list.map((item, index) => (
          <li>
            <input type="checkbox" onChange={e => itemChecked(e, item)} />
            <span>{item}</span>
            <button onClick={() => deleteTodo(index)}>{`del-${index}`}</button>
          </li>
        ))}
      </ul>
      
      <p>Checked items: {$checkedList.length}</p>
    </div>
  );
}

createApp(TodoApp, '#app');
```

### Using Store for Global State

```tsx
import { createStore, createApp } from 'essor';

// Define store with options pattern
const useAppStore = createStore({
  state: {
    user: null as { name: string } | null,
    theme: 'light',
    notifications: [] as { id: number; text: string; read: boolean }[]
  },
  getters: {
    isLoggedIn: (state) => state.user !== null,
    unreadCount: (state) => state.notifications.filter(n => !n.read).length
  },
  actions: {
    login(user: { name: string }) {
      this.user = user;
    },
    logout() {
      this.user = null;
    },
    toggleTheme() {
      this.theme = this.theme === 'light' ? 'dark' : 'light';
    },
    addNotification(notification: { id: number; text: string; read: boolean }) {
      this.notifications.push(notification);
    }
  }
});

// Use in component
function Header() {
  const store = useAppStore();
  
  return (
    <header class={store.theme}>
      {store.isLoggedIn ? (
        <span>Welcome, {store.user?.name}</span>
      ) : (
        <button onClick={() => store.login({ name: 'User' })}>Login</button>
      )}
      <span>Notifications: {store.unreadCount}</span>
      <button onClick={() => store.toggleTheme()}>Toggle Theme</button>
    </header>
  );
}

createApp(Header, '#app');
```

### Server-Side Rendering

```tsx
// server.ts
import { renderToString } from 'essor';
import App from './App';

async function handleRequest(req, res) {
  const html = renderToString(App, { 
    title: 'My SSR App',
    initialData: await fetchData()
  });

  res.send(`
    <!DOCTYPE html>
    <html>
      <head><title>My App</title></head>
      <body>
        <div id="root">${html}</div>
        <script src="/client.js"></script>
      </body>
    </html>
  `);
}

// client.ts
import { hydrate } from 'essor';
import App from './App';

hydrate(App, document.getElementById('root'));
```

### Async Data with Suspense

```tsx
import { Suspense, createResource, createApp } from 'essor';

function fetchUser(id: number) {
  return fetch(`/api/users/${id}`).then(r => r.json());
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
```

---

## Key Concepts Summary

### $ Prefix Convention

The `$` prefix is the core convention in Essor:

```tsx
// Variables with $ prefix become reactive signals
const $count = 0;        // Automatically: signal(0)
const $name = 'John';    // Automatically: signal('John')
const $list: string[] = [];  // Automatically: reactive array

// Direct mutation triggers updates
$count++;                // Works! Triggers re-render
$list.push('item');      // Works! Array methods are reactive

// Two-way binding with bind:
<input bind:value={$value} />
```

### What Gets Transformed

| You Write | Babel Transforms To |
|-----------|---------------------|
| `const $x = 0` | `const $x = signal(0)` |
| `$x++` | `$x.value++` |
| `{$x}` in JSX | `() => $x.value` (reactive getter) |
| `bind:value={$x}` | Two-way binding with getter/setter |
| `<div>...</div>` | `template('<div>...</div>')` + reactive insertions |

---

Remember: This framework prioritizes **performance**, **developer experience**, and **type safety** above all else.
