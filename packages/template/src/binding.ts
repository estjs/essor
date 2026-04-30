import { isFunction, isString } from '@estjs/shared';
import { effect } from '@estjs/signals';
import { addEventListener } from './events';
import { getActiveScope, onCleanup } from './scope';

/**
 * Modifiers supported by `bind:*` two-way bindings.
 *
 * - `trim`   strip surrounding whitespace from string values
 * - `number` coerce numeric strings to numbers (no-op on `NaN`)
 * - `lazy`   commit on `change` instead of `input`
 */
export interface BindModifiers {
  trim?: boolean;
  number?: boolean;
  lazy?: boolean;
  [key: string]: boolean | undefined;
}

// ─── Bind Strategy Table ───

interface BindStrategy {
  /** Default DOM event used to sync DOM → model. */
  event: string;
  read: (node: Element) => unknown;
  write: (node: Element, value: unknown) => void;
  /** Force using `change` even when not lazy (e.g. checkbox / select / file). */
  forceChangeEvent?: boolean;
  /** Element accepts free-form text and may emit composition events (IME). */
  needsComposition?: boolean;
}

const INPUT_CHECKBOX_CHECKED: BindStrategy = {
  event: 'change',
  forceChangeEvent: true,
  read: (n) => (n as HTMLInputElement).checked,
  write: (n, v) => {
    const el = n as HTMLInputElement;
    const next = Boolean(v);
    if (el.checked !== next) el.checked = next;
  },
};

const INPUT_RADIO_CHECKED: BindStrategy = {
  event: 'change',
  forceChangeEvent: true,
  read: (n) => {
    const el = n as HTMLInputElement;
    return el.checked ? el.value : '';
  },
  write: (n, v) => {
    const el = n as HTMLInputElement;
    const next = String(v) === el.value;
    if (el.checked !== next) el.checked = next;
  },
};

const INPUT_FILE_FILES: BindStrategy = {
  event: 'change',
  forceChangeEvent: true,
  read: (n) => (n as HTMLInputElement).files,
  // Browsers do not allow programmatic writes to <input type="file">.
  write: () => {},
};

const INPUT_VALUE: BindStrategy = {
  event: 'input',
  needsComposition: true,
  read: (n) => (n as HTMLInputElement).value,
  write: (n, v) => {
    const el = n as HTMLInputElement;
    const next = v == null ? '' : String(v);
    if (el.value !== next) el.value = next;
  },
};

const SELECT_VALUE: BindStrategy = {
  event: 'change',
  forceChangeEvent: true,
  read: (n) => {
    const s = n as HTMLSelectElement;
    return s.multiple ? Array.from(s.selectedOptions, (o) => o.value) : s.value;
  },
  write: (n, v) => {
    const s = n as HTMLSelectElement;
    if (s.multiple) {
      const set = new Set((Array.isArray(v) ? v : []).map(String));
      for (const opt of Array.from(s.options)) opt.selected = set.has(opt.value);
    } else {
      const next = v == null ? '' : String(v);
      if (s.value !== next) s.value = next;
    }
  },
};

const TEXTAREA_VALUE: BindStrategy = {
  event: 'input',
  needsComposition: true,
  read: (n) => (n as HTMLTextAreaElement).value,
  write: (n, v) => {
    const el = n as HTMLTextAreaElement;
    const next = v == null ? '' : String(v);
    if (el.value !== next) el.value = next;
  },
};

/**
 * Resolves the read/write/event strategy for a DOM element + prop combination.
 */
function resolveStrategy(node: Element, prop: string): BindStrategy {
  const tag = node.nodeName;
  if (tag === 'INPUT') {
    const type = (node as HTMLInputElement).type;
    if (prop === 'checked') {
      return type === 'radio' ? INPUT_RADIO_CHECKED : INPUT_CHECKBOX_CHECKED;
    }
    if (prop === 'files') return INPUT_FILE_FILES;
    return INPUT_VALUE;
  }
  if (tag === 'SELECT') return SELECT_VALUE;
  if (tag === 'TEXTAREA') return TEXTAREA_VALUE;
  // Fallback for custom elements or contenteditable hosts.
  return {
    event: 'input',
    read: (n) => (n as any)[prop],
    write: (n, v) => {
      (n as any)[prop] = v;
    },
  };
}

/**
 * Applies built-in modifiers (trim, number) to a raw value.
 */
function castValue(val: unknown, trim?: boolean, number?: boolean): unknown {
  if (!isString(val)) return val;
  if (trim) val = (val as string).trim();
  if (number && val !== '') {
    const parsed = Number(val);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return val;
}

/** Whether `node` is the currently focused element (Document / ShadowRoot aware). */
function isFocused(node: Element): boolean {
  const root = node.getRootNode();
  return (root instanceof Document || root instanceof ShadowRoot) && root.activeElement === node;
}

/**
 * Synchronizes a DOM element property with a model getter and setter.
 *
 * @param node      The element to bind. `null` is tolerated (no-op).
 * @param prop      Bound property: `value` / `checked` / `files` / arbitrary.
 * @param getter    Reactive getter or static initial value.
 * @param setter    Receives the new value when the user edits the DOM.
 * @param modifiers Optional `BindModifiers`.
 */
export function bindElement(
  node: Element | null,
  prop: 'value' | 'checked' | 'files' | string,
  getter: (() => unknown) | unknown,
  setter: (value: unknown) => void,
  modifiers: BindModifiers = {},
): void {
  if (!node) return;

  const strategy = resolveStrategy(node, prop);
  const { trim, number, lazy } = modifiers;
  const isFiles = prop === 'files';

  const readModel = (): unknown => (isFunction(getter) ? (getter as () => unknown)() : getter);

  // File inputs hold a `FileList` and never benefit from string casting.
  const transform = (v: unknown): unknown => (isFiles ? v : castValue(v, trim, number));

  // ── DOM → Model ──
  const eventName = lazy || strategy.forceChangeEvent ? 'change' : strategy.event;

  // Closure flag (avoids polluting the DOM node with a `_composing` property).
  let composing = false;

  const syncFromDom = (): void => {
    if (composing) return;
    const raw = strategy.read(node);
    if (raw === undefined) return;

    if (isFiles) {
      setter(raw);
      return;
    }

    const next = transform(raw);
    if (!Object.is(readModel(), next)) {
      setter(next);
    }
  };

  addEventListener(node, eventName, syncFromDom);

  // For trim/number, also normalize the displayed value on `change` (blur), so the
  // input shows the canonical form (e.g. trimmed whitespace) even when bound lazily.
  if (!lazy && !isFiles && (trim || number) && eventName !== 'change') {
    addEventListener(node, 'change', () => {
      strategy.write(node, transform(strategy.read(node)));
    });
  }

  // IME composition: pause sync during composition; resume on end.
  if (strategy.needsComposition && !lazy) {
    addEventListener(node, 'compositionstart', () => {
      composing = true;
    });
    addEventListener(node, 'compositionend', () => {
      if (!composing) return;
      composing = false;
      // Run the same sync path now that composition has finished.
      syncFromDom();
    });
  }

  // ── Model → DOM ──
  const runner = effect(() => {
    const value = readModel();

    // Avoid disturbing the user while they are typing in a focused text input.
    if (strategy.needsComposition && !lazy && isFocused(node)) {
      if (composing) return;
      const current = transform(strategy.read(node));
      if (Object.is(current, value)) return;
    }

    strategy.write(node, value);
  });

  if (getActiveScope()) {
    onCleanup(() => runner.stop());
  }
}
