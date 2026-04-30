# Portal

The `Portal` component lets you render children into a DOM node anywhere in the document, bypassing the parent component's DOM hierarchy. This is useful for modals, tooltips, notifications, and other overlay UI elements.

## Basic Usage

```tsx
import { Portal } from '@estjs/template';

function Modal({ isOpen, onClose, children }) {
  if (!isOpen) return null;

  return (
    <Portal mount={document.body}>
      <div class="modal-overlay" onClick={onClose}>
        <div class="modal-content" onClick={e => e.stopPropagation()}>
          {children}
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </Portal>
  );
}
```

In this example, regardless of where `Modal` is in the component tree, the modal content is rendered into `document.body`.

## Dynamic Container

The portal target can be any DOM element and can be resolved dynamically:

```tsx
import { Portal } from '@estjs/template';

function Tooltip({ content, targetRef }) {
  if (!targetRef) return null;

  return (
    <Portal mount={targetRef}>
      <div class="tooltip">{content}</div>
    </Portal>
  );
}
```

## Event Bubbling

Note that elements rendered through a Portal still bubble events according to the component tree hierarchy, even though they are separated in the actual DOM structure.

## Multiple Portals

You can use multiple Portals in the same component to render content into different containers:

```tsx
function SplitContent() {
  return (
    <div>
      <h1>Main Content</h1>
      <Portal mount={document.querySelector('#sidebar')}>
        <nav>Sidebar navigation</nav>
      </Portal>
      <Portal mount={document.querySelector('#footer')}>
        <footer>Footer content</footer>
      </Portal>
    </div>
  );
}
```

## Cleanup

Portal automatically handles cleanup. When the component containing the Portal unmounts, the portal-rendered content is also removed from the DOM.

## API

### Props

| Property | Type | Default | Description |
| --- | --- | --- | --- |
| `children` | `JSX.Element \| JSX.Element[] \| null` | - | Content to render into the target container |
| `mount` | `Element` | - | Target DOM element |
| `useShadow` | `boolean` | `false` | Whether to use Shadow DOM |

## Common Use Cases

- **Modals and dialogs**: Render at the top level to avoid z-index and positioning issues
- **Tooltips and popovers**: Render near any element without being constrained by parent `overflow`
- **Notifications and toasts**: Render at a fixed position on the page
- **Floating elements**: Such as viewport-fixed navigation bars, chat windows, etc.

## Best Practices

- Use Portal to solve CSS context and layout constraint problems
- Ensure the portal target is a valid DOM element
- Be aware of event bubbling behavior; you may need to manually stop event propagation
- Keep Portal content simple; avoid complex state management inside portals
- Consider accessibility so that portal content is friendly to screen readers
