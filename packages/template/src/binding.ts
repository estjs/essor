import { isFunction, isString } from '@estjs/shared';
import { effect } from '@estjs/signals';
import { addEventListener } from './events';
import { getActiveScope, onCleanup } from './scope';

/**
 * Modifiers for `bind:*` two-way bindings.
 *
 * - `trim`   — strip surrounding whitespace
 * - `number` — coerce numeric strings to numbers (no-op on NaN)
 * - `lazy`   — commit on `change` instead of `input`
 */
export interface BindModifiers {
  trim?: boolean;
  number?: boolean;
  lazy?: boolean;
  [key: string]: boolean | undefined;
}

// ── Strategy ──

interface Strategy {
  /** DOM event that triggers a DOM→Model read. */
  event: string;
  /** Read the bound value from the DOM element. */
  read(el: Element): unknown;
  /** Write a model value into the DOM element. */
  write(el: Element, v: unknown): void;
  /** Always listen on `change` regardless of `lazy` (checkbox, radio, select, file). */
  forceChange?: true;
  /** Needs IME composition guard (text inputs, textareas). */
  ime?: true;
}

// ── Shared DOM Writer ──

/**
 * Compare-then-assign for string-coercible `.value` properties.
 * Shared by text input, textarea, and single-select strategies.
 */
function writeValue(el: Element, v: unknown): void {
  const target = el as HTMLInputElement;
  const next = v == null ? '' : String(v);
  if (target.value !== next) target.value = next;
}

// ── Strategies ──

const CHECKBOX: Strategy = {
  event: 'change',
  forceChange: true,
  read: (el) => (el as HTMLInputElement).checked,
  write(el, v) {
    const e = el as HTMLInputElement;
    const next = Boolean(v);
    if (e.checked !== next) e.checked = next;
  },
};

const RADIO: Strategy = {
  event: 'change',
  forceChange: true,
  read(el) {
    const e = el as HTMLInputElement;
    return e.checked ? e.value : '';
  },
  write(el, v) {
    const e = el as HTMLInputElement;
    const next = String(v) === e.value;
    if (e.checked !== next) e.checked = next;
  },
};

const FILE: Strategy = {
  event: 'change',
  forceChange: true,
  read: (el) => (el as HTMLInputElement).files,
  write() { }, // browsers forbid programmatic writes to file inputs
};

const TEXT: Strategy = {
  event: 'input',
  ime: true,
  read: (el) => (el as HTMLInputElement).value,
  write: writeValue,
};

const TEXTAREA: Strategy = {
  event: 'input',
  ime: true,
  read: (el) => (el as HTMLTextAreaElement).value,
  write: writeValue,
};

const SELECT: Strategy = {
  event: 'change',
  forceChange: true,
  read(el) {
    const s = el as HTMLSelectElement;
    return s.multiple ? Array.from(s.selectedOptions, (o) => o.value) : s.value;
  },
  write(el, v) {
    const s = el as HTMLSelectElement;
    if (s.multiple) {
      const selected = new Set((Array.isArray(v) ? v : []).map(String));
      for (const opt of Array.from(s.options)) opt.selected = selected.has(opt.value);
    } else {
      writeValue(el, v);
    }
  },
};

// ── Resolution ──

function resolve(node: Element, prop: string): Strategy {
  switch (node.nodeName) {
    case 'INPUT':
      if (prop === 'checked') return (node as HTMLInputElement).type === 'radio' ? RADIO : CHECKBOX;
      if (prop === 'files') return FILE;
      return TEXT;
    case 'SELECT':
      return SELECT;
    case 'TEXTAREA':
      return TEXTAREA;
    default:
      // Fallback for custom elements or contenteditable hosts
      return {
        event: 'input',
        read: (el) => (el as any)[prop],
        write(el, v) {
          (el as any)[prop] = v;
        },
      };
  }
}

// ── Modifier Transform ──

/** Apply trim / number modifiers to a raw DOM value. No-op for non-strings. */
function applyModifiers(v: unknown, trim: boolean, toNum: boolean): unknown {
  if (!isString(v)) return v;
  let s = v as string;
  if (trim) s = s.trim();
  if (toNum && s !== '') {
    const n = Number(s);
    if (!Number.isNaN(n)) return n;
  }
  return s;
}

// ── Focus Detection ──

/** Whether `el` is the active element (Document / ShadowRoot aware). */
function isFocused(el: Element): boolean {
  const root = el.getRootNode();
  return (root instanceof Document || root instanceof ShadowRoot) && root.activeElement === el;
}

// ── Public API ──

/**
 * Creates a two-way binding between a DOM element property and a reactive model.
 *
 * - **Model → DOM** — a reactive `effect()` pushes model changes to the element.
 * - **DOM → Model** — an event listener reads user input and calls `setter`.
 *
 * @param node      Target element. `null` is tolerated (no-op).
 * @param prop      Bound property (`value` / `checked` / `files` / custom).
 * @param getter    Reactive getter, or a static initial value.
 * @param setter    Called with the (optionally transformed) DOM value on user input.
 * @param modifiers Optional `{ trim, number, lazy }`.
 */
export function bindElement(
  node: Element | null,
  prop: 'value' | 'checked' | 'files' | string,
  getter: (() => unknown) | unknown,
  setter: (v: unknown) => void,
  modifiers: BindModifiers = {},
): void {
  if (!node) return;

  // ── 1. Resolve strategy & pre-compute flags ──

  const { event, read, write, forceChange, ime } = resolve(node, prop);

  const trim = modifiers.trim === true;
  const toNum = modifiers.number === true;
  const lazy = modifiers.lazy === true;
  const shouldCast = (trim || toNum) && prop !== 'files';

  // Resolve getter shape once — avoid per-read `isFunction` branching.
  const getModel = isFunction(getter) ? (getter as () => unknown) : () => getter;

  // Unified transform: identity when no modifiers apply.
  const cast = shouldCast ? (v: unknown) => applyModifiers(v, trim, toNum) : (v: unknown) => v;

  // ── 2. DOM → Model ──

  let composing = false;
  const eventName = lazy || forceChange ? 'change' : event;

  const syncToModel = (): void => {
    if (composing) return;
    const raw = read(node);
    if (raw === undefined) return;
    const next = cast(raw);
    if (!Object.is(getModel(), next)) setter(next);
  };

  addEventListener(node, eventName, syncToModel);

  // Normalize the displayed value on blur (trim whitespace, format number)
  // when modifiers are active and primary event is not already `change`.
  if (!lazy && shouldCast && eventName !== 'change') {
    addEventListener(node, 'change', () => write(node, cast(read(node))));
  }

  // ── 3. IME composition guard ──

  if (ime && !lazy) {
    addEventListener(node, 'compositionstart', () => {
      composing = true;
    });
    addEventListener(node, 'compositionend', () => {
      if (!composing) return;
      composing = false;
      syncToModel();
    });
  }

  // ── 4. Model → DOM ──

  const runner = effect(() => {
    const value = getModel();

    // Don't disturb focused text inputs or ongoing IME sessions.
    if (ime && !lazy && isFocused(node)) {
      if (composing) return;
      if (Object.is(cast(read(node)), value)) return;
    }

    write(node, value);
  });

  // ── 5. Lifecycle cleanup ──

  if (getActiveScope()) {
    onCleanup(() => runner.stop());
  }
}
