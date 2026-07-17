import { isArray, isFunction, isString, warn } from '@estjs/shared';
import { effect } from '@estjs/signals';
import { addEventListener } from './events';
import { getActiveScope, onCleanup } from './scope';
import { isHydrating, isNodeHydrated } from './hydration';

/**
 * Modifiers for `bind:*` two-way bindings.
 *
 * - `trim`   — strip surrounding whitespace
 * - `number` — coerce numeric strings to numbers (no-op on NaN / blank)
 * - `lazy`   — commit on `change` instead of `input`
 *
 * Unknown keys are ignored at runtime; the compiler rejects them at build time.
 */
export interface BindModifiers {
  trim?: boolean;
  number?: boolean;
  lazy?: boolean;
}

/** Whitelist mirrored by the compiler — kept in sync with `BindModifiers`. */
export const BIND_MODIFIER_KEYS = ['trim', 'number', 'lazy'] as const;

// ── Strategy ────────────────────────────────────────────────

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
  /** Supports checkbox-group array semantics — model holds an array of values. */
  checkboxArray?: true;
}

const IDENTITY = <T>(v: T): T => v;
const NOOP_DISPOSE = (): void => {};
const EMPTY_FILES = ((): FileList => {
  if (typeof DataTransfer !== 'undefined') return new DataTransfer().files;
  return [] as unknown as FileList;
})();
const checkboxArraySnapshots = new WeakMap<unknown[], unknown[]>();

/** Compare-then-assign for string-coercible `.value` properties. */
function writeValue(el: Element, v: unknown): void {
  const target = el as HTMLInputElement;
  const next = v == null ? '' : String(v);
  if (target.value !== next) target.value = next;
}

const CHECKBOX: Strategy = {
  event: 'change',
  forceChange: true,
  checkboxArray: true,
  read: (el) => (el as HTMLInputElement).checked,
  write(el, v) {
    const e = el as HTMLInputElement;
    // Array-mode (checkbox group): "checked" iff this element's value is in the array.
    const next = isArray(v) ? v.map(String).includes(e.value) : Boolean(v);
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
  write(el, v) {
    // Browsers forbid programmatic writes to <input type=file>, except via a
    // DataTransfer FileList. Allow clearing the selection when v is nullish.
    if (v != null) return;
    try {
      (el as HTMLInputElement).files = EMPTY_FILES;
    } catch {
      /* sandbox / hostile browser */
    }
  },
};

// Shared by <input type=text|...> and <textarea>: same event, same .value plumbing.
const TEXT_LIKE: Strategy = {
  event: 'input',
  ime: true,
  read: (el) => (el as HTMLInputElement | HTMLTextAreaElement).value,
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
    if (!s.multiple) return writeValue(el, v);
    const selected = new Set((isArray(v) ? v : []).map(String));
    for (const opt of Array.from(s.options)) opt.selected = selected.has(opt.value);
  },
};

/**
 * Property names that must never be writable through the generic custom-prop
 * binding: raw HTML sinks (`innerHTML` / `srcdoc`) that would bypass the
 * attribute-layer safety policy (operations/attr.ts refuses the same sinks),
 * the subtree-destroying `outerHTML`, plus inline `on*` event handlers.
 * `textContent` is deliberately allowed — it is a plain-text assignment, not
 * an HTML sink, and is the documented channel for contenteditable hosts.
 * Compared lowercase.
 */
const FORBIDDEN_CUSTOM_PROPS = new Set(['innerhtml', 'outerhtml', 'srcdoc']);

function isForbiddenCustomProp(prop: string): boolean {
  const lower = prop.toLowerCase();
  return FORBIDDEN_CUSTOM_PROPS.has(lower) || lower.startsWith('on');
}

/** Fallback for custom elements / contenteditable hosts — closes over `prop`. */
function customStrategy(prop: string): Strategy | null {
  // Security guard: refuse HTML sinks and inline handlers — an arbitrary
  // `bind:innerHTML` would be a direct XSS channel around the attr policy.
  // Returning null makes bindElement bail out before wiring any listener,
  // effect or disposer.
  if (isForbiddenCustomProp(prop)) {
    if (__DEV__) {
      warn(`[bind] property "${prop}" is not bindable (unsafe sink); the binding is a no-op.`);
    }
    return null;
  }
  return {
    event: 'input',
    read: (el) => (el as any)[prop],
    write(el, v) {
      (el as any)[prop] = v;
    },
  };
}

function resolve(node: Element, prop: string): Strategy | null {
  switch (node.nodeName) {
    case 'INPUT':
      if (prop === 'checked') return (node as HTMLInputElement).type === 'radio' ? RADIO : CHECKBOX;
      if (prop === 'files') return FILE;
      if (prop === 'value') return TEXT_LIKE;
      // Unknown INPUT prop → custom strategy (don't pretend it's a text input).
      return customStrategy(prop);
    case 'SELECT':
      return SELECT;
    case 'TEXTAREA':
      return TEXT_LIKE;
    default:
      return customStrategy(prop);
  }
}

// ── Modifier Transform ──────────────────────────────────────

/**
 * Apply trim / number modifiers to a raw DOM value. No-op for non-strings.
 *
 * Number coercion behaviour:
 * - Blank / whitespace-only inputs return the original string unchanged
 *   (otherwise `Number(' ')` would silently produce `0`).
 * - Non-numeric strings (NaN) also return the original string.
 */
function applyModifiers(v: unknown, trim: boolean, toNum: boolean): unknown {
  if (!isString(v)) return v;
  const s = trim ? v.trim() : v;
  if (toNum) {
    const probe = trim ? s : s.trim();
    if (probe !== '') {
      const n = Number(probe);
      if (!Number.isNaN(n)) return n;
    }
  }
  return s;
}

/** Whether `el` is the active element (Document / ShadowRoot aware). */
function isFocused(el: Element): boolean {
  const root = el.getRootNode();
  return (root instanceof Document || root instanceof ShadowRoot) && root.activeElement === el;
}

/**
 * `<input type="number">` / `<input type="range">` always read as
 * numbers, even without an explicit `{ number: true }`.
 */
function shouldAutoCoerceNumber(node: Element, prop: string): boolean {
  if (prop !== 'value' || node.nodeName !== 'INPUT') return false;
  const t = (node as HTMLInputElement).type;
  return t === 'number' || t === 'range';
}

// ── Public API ──────────────────────────────────────────────

/**
 * Whether a form control has been touched before hydration attached: user
 * typing / browser autofill / password managers change `value` away from the
 * SSR-rendered `defaultValue` (same for `checked` vs `defaultChecked`), and a
 * focused control is being interacted with right now.
 */
function isDirtyBeforeHydration(node: Element, prop: string): boolean {
  if (isFocused(node)) return true;
  if (node.nodeName === 'INPUT') {
    const input = node as HTMLInputElement;
    if (prop === 'checked') return input.checked !== input.defaultChecked;
    if (prop === 'value') return input.value !== input.defaultValue;
    return false;
  }
  if (node.nodeName === 'TEXTAREA') {
    const area = node as HTMLTextAreaElement;
    return area.value !== area.defaultValue;
  }
  if (node.nodeName === 'SELECT') {
    for (const option of (node as HTMLSelectElement).options) {
      if (option.selected !== option.defaultSelected) return true;
    }
  }
  return false;
}

/**
 * Creates a two-way binding between a DOM element property and a reactive model.
 *
 * - Model → DOM via a reactive `effect()`.
 * - DOM → Model via an event listener that calls `setter`.
 *
 * @param node      Target element. `null` is tolerated (no-op).
 * @param prop      Bound property (`value` / `checked` / `files` / custom).
 * @param getter    Reactive getter, or a static initial value.
 * @param setter    Called with the (optionally transformed) DOM value on user input.
 * @param modifiers Optional `{ trim, number, lazy }`.
 * @returns Idempotent disposer that stops the effect and removes all
 *   listeners. With an active scope, cleanup is also automatic; standalone
 *   callers must invoke the disposer to release the binding.
 */
export function bindElement(
  node: Element | null,
  prop: 'value' | 'checked' | 'files' | string,
  getter: (() => unknown) | unknown,
  setter: (v: unknown) => void,
  modifiers: BindModifiers = {},
): () => void {
  if (!node) return NOOP_DISPOSE;

  // 1. Resolve strategy & pre-compute flags. A null strategy means the prop
  // is a forbidden sink — bail before installing any listener,
  // effect or disposer.
  const strategy = resolve(node, prop);
  if (!strategy) return NOOP_DISPOSE;
  const { event, read, write, forceChange, ime, checkboxArray } = strategy;
  const trim = modifiers.trim === true;
  const toNum = modifiers.number === true || shouldAutoCoerceNumber(node, prop);
  const lazy = modifiers.lazy === true;
  const shouldCast = (trim || toNum) && prop !== 'files';

  const getModel: () => unknown = isFunction(getter) ? (getter as () => unknown) : () => getter;
  const cast: (v: unknown) => unknown = shouldCast
    ? (v) => applyModifiers(v, trim, toNum)
    : IDENTITY;

  // Collect every resource this binding creates so dispose() can release them.
  const disposers: Array<() => void> = [];

  // Checkbox group: when a non-radio checkbox is bound to an array model,
  // toggle `el.value` in the array on each change. Decided lazily per-event
  // because the model shape may change over time.
  const computeNext: (raw: unknown) => unknown = checkboxArray
    ? (raw) => {
        const current = getModel();
        if (!isArray(current)) {
          return cast(raw);
        }
        const own = (node as HTMLInputElement).value;
        const source = checkboxArraySnapshots.get(current) ?? current;
        const next = source.filter((item) => String(item) !== own);
        if (raw) next.push(own);
        checkboxArraySnapshots.set(current, next);
        return next;
      }
    : cast;

  // 2. DOM → Model
  let composing = false;
  const eventName = lazy || forceChange ? 'change' : event;

  const syncToModel = (): void => {
    if (composing) return;
    const raw = read(node);
    if (raw === undefined) return;
    const next = computeNext(raw);
    if (!Object.is(getModel(), next)) setter(next);
  };

  disposers.push(addEventListener(node, eventName, syncToModel));

  // Normalize the displayed value on blur when modifiers are active.
  if (!lazy && shouldCast && eventName !== 'change') {
    disposers.push(addEventListener(node, 'change', () => write(node, cast(read(node)))));
  }

  // 3. IME composition guard — track state whenever the strategy is IME-aware,
  // even in `lazy` mode, otherwise an external model write during composition
  // would clobber pending input. `lazy` only controls the commit event.
  if (ime) {
    disposers.push(
      addEventListener(node, 'compositionstart', () => {
        composing = true;
      }),
    );
    disposers.push(
      addEventListener(node, 'compositionend', () => {
        composing = false;
        // Lazy waits for blur; eager commits the composed text now.
        if (!lazy) syncToModel();
      }),
    );
  }

  // 4. Model → DOM — skip the write when (a) inside an IME composition or
  // (b) the focused input already shows the canonical value (avoids caret jump).
  //
  // Hydration policy: during the FIRST run while hydrating, do not
  // clobber the DOM. If the control is untouched, the SSR markup already
  // shows the model value — skip the write. If the user (or autofill) already
  // changed it before the bundle attached, adopt the DOM value into the model
  // instead of overwriting the user's input. Only applies to nodes adopted
  // from SSR markup — a control freshly created on the client during a
  // claim-mismatch fallback has no SSR value and needs its first write.
  let hydrationFirstRun = isHydrating() && isNodeHydrated(node);
  const runner = effect(() => {
    const value = getModel();
    if (checkboxArray) {
      if (isArray(value)) checkboxArraySnapshots.set(value, [...value]);
    }
    if (hydrationFirstRun) {
      hydrationFirstRun = false;
      if (isDirtyBeforeHydration(node, prop)) {
        syncToModel(); // user input wins — DOM → model once
      }
      return; // clean control: SSR markup already matches the model
    }
    if (ime && composing) return;
    if (ime && !lazy && isFocused(node) && Object.is(cast(read(node)), value)) return;
    write(node, value);
  });

  // 5. Lifecycle cleanup — idempotent disposer; auto-registered with a scope.
  let disposed = false;
  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    runner.stop();
    for (const d of disposers) d();
    disposers.length = 0;
  };

  if (getActiveScope()) {
    onCleanup(dispose);
  }

  return dispose;
}
