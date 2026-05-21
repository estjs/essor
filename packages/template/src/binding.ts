import { isArray, isFunction, isString } from '@estjs/shared';
import { effect } from '@estjs/signals';
import { addEventListener } from './events';
import { getActiveScope, onCleanup } from './scope';

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
}

const IDENTITY = <T>(v: T): T => v;
const EMPTY_FILES = ((): FileList => {
  if (typeof DataTransfer !== 'undefined') return new DataTransfer().files;
  return [] as unknown as FileList;
})();

/** Compare-then-assign for string-coercible `.value` properties. */
function writeValue(el: Element, v: unknown): void {
  const target = el as HTMLInputElement;
  const next = v == null ? '' : String(v);
  if (target.value !== next) target.value = next;
}

const CHECKBOX: Strategy = {
  event: 'change',
  forceChange: true,
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
    const selected = new Set((Array.isArray(v) ? v : []).map(String));
    for (const opt of Array.from(s.options)) opt.selected = selected.has(opt.value);
  },
};

/** Fallback for custom elements / contenteditable hosts — closes over `prop`. */
function customStrategy(prop: string): Strategy {
  return {
    event: 'input',
    read: (el) => (el as any)[prop],
    write(el, v) {
      (el as any)[prop] = v;
    },
  };
}

function resolve(node: Element, prop: string): Strategy {
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
 * Number coercion (Vue parity):
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
 * Vue parity: `<input type="number">` / `<input type="range">` always read as
 * numbers, even without an explicit `{ number: true }`.
 */
function shouldAutoCoerceNumber(node: Element, prop: string): boolean {
  if (prop !== 'value' || node.nodeName !== 'INPUT') return false;
  const t = (node as HTMLInputElement).type;
  return t === 'number' || t === 'range';
}

// ── Public API ──────────────────────────────────────────────

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
 */
export function bindElement(
  node: Element | null,
  prop: 'value' | 'checked' | 'files' | string,
  getter: (() => unknown) | unknown,
  setter: (v: unknown) => void,
  modifiers: BindModifiers = {},
): void {
  if (!node) return;

  // 1. Resolve strategy & pre-compute flags
  const { event, read, write, forceChange, ime } = resolve(node, prop);
  const trim = modifiers.trim === true;
  const toNum = modifiers.number === true || shouldAutoCoerceNumber(node, prop);
  const lazy = modifiers.lazy === true;
  const shouldCast = (trim || toNum) && prop !== 'files';

  const getModel: () => unknown = isFunction(getter) ? (getter as () => unknown) : () => getter;
  const cast: (v: unknown) => unknown = shouldCast
    ? (v) => applyModifiers(v, trim, toNum)
    : IDENTITY;

  // Checkbox group: when a non-radio checkbox is bound to an array model,
  // toggle `el.value` in the array on each change. Detected lazily because
  // the model shape may change over time.
  const isCheckbox =
    node.nodeName === 'INPUT' && prop === 'checked' && (node as HTMLInputElement).type !== 'radio';

  const computeNext = (raw: unknown): unknown => {
    if (isCheckbox) {
      const current = getModel();
      if (isArray(current)) {
        const own = (node as HTMLInputElement).value;
        const next = current.filter((item) => String(item) !== own);
        if (raw) next.push(own);
        return next;
      }
    }
    return cast(raw);
  };

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

  addEventListener(node, eventName, syncToModel);

  // Normalize the displayed value on blur when modifiers are active.
  if (!lazy && shouldCast && eventName !== 'change') {
    addEventListener(node, 'change', () => write(node, cast(read(node))));
  }

  // 3. IME composition guard
  //
  // Track composition state whenever the strategy is IME-aware, even in
  // `lazy` mode — otherwise an external model write during composition would
  // clobber the user's pending input. The only thing `lazy` controls is the
  // DOM→Model commit event (change vs input).
  if (ime) {
    addEventListener(node, 'compositionstart', () => {
      composing = true;
    });
    addEventListener(node, 'compositionend', () => {
      composing = false;
      // In lazy mode we don't sync to the model here — the user still hasn't
      // blurred. In eager mode, mirror Vue: commit the composed text now.
      if (!lazy) syncToModel();
    });
  }

  // 4. Model → DOM
  //   Skip the DOM write when:
  //   - we're inside an IME composition (would clobber pending input), OR
  //   - the input is focused and already shows the canonical value (avoids caret jump).
  // The IME composition guard applies even in `lazy` mode because the model
  // can still change from elsewhere while the user is composing.
  const runner = effect(() => {
    const value = getModel();
    if (ime && composing) return;
    if (ime && !lazy && isFocused(node) && Object.is(cast(read(node)), value)) return;
    write(node, value);
  });

  // 5. Lifecycle cleanup
  if (getActiveScope()) {
    onCleanup(() => runner.stop());
  }
}
