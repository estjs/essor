# Portal

The `Portal` component lets you render children into any DOM node in the document, bypassing the parent component's DOM hierarchy. This is useful for modals, popovers, notifications, and other overlay UI elements that sit on top of the rest of the page.

## Basic Usage

```tsx
import { Portal } from '@estjs/template';

function Modal({ onClose, children }) {
  return (
    <Portal target={document.body}>
      <div class="modal-overlay" onClick={onClose}>
        <div class="modal-content" onClick={e => e.stopPropagation()}>
          {children}
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </Portal>
  );
}

function App() {
  const $isOpen = false;

  return (
    <>
      <button onClick={() => ($isOpen = true)}>Open modal</button>
      {() => $isOpen && <Modal onClose={() => ($isOpen = false)}>Hello Essor</Modal>}
    </>
  );
}
```

In this example, the modal content is rendered into `document.body` regardless of where `Modal` lives in the component tree. `$isOpen` is automatically transformed into a `signal` by the Essor compiler — assignment triggers a re-render, no `useState` required.

## Dynamic Target

`target` accepts an `Element`, a CSS selector string, or a **getter function** that returns either of those. When the signals the getter depends on change, Portal automatically re-mounts to the new target node:

```tsx
import { Portal } from '@estjs/template';

function Tooltip({ content }: { content: string }) {
  // The $ prefix is auto-converted to a signal by the compiler
  const $targetId = 'tooltip-anchor';

  return (
    <>
      <button onClick={() => ($targetId = 'another-anchor')}>Switch anchor</button>
      {/* Pass a getter to keep target reactive */}
      <Portal target={() => `#${$targetId}`}>
        <div class="tooltip">{content}</div>
      </Portal>
    </>
  );
}
```

You can also pass a string selector directly:

```tsx
<Portal target="#sidebar">
  <nav>Sidebar navigation</nav>
</Portal>
```

## Disabling the Portal

Use the `disabled` prop to render the content inline at the call site instead of teleporting it. This is handy for responsive layouts or SSR scenarios. `disabled` also accepts a getter, so it can react to signals:

```tsx
import { Portal } from '@estjs/template';

function ResponsiveDialog({ children }) {
  const $isMobile = window.matchMedia('(max-width: 768px)').matches;

  return (
    <Portal target={document.body} disabled={() => $isMobile}>
      <div class="dialog">{children}</div>
    </Portal>
  );
}
```

## Event Bubbling

Note that elements rendered through a Portal are detached in the actual DOM, but events still bubble along the **component tree** hierarchy.

## Multiple Portals

You can use multiple Portals in the same component to render content into different containers:

```tsx
function SplitContent() {
  return (
    <div>
      <h1>Main content</h1>
      <Portal target="#sidebar">
        <nav>Sidebar navigation</nav>
      </Portal>
      <Portal target="#footer">
        <footer>Footer content</footer>
      </Portal>
    </div>
  );
}
```

## Automatic Cleanup

Portal handles cleanup automatically. When the component containing the Portal unmounts, the portal-rendered content is removed from the DOM and all reactive effects are disposed.

## API

### Props

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `children` | `JSX.Element \| JSX.Element[] \| null` | - | Content to render into the target container |
| `target` | `string \| Element \| (() => string \| Element \| null \| undefined)` | - | Target container — a CSS selector, an `Element`, or a getter returning either; the getter's signal dependencies trigger automatic re-mount |
| `disabled` | `boolean \| (() => boolean)` | `false` | When `true`, renders inline at the call site instead of teleporting to `target` |

### Return Value

The Portal's placeholder in the component tree is a comment node; the actual content is rendered into the container resolved from `target`.


## Common Use Cases

Portal is commonly used in the following scenarios:

- **Modals and dialogs**: Render at the top level to avoid z-index and positioning issues
- **Tooltips and popovers**: Render near any element without being constrained by parent `overflow`
- **Notifications and toasts**: Render at a fixed position regardless of app layout
- **Floating elements**: Such as viewport-fixed navigation bars, chat windows, etc.
- **Third-party container integration**: Render into DOM nodes outside the application root

## Best Practices

- Use Portal to solve CSS context and layout constraint problems
- Provide a valid DOM element (or selector that resolves to one) for `target`
- Be mindful of event bubbling — you may need to call `stopPropagation` manually
- Avoid heavy state management inside Portal content; keep it simple
- Consider accessibility so that Portal content is friendly to screen readers
