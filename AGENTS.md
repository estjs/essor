# AGENTS.md - Essor Framework Development Guide

**Essor** is a signal-based reactive frontend framework with no virtual DOM, built on fine-grained reactivity.

**Version**: 0.0.15-beta.9 | **License**: MIT | **Package Manager**: pnpm@10.28.0

---

## Quick Commands

```bash
# Development
pnpm run dev              # Watch mode (Turbo)
pnpm run build            # Build all packages
pnpm run typecheck        # TypeScript strict
pnpm run lint             # ESLint auto-fix

# Testing
pnpm run test             # Unit tests (vitest)
pnpm run test:e2e         # E2E (playwright)
pnpm run coverage         # Coverage report

# Examples
pnpm run examples         # Interactive runner
cd examples/hello-world && pnpm run dev

# Package-level
cd packages/signals
pnpm vitest run signal.spec.ts
pnpm vitest run signal.spec.ts -t "should track"
```

---

## Architecture

```
essor-monorepo/
├── packages/
│   ├── core/          # essor - Main entry (conditional exports: browser/node)
│   │   ├── index.client.ts  # Browser entry → @estjs/signals + @estjs/template
│   │   └── index.server.ts  # Node entry → @estjs/server
│   ├── signals/       # @estjs/signals - Reactive system (13 source files)
│   ├── template/      # @estjs/template - Rendering & hydration
│   │   ├── hydration/ # Hydration utilities
│   │   ├── components/ # Fragment, Portal, Suspense, createResource
│   │   └── operations/ # DOM patch operations
│   ├── server/        # @estjs/server - SSR/SSG rendering (4 files)
│   ├── shared/        # @estjs/shared - Common utilities
│   ├── babel-plugin/  # babel-plugin-essor - JSX transform
│   │   ├── jsx/client.ts   # Client JSX → template() calls
│   │   └── jsx/ssg.ts      # SSG JSX → HTML strings
│   └── unplugin/      # unplugin-essor - Build integration + HMR
├── examples/          # 20+ examples
└── e2e/              # Playwright tests
```

**Dependency Graph**:
```
essor (browser) → signals + template
essor (node)    → server
  signals  → shared
  template → signals + shared
  server   → template + shared (for SSR scope/hydration)
babel-plugin → shared
unplugin → babel-plugin
```

---

## Core Concepts

### 1. $ Prefix Convention (Critical!)

The `$` prefix is **automatically transformed** by babel plugin:

```tsx
// You write:
const $count = 0;
const $name = 'John';
const $list: string[] = [];

// Babel transforms to:
const $count = signal(0);
const $name = signal('John');
const $list = reactive([]);

// Usage in JSX:
<div>{$count}</div>           // → () => $count.value
<button onClick={() => $count++}>  // → $count.value++
<input bind:value={$name} />  // → Two-way binding setup
```

**Rules**:
- Variables **without** `$` are NOT reactive
- `$` prefix works for: `const`, `let`, `var`
- Arrays/Objects become `reactive()`, primitives become `signal()`

### 2. Reactivity System Architecture

```
Signal (Primitive)
  ├─ value: T (getter/setter with tracking)
  ├─ peek(): T (read without tracking)
  ├─ set(value: T)
  └─ update(fn: (prev: T) => T)

Effect (Subscriber)
  ├─ Automatically tracks dependencies
  ├─ Re-runs when dependencies change
  ├─ Supports scheduling (sync/pre/post)
  └─ Lifecycle: run() → notify() → stop()

Reactive (Proxy-based)
  ├─ Deep reactivity for objects/arrays
  ├─ Instrumented array methods
  ├─ Map/Set/WeakMap/WeakSet support
  └─ Shallow mode available

Computed (Derived)
  ├─ Lazy evaluation
  ├─ Cached until dependencies change
  └─ Can be writable (get/set)
```

### 3. Dependency Tracking (Link System)

```typescript
// Core mechanism in packages/signals/src/link.ts
interface ReactiveNode {
  depLink?: Link;      // Dependencies this node depends on
  subLink?: Link;      // Subscribers depending on this node
  depLinkTail?: Link;  // Tail of dependency list
  subLinkTail?: Link;  // Tail of subscriber list
  flag: ReactiveFlags; // State flags (DIRTY, PENDING, etc.)
}

// Bidirectional linked list for efficient tracking
interface Link {
  dep: ReactiveNode;   // The dependency
  sub: ReactiveNode;   // The subscriber
  nextDep?: Link;      // Next in dependency chain
  prevDep?: Link;      // Previous in dependency chain
  nextSub?: Link;      // Next in subscriber chain
  prevSub?: Link;      // Previous in subscriber chain
}
```

**Tracking Flow**:
1. `effect(() => count.value)` starts tracking
2. `count.value` getter calls `linkReactiveNode(signal, effect)`
3. Creates bidirectional link: `signal.subLink ↔ effect.depLink`
4. `count.value = 1` triggers `propagate(signal.subLink)`
5. Effect re-runs, old links cleaned, new links created

---

## Package Deep Dive

### @estjs/signals - Reactive Primitives

**Key Files**:
- `signal.ts` - SignalImpl class with optimized change detection
- `effect.ts` - EffectImpl with scheduler support
- `reactive.ts` - Proxy handlers for objects/arrays/collections
- `link.ts` - Dependency tracking system
- `propagation.ts` - Change propagation algorithm
- `batch.ts` - Batch updates to minimize re-runs
- `scheduler.ts` - Job queue and nextTick
- `store.ts` - State management with actions/getters
- `computed.ts` - Lazy computed values
- `watch.ts` - Watch API for side effects

**Critical Implementation Details**:

```typescript
// Signal optimization: _oldValue created on-demand
class SignalImpl<T> {
  private _oldValue?: T;  // Only created when needed
  private _rawValue: T;   // Raw (non-proxied) value
  _value: T;              // Current value (may be proxy)

  set value(value: T) {
    value = toRaw(value);
    if (!hasChanged(this._rawValue, value)) return;

    // Create _oldValue on first change
    if (!('_oldValue' in this)) {
      this._oldValue = this._rawValue;
    }

    this.flag |= ReactiveFlags.DIRTY;
    this._rawValue = value;
    this._value = isObject(value) ? reactive(value) : value;

    if (this.subLink) propagate(this.subLink);
  }
}

// Effect dirty checking with PENDING optimization
class EffectImpl {
  get dirty(): boolean {
    if (this.flag & ReactiveFlags.DIRTY) return true;

    if (this.flag & ReactiveFlags.PENDING) {
      if (checkDirty(this.depLink, this)) {
        this.flag = (this.flag & ~ReactiveFlags.PENDING) | ReactiveFlags.DIRTY;
        return true;
      }
      this.flag &= ~ReactiveFlags.PENDING;
    }
    return false;
  }
}

// Reactive array instrumentation
const arrayInstrumentations = {
  push(...args) {
    const arr = toRaw(this);
    const res = Array.prototype.push.apply(arr, args);
    trigger(arr, TriggerOpTypes.SET, ARRAY_KEY);
    trigger(arr, TriggerOpTypes.SET, ARRAY_ITERATE_KEY);
    return res;
  },
  // Similar for: pop, shift, unshift, splice, sort, reverse, fill
};
```

**API Summary**:
```typescript
// Signal
signal(value) / shallowSignal(value)
isSignal(value)

// Effect
effect(fn, options?) → EffectRunner
runner.effect.pause() / resume() / stop()
memoEffect(fn, initialState, options?)

// Computed
computed(getter) / computed({ get, set })
isComputed(value)

// Reactive
reactive(obj) / shallowReactive(obj)
isReactive(obj) / isShallow(obj)
toRaw(obj) / toReactive(value)

// Batch
batch(fn)
startBatch() / endBatch()
isBatching() / getBatchDepth()

// Scheduler
nextTick(fn?)
queueJob(job)
queuePreFlushCb(cb)

// Store
createStore({ state, getters, actions })
store.patch$(updates)
store.subscribe$(callback)
store.reset$()

// Watch
watch(source, callback, options?)

// Utilities
untrack(fn)
trigger(target, type, key, value)
```

### @estjs/template - Rendering System

**Key Files**:
- `renderer.ts` - template() factory, createApp()
- `component.ts` - Component class with lifecycle
- `binding.ts` - insert(), bindElement(), addEventListener()
- `lifecycle.ts` - onMount, onDestroy, onUpdate
- `scope.ts` - Scope management for cleanup
- `provide.ts` - Dependency injection
- `async.ts` - lazy() component loading
- `components/` - Fragment, Portal, Suspense, ErrorBoundary

**Component Lifecycle**:

```typescript
class Component<P> {
  // States: INITIAL → MOUNTING → MOUNTED → DESTROYING → DESTROYED
  protected state: number;
  protected scope: Scope | null;
  protected renderedNodes: AnyNode[];

  mount(parentNode, beforeNode?) {
    this.state = COMPONENT_STATE.MOUNTING;
    this.scope = createScope(this.parentScope);

    this.renderedNodes = runWithScope(this.scope, () => {
      let result = this.component(this.reactiveProps);
      if (isFunction(result)) result = result(this.reactiveProps);
      if (isSignal(result)) result = result.value;
      return insert(parentNode, result, beforeNode) ?? [];
    });

    this.applyProps(); // Events, refs
    this.state = COMPONENT_STATE.MOUNTED;
    triggerMountHooks(this.scope);
  }

  update(prevNode) {
    if (this.key !== prevNode.key) {
      return this.mount(prevNode.parentNode, prevNode.beforeNode);
    }

    this.inheritFromPrevious(prevNode);
    const hasChanges = this.updateReactiveProps();

    if (hasChanges) {
      this.applyProps();
      triggerUpdateHooks(this.scope);
    }
  }

  forceUpdate() {
    // Complete re-render (used by HMR)
    const anchor = this.calculateAnchor();
    runWithScope(this.scope, () => {
      const newNodes = this.renderComponent();
      this.replaceNodes(newNodes, anchor);
    });
    triggerUpdateHooks(this.scope);
  }

  destroy() {
    this.state = COMPONENT_STATE.DESTROYING;
    this.cleanupEventListeners();
    disposeScope(this.scope); // Triggers destroy hooks
    this.removeAllNodes();
    this.state = COMPONENT_STATE.DESTROYED;
  }
}
```

**Scope System** (Critical for cleanup):

```typescript
// packages/template/src/scope.ts
interface Scope {
  parent: Scope | null;
  children: Set<Scope>;
  cleanups: Set<() => void>;
  mountHooks: Set<() => void | (() => void)>;
  updateHooks: Set<() => void>;
  destroyHooks: Set<() => void>;
}

// Automatic cleanup on scope disposal
function disposeScope(scope: Scope) {
  // 1. Trigger destroy hooks
  scope.destroyHooks.forEach(hook => hook());

  // 2. Run cleanup functions
  scope.cleanups.forEach(cleanup => cleanup());

  // 3. Dispose children recursively
  scope.children.forEach(child => disposeScope(child));

  // 4. Remove from parent
  scope.parent?.children.delete(scope);
}
```

**API Summary**:
```typescript
// App
createApp(component, target)
template(html) → factory

// Component
createComponent(fn, props)
isComponent(node)
Component (class)

// Lifecycle
onMount(fn) → cleanup?
onDestroy(fn)
onUpdate(fn)
onCleanup(fn)

// Dependency Injection
provide(key, value)
inject(key, defaultValue?)

// Binding
insert(parent, child, before?)
bindElement(el, prop, getter, setter)
addEventListener(el, event, handler, options?)
mapNodes(template, indexes)
delegateEvents(events[])

// DOM Operations
patchClass(el, prev, next)
normalizeClass(value)
patchStyle(el, prev, next)
setStyle(el, key, value)
patchAttr(el, key, prev, next)
addEvent(el, event, handler)

// DOM Utilities
removeNode(node)
insertNode(parent, node, anchor)
replaceNode(oldNode, newNode)
getFirstDOMNode(node)

// Node Utilities
normalizeNode(node)
isSameNode(a, b)
shallowCompare(a, b)
omitProps(props, keys)

// Hydration (Critical!)
isHydrating()
startHydration()
endHydration()
getHydrationKey()
resetHydrationKey()
hydrate(component, container)
mapSSRNodes(template, indexes)
getRenderedElement()

// Built-in Components
<Fragment>...</Fragment> + isFragment()
<Portal target={...}>...</Portal> + isPortal()
<Suspense fallback={...}>...</Suspense> + isSuspense()
createResource(fetcher)

// Scope
createScope(parent?)
runWithScope(scope, fn)
disposeScope(scope)
getActiveScope()
setActiveScope(scope)
```

### @estjs/server - SSR/SSG

**Key Files** (simplified architecture):
- `render.ts` - `renderToString()`, `render()`, `createSSGComponent()`
- `attrs.ts` - `setSSGAttr()`, `normalizeProps()` for SSG attributes
- `utils.ts` - `convertToString()`, `addAttributes()`
- `index.ts` - Package exports

**SSR Flow**:

```typescript
// Server-side rendering
import { renderToString } from '@estjs/server';
// Or via conditional exports:
import { renderToString } from 'essor'; // Auto-resolves in Node.js

const html = renderToString(App, { title: 'Hello' });

// Client hydration
import { createApp, hydrate } from 'essor'; // Browser entry
createApp(App, '#root'); // Auto-detects SSR HTML and hydrates
```

**SSG Template Rendering** (used by babel-plugin in SSG mode):
```typescript
// Babel transforms JSX to:
const _tmpl = ['<div>', '</div>'];
render(_tmpl, getHydrationKey(),
  createSSGComponent(Child1, {}),
  createSSGComponent(Child2, {})
);
```

**API Summary**:
```typescript
// Core Rendering
renderToString(component, props)     // Full component → HTML string
createSSGComponent(component, props) // Render component during SSG
render(templates, hydrationKey, ...components) // Template interpolation

// Utilities
convertToString(value)    // Convert any value to HTML string
addAttributes(html, key)  // Add hydration attributes to HTML
setSSGAttr(props)         // Set SSG-specific attributes
normalizeProps(props)     // Normalize props for SSG
escapeHTML(str)           // Escape HTML entities (from @estjs/shared)
```

### babel-plugin-essor - JSX Transform

**Key Files**:
- `index.ts` - Plugin entry (Program, FunctionDeclaration, JSXElement visitors)
- `program.ts` - Import injection and module analysis
- `import.ts` - Import rewriting for SSR/browser environments
- `signals/props.ts` - `$` prefix transformation
- `jsx/client.ts` - Client JSX → `template()` calls (38KB, main transformer)
- `jsx/ssg.ts` - SSG JSX → HTML strings (12KB)
- `jsx/tree.ts` - JSX AST → TreeNode representation (24KB)
- `jsx/shared.ts` - Shared JSX utilities (37KB)
- `jsx/context.ts` - Transform context management
- `jsx/constants.ts` - JSX constants
- `hmr.ts` - HMR signature generation and registry injection

**Transformation Pipeline**:

```typescript
// 1. Program visitor: Inject imports based on mode
import { signal, reactive } from '@estjs/signals';
import { template, insert, addEventListener } from '@estjs/template';
// OR for SSG:
import { render, createSSGComponent, getHydrationKey } from '@estjs/server';

// 2. Function visitor: Transform $ prefix
const $count = 0;  →  const $count = signal(0);
const $list = [];  →  const $list = reactive([]);

// 3. JSX visitor (client mode):
<div>{$count}</div>
  ↓
const _tmpl = template('<div></div>');
const _el = _tmpl();
insert(_el, () => $count.value);

// 3. JSX visitor (SSG mode):
<div><Child /></div>
  ↓
const _tmpl = ['<div>', '</div>'];
render(_tmpl, getHydrationKey(), createSSGComponent(Child, {}));

// 4. HMR: Add signature and registry
Component.__hmrId = "fileHash:ComponentName";
Component.__signature = xxHash32(bodyCode);
export const __$registry$__ = [Component1, Component2];
```

**Plugin Options**:
```typescript
{
  symbol: '$',        // Signal prefix (default: '$')
  mode: 'client',     // 'client' | 'ssr' | 'ssg'
  props: true,        // Transform props destructuring
  hmr: true           // Enable HMR (auto-disabled in SSG mode)
}
```

### unplugin-essor - Build Integration

**Key Files**:
- `index.ts` - Unplugin factory (5.8KB)
- `hmr-runtime.js` - HMR runtime code (11KB, 406 lines)
- `types.ts` - TypeScript definitions
- `vite.ts`, `webpack.ts`, `rspack.ts`, etc. - Bundler-specific exports

**HMR Runtime Functions** (packages/unplugin/src/hmr-runtime.js):

```javascript
// Component registry - Maps hmrId → component info
const componentRegistry = new Map();

// Main exports:
createHMRComponent(componentFn, props)  // Wrap component for HMR
shouldUpdate(oldInfo, newFn, newSig)    // Determine if update needed
isHMRComponent(value)                   // Check if HMR-enabled
applyUpdate(registry)                   // Apply updates to components
hmrAccept(bundlerType, hot, registry)   // Main HMR entry point

// Bundler-specific setup:
setupViteHMR(hot)      // For Vite (import.meta.hot)
setupWebpackHMR(hot)   // For Webpack/Rspack (module.hot)
setupStandardHMR(hot)  // Fallback for other bundlers

// Utilities:
extractHMRComponents(module)  // Extract components from module
unregisterAllInstances(hmrId) // Cleanup component instances
getRegistryInfo()             // Debug: get registry state
```

**HMR Update Flow**:
```javascript
// 1. createHMRComponent wraps each component:
const info = {
  componentSignal: signal(componentFn), // Signal wrapping the function
  signature: componentFn.__signature,
  instances: new Set(),  // Track live instances
  cleanups: new Map()    // Cleanup functions per instance
};

// 2. Each instance has an effect watching componentSignal:
effect(() => {
  const _ = info.componentSignal.value;
  if (!isFirstRun) componentInstance.forceUpdate();
});

// 3. On HMR update, applyUpdate() triggers:
info.componentSignal.value = newComponentFn; // Signal update
// → Effect triggers → forceUpdate() → Component re-renders
```

**Bundler Support**:
- Vite, Webpack 4/5, Rollup, esbuild
- Rspack, Farm, Rolldown, Astro

---

## HMR Implementation (Critical!)

**Flow**:
```
1. File change (e.g., constants.ts)
2. Vite triggers HMR for dependent files (Header.tsx)
3. import.meta.hot.accept() re-executes module
4. import { TIMEOUT } gets new value
5. New component function created (closure captures new value)
6. shouldUpdate() detects oldFn !== newFn
7. componentSignal.value = newFn
8. Effect triggers → instance.forceUpdate()
9. Component re-renders with new code
```

**Key Points**:
- Component instances tracked in `_hmrInstances` Set
- Each instance has an effect watching `componentSignal`
- Function identity change triggers update (not just signature)
- `forceUpdate()` does complete re-render

---

## Common Patterns

### Basic Counter
```tsx
function Counter({ initial = 0 }) {
  const $count = initial;
  return (
    <div>
      <span>{$count}</span>
      <button onClick={() => $count++}>+</button>
    </div>
  );
}
```

### Store Pattern
```tsx
const useStore = createStore({
  state: { todos: [] },
  getters: { active: s => s.todos.filter(t => !t.done) },
  actions: {
    add(text) { this.todos.push({ text, done: false }); }
  }
});

function App() {
  const store = useStore();
  let $input = '';
  return (
    <div>
      <input bind:value={$input} />
      <button onClick={() => { store.add($input); $input = ''; }}>
        Add
      </button>
      <ul>{store.active.map(t => <li>{t.text}</li>)}</ul>
    </div>
  );
}
```

### SSR
```tsx
// server.ts
import { renderToString } from '@estjs/server';

// client.ts
import { createApp } from 'essor';
const html = renderToString(App, props);
createApp(App, '#root'); // Auto-hydrates
```

### Async
```tsx
function UserProfile({ id }) {
  const [user] = createResource(() => fetch(`/api/users/${id}`).then(r => r.json()));
  return <div>{user()?.name}</div>;
}

<Suspense fallback={<Loading />}>
  <UserProfile id={1} />
</Suspense>
```

---

## Code Style

- **2-space indent**, LF, no semicolons
- **TypeScript strict mode** required
- **kebab-case** files, **camelCase** functions, **PascalCase** types
- **Bitwise ops** for flags: `flag |= DIRTY`, `flag &= ~DIRTY`

---

## Key Principles

1. **No Virtual DOM** - Direct DOM + fine-grained reactivity
2. **Signal-First** - Everything reactive uses signals
3. **$ Prefix Required** - No `$` = not reactive
4. **Bidirectional Links** - Efficient dependency tracking
5. **Scope-based Cleanup** - Automatic resource management
6. **Type Safety** - Full TypeScript with strict mode

---

## Common Gotchas

1. **$ Prefix Required** - `const count = 0` is NOT reactive
2. **Array Methods** - Use `$list.push()`, not `$list = [...$list, item]`
3. **Hydration** - Server/client HTML must match exactly
4. **Effect Cleanup** - Return cleanup from effects
5. **Scope Context** - Use `runWithScope()` for proper cleanup
6. **HMR** - Function body changes trigger updates

---

## Troubleshooting

```bash
# Build issues
rm -rf packages/*/dist && pnpm run build

# Test failures
pnpm vitest --reporter=verbose

# HMR not working
# Check: babel config, unplugin loaded, console errors

# Hydration mismatch
# Check: server/client HTML match, hydration keys, no client-only code
```

---

## Resources

- **GitHub**: https://github.com/estjs/essor
- **Docs**: https://essor.netlify.app/
- **NPM**: https://www.npmjs.com/package/essor

---

**Philosophy**: Performance + Developer Experience + Type Safety
