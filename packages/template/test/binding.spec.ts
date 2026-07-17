import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { signal } from '@estjs/signals';
import { bindElement } from '../src/binding';
import { addEventListener } from '../src/events';
import { beginHydration, endHydration, markNodeHydrated } from '../src/hydration';
import {
  cleanupContext,
  createContext,
  popContextStack,
  pushContextStack,
  resetEnvironment,
} from './test-utils';

describe('binding utilities', () => {
  beforeEach(() => {
    resetEnvironment();
  });

  describe('addEventListener', () => {
    it('registers event listeners with context cleanup', () => {
      const context = createContext(null);
      pushContextStack(context);

      const button = document.createElement('button');
      const handler = vi.fn();

      addEventListener(button, 'click', handler);
      popContextStack();

      button.dispatchEvent(new Event('click'));
      expect(handler).toHaveBeenCalledTimes(1);

      cleanupContext(context);
      button.dispatchEvent(new Event('click'));
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('adds event listener without context', () => {
      const button = document.createElement('button');
      const handler = vi.fn();

      addEventListener(button, 'click', handler);
      button.dispatchEvent(new Event('click'));
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('supports event listener options', () => {
      const context = createContext(null);
      pushContextStack(context);

      const button = document.createElement('button');
      const handler = vi.fn();

      addEventListener(button, 'click', handler, { once: true });
      popContextStack();

      button.dispatchEvent(new Event('click'));
      button.dispatchEvent(new Event('click'));
      expect(handler).toHaveBeenCalledTimes(1);
    });
  });

  describe('bindElement', () => {
    it('is a no-op when node is null', () => {
      const setter = vi.fn();
      let dispose!: () => void;
      expect(() => {
        dispose = bindElement(null, 'value', '', setter);
      }).not.toThrow();
      expect(setter).not.toHaveBeenCalled();
      // The returned disposer is a callable no-op (BIND-04).
      expect(() => dispose()).not.toThrow();
    });

    describe('checkbox', () => {
      it('binds DOM <-> model both ways', () => {
        const input = document.createElement('input');
        input.type = 'checkbox';
        const s = signal(false);

        bindElement(
          input,
          'checked',
          () => s.value,
          (v) => (s.value = v as boolean),
        );

        // Model -> DOM
        expect(input.checked).toBe(false);
        s.value = true;
        expect(input.checked).toBe(true);

        // DOM -> Model
        input.checked = false;
        input.dispatchEvent(new Event('change'));
        expect(s.value).toBe(false);

        input.checked = true;
        input.dispatchEvent(new Event('change'));
        expect(s.value).toBe(true);
      });
    });

    describe('radio', () => {
      it('writes value when checked, empty string otherwise', () => {
        const input = document.createElement('input');
        input.type = 'radio';
        input.value = 'option1';
        const s = signal('');

        bindElement(
          input,
          'checked',
          () => s.value,
          (v) => (s.value = v as string),
        );

        input.checked = true;
        input.dispatchEvent(new Event('change'));
        expect(s.value).toBe('option1');

        // Model drives DOM (matching value -> checked)
        s.value = 'option1';
        expect(input.checked).toBe(true);

        s.value = 'other';
        expect(input.checked).toBe(false);
      });
    });

    describe('file', () => {
      it('forwards FileList to setter on change', () => {
        const input = document.createElement('input');
        input.type = 'file';
        const setter = vi.fn();

        bindElement(input, 'files', null, setter);

        Object.defineProperty(input, 'files', {
          configurable: true,
          value: ['file1'],
        });

        input.dispatchEvent(new Event('change'));
        expect(setter).toHaveBeenCalledWith(['file1']);
      });
    });

    describe('text input', () => {
      it('uses input event by default and updates signal', () => {
        const input = document.createElement('input');
        const s = signal('');

        bindElement(
          input,
          'value',
          () => s.value,
          (v) => (s.value = v as string),
        );

        input.value = 'hello';
        input.dispatchEvent(new Event('input'));
        expect(s.value).toBe('hello');

        s.value = 'world';
        expect(input.value).toBe('world');
      });

      it('writes empty string when model is null/undefined', () => {
        const input = document.createElement('input');
        bindElement(input, 'value', () => null, vi.fn());
        expect(input.value).toBe('');
      });
    });

    describe('select', () => {
      it('binds single-select on change', () => {
        const select = document.createElement('select');
        for (const v of ['a', 'b']) {
          const opt = document.createElement('option');
          opt.value = v;
          select.appendChild(opt);
        }
        const s = signal('a');

        bindElement(
          select,
          'value',
          () => s.value,
          (v) => (s.value = v as string),
        );

        select.value = 'b';
        select.dispatchEvent(new Event('change'));
        expect(s.value).toBe('b');

        s.value = 'a';
        expect(select.value).toBe('a');
      });

      it('binds multi-select to an array model', () => {
        const select = document.createElement('select');
        select.multiple = true;
        for (const v of ['a', 'b', 'c']) {
          const opt = document.createElement('option');
          opt.value = v;
          select.appendChild(opt);
        }
        const s = signal<string[]>([]);

        bindElement(
          select,
          'value',
          () => s.value,
          (v) => (s.value = v as string[]),
        );

        (select.options[0] as HTMLOptionElement).selected = true;
        (select.options[2] as HTMLOptionElement).selected = true;
        select.dispatchEvent(new Event('change'));
        expect(s.value).toEqual(['a', 'c']);

        // Model -> DOM
        s.value = ['b'];
        expect((select.options[0] as HTMLOptionElement).selected).toBe(false);
        expect((select.options[1] as HTMLOptionElement).selected).toBe(true);
        expect((select.options[2] as HTMLOptionElement).selected).toBe(false);
      });
    });

    describe('textarea', () => {
      it('binds value via input event', () => {
        const textarea = document.createElement('textarea');
        const s = signal('');

        bindElement(
          textarea,
          'value',
          () => s.value,
          (v) => (s.value = v as string),
        );

        textarea.value = 'note';
        textarea.dispatchEvent(new Event('input'));
        expect(s.value).toBe('note');
      });
    });

    describe('modifiers', () => {
      it('trim strips surrounding whitespace', () => {
        const input = document.createElement('input');
        const s = signal('');
        bindElement(
          input,
          'value',
          () => s.value,
          (v) => (s.value = v as string),
          { trim: true },
        );

        input.value = '  hi  ';
        input.dispatchEvent(new Event('input'));
        expect(s.value).toBe('hi');
      });

      it('number coerces numeric strings', () => {
        const input = document.createElement('input');
        const s = signal<number | string>('');
        bindElement(
          input,
          'value',
          () => s.value,
          (v) => (s.value = v as number | string),
          { number: true },
        );

        input.value = '42';
        input.dispatchEvent(new Event('input'));
        expect(s.value).toBe(42);
      });

      it('number keeps original string when value is NaN', () => {
        const input = document.createElement('input');
        const s = signal<number | string>('');
        bindElement(
          input,
          'value',
          () => s.value,
          (v) => (s.value = v as number | string),
          { number: true },
        );

        input.value = 'abc';
        input.dispatchEvent(new Event('input'));
        expect(s.value).toBe('abc');
      });

      it('lazy commits on change instead of input', () => {
        const input = document.createElement('input');
        const s = signal('');
        bindElement(
          input,
          'value',
          () => s.value,
          (v) => (s.value = v as string),
          { lazy: true },
        );

        input.value = 'partial';
        input.dispatchEvent(new Event('input'));
        expect(s.value).toBe('');

        input.dispatchEvent(new Event('change'));
        expect(s.value).toBe('partial');
      });

      it('trim normalizes the displayed value on change', () => {
        const input = document.createElement('input');
        const s = signal('');
        bindElement(
          input,
          'value',
          () => s.value,
          (v) => (s.value = v as string),
          { trim: true },
        );

        // Simulate user typing then blurring; raw value still has whitespace.
        input.value = '  hi  ';
        input.dispatchEvent(new Event('change'));
        expect(input.value).toBe('hi');
      });
    });

    describe('iME composition', () => {
      it('does not commit while composing and commits on compositionend', () => {
        const input = document.createElement('input');
        const s = signal('');
        bindElement(
          input,
          'value',
          () => s.value,
          (v) => (s.value = v as string),
        );

        input.dispatchEvent(new Event('compositionstart'));
        input.value = '中';
        input.dispatchEvent(new Event('input'));
        // Held back during composition.
        expect(s.value).toBe('');

        input.dispatchEvent(new Event('compositionend'));
        expect(s.value).toBe('中');
      });
    });

    describe('number modifier', () => {
      it('keeps whitespace-only input as the original string (does not coerce to 0)', () => {
        const input = document.createElement('input');
        const s = signal<number | string>('initial');
        bindElement(
          input,
          'value',
          () => s.value,
          (v) => (s.value = v as number | string),
          { number: true },
        );

        input.value = '   ';
        input.dispatchEvent(new Event('input'));
        // Without the guard, Number('   ') would silently produce 0.
        expect(s.value).toBe('   ');
      });

      it('coerces untrimmed numeric strings (" 42 " -> 42)', () => {
        const input = document.createElement('input');
        const s = signal<number | string>('');
        bindElement(
          input,
          'value',
          () => s.value,
          (v) => (s.value = v as number | string),
          { number: true },
        );

        input.value = ' 42 ';
        input.dispatchEvent(new Event('input'));
        expect(s.value).toBe(42);
      });

      it('<input type="number"> auto-coerces without explicit modifier', () => {
        const input = document.createElement('input');
        input.type = 'number';
        const s = signal<number | string>('');
        bindElement(
          input,
          'value',
          () => s.value,
          (v) => (s.value = v as number | string),
        );

        input.value = '7';
        input.dispatchEvent(new Event('input'));
        expect(s.value).toBe(7);
      });

      it('<input type="range"> auto-coerces without explicit modifier', () => {
        const input = document.createElement('input');
        input.type = 'range';
        const s = signal<number | string>('');
        bindElement(
          input,
          'value',
          () => s.value,
          (v) => (s.value = v as number | string),
        );

        input.value = '55';
        input.dispatchEvent(new Event('input'));
        expect(s.value).toBe(55);
      });
    });

    describe('checkbox group (array model)', () => {
      it('adds and removes its own value as the checkbox toggles', () => {
        const a = document.createElement('input');
        a.type = 'checkbox';
        a.value = 'a';
        const b = document.createElement('input');
        b.type = 'checkbox';
        b.value = 'b';
        const list = signal<string[]>([]);

        for (const el of [a, b]) {
          bindElement(
            el,
            'checked',
            () => list.value,
            (v) => (list.value = v as string[]),
          );
        }

        a.checked = true;
        a.dispatchEvent(new Event('change'));
        expect(list.value).toEqual(['a']);
        expect(a.checked).toBe(true);
        expect(b.checked).toBe(false);

        b.checked = true;
        b.dispatchEvent(new Event('change'));
        expect(list.value).toEqual(['a', 'b']);

        a.checked = false;
        a.dispatchEvent(new Event('change'));
        expect(list.value).toEqual(['b']);
        expect(b.checked).toBe(true);
      });

      it('reflects external model changes onto DOM', () => {
        const a = document.createElement('input');
        a.type = 'checkbox';
        a.value = 'a';
        const b = document.createElement('input');
        b.type = 'checkbox';
        b.value = 'b';
        const list = signal<string[]>([]);

        for (const el of [a, b]) {
          bindElement(
            el,
            'checked',
            () => list.value,
            (v) => (list.value = v as string[]),
          );
        }

        list.value = ['b'];
        expect(a.checked).toBe(false);
        expect(b.checked).toBe(true);
      });

      it('accumulates checkbox array changes when the setter commits later', () => {
        const a = document.createElement('input');
        a.type = 'checkbox';
        a.value = 'a';
        const b = document.createElement('input');
        b.type = 'checkbox';
        b.value = 'b';

        let model: string[] = [];
        let pending: string[] = [];
        const setter = (value: unknown) => {
          pending = value as string[];
        };

        for (const el of [a, b]) {
          bindElement(el, 'checked', () => model, setter);
        }

        a.checked = true;
        a.dispatchEvent(new Event('change'));
        expect(pending).toEqual(['a']);

        b.checked = true;
        b.dispatchEvent(new Event('change'));
        expect(pending).toEqual(['a', 'b']);

        model = pending;
        expect(model).toEqual(['a', 'b']);
      });

      it('still works as a plain boolean when model is not an array', () => {
        const input = document.createElement('input');
        input.type = 'checkbox';
        const s = signal(false);
        bindElement(
          input,
          'checked',
          () => s.value,
          (v) => (s.value = v as boolean),
        );

        input.checked = true;
        input.dispatchEvent(new Event('change'));
        expect(s.value).toBe(true);
      });
    });

    describe('lazy IME guard', () => {
      it('does not overwrite the input while IME is composing in lazy mode', () => {
        const input = document.createElement('input');
        const s = signal('start');
        bindElement(
          input,
          'value',
          () => s.value,
          (v) => (s.value = v as string),
          { lazy: true },
        );

        input.dispatchEvent(new Event('compositionstart'));
        input.value = 'pending';
        // External model update during composition must not clobber the input.
        s.value = 'remote';
        expect(input.value).toBe('pending');

        input.dispatchEvent(new Event('compositionend'));
      });
    });

    describe('input element with unknown property', () => {
      it('routes to custom strategy instead of TEXT_LIKE for unknown INPUT props', () => {
        const input = document.createElement('input');
        // 'placeholder' is a real INPUT property unrelated to value/checked/files.
        const s = signal('hint');
        bindElement(
          input,
          'placeholder',
          () => s.value,
          (v) => (s.value = v as string),
        );
        expect(input.placeholder).toBe('hint');

        s.value = 'updated';
        expect(input.placeholder).toBe('updated');
        // The shared TEXT_LIKE strategy would have written to .value instead.
        expect(input.value).toBe('');
      });
    });

    describe('lifecycle', () => {
      it('stops the model->DOM effect when scope is disposed', () => {
        const input = document.createElement('input');
        const s = signal('a');

        const ctx = createContext(null);
        pushContextStack(ctx);
        bindElement(
          input,
          'value',
          () => s.value,
          (v) => (s.value = v as string),
        );
        popContextStack();

        expect(input.value).toBe('a');
        s.value = 'b';
        expect(input.value).toBe('b');

        cleanupContext(ctx);
        s.value = 'c';
        // Effect was disposed -> DOM no longer reacts.
        expect(input.value).toBe('b');

        // Listeners removed too: DOM input no longer reaches the model.
        input.value = 'typed';
        input.dispatchEvent(new Event('input'));
        expect(s.value).toBe('c');
      });

      it('bindElement returns a disposer that stops the effect and listeners (BIND-04)', () => {
        const el = document.createElement('input');
        const model = signal('a');

        const dispose = bindElement(
          el,
          'value',
          () => model.value,
          (v) => {
            model.value = v as string;
          },
        );
        expect(el.value).toBe('a');

        // Model → DOM live before dispose.
        model.value = 'b';
        expect(el.value).toBe('b');

        dispose();
        dispose(); // idempotent

        // Effect stopped: model writes no longer touch the DOM.
        model.value = 'c';
        expect(el.value).toBe('b');

        // Listeners removed: DOM input no longer reaches the model.
        el.value = 'typed';
        el.dispatchEvent(new Event('input'));
        expect(model.value).toBe('c');
      });
    });

    describe('unsafe sinks (BIND-05)', () => {
      it.each(['innerHTML', 'outerHTML', 'srcdoc'])('does not write through bind:%s', (prop) => {
        const el = document.createElement('div');
        el.textContent = 'safe';
        document.body.appendChild(el);
        const payload = signal('<img src=x onerror=alert(1)>');

        const dispose = bindElement(
          el,
          prop,
          () => payload.value,
          () => {},
        );

        // The sink must be untouched — no markup injected.
        expect(el.innerHTML).toBe('safe');
        expect(document.querySelector('img')).toBeNull();
        dispose();
      });

      it('allows bind:textContent (plain-text assignment, not an HTML sink)', () => {
        const el = document.createElement('div');
        el.textContent = 'before';
        document.body.appendChild(el);
        const payload = signal('<img src=x onerror=alert(1)>');

        const dispose = bindElement(
          el,
          'textContent',
          () => payload.value,
          () => {},
        );

        // textContent assigns plain text — the markup is rendered inert.
        expect(el.textContent).toBe('<img src=x onerror=alert(1)>');
        expect(document.querySelector('img')).toBeNull();
        dispose();
      });

      it('two-way binds textContent on a contenteditable host', () => {
        const el = document.createElement('div');
        el.contentEditable = 'true';
        document.body.appendChild(el);
        const model = signal('hello');

        const dispose = bindElement(
          el,
          'textContent',
          () => model.value,
          (v) => {
            model.value = v as string;
          },
        );

        // Model → DOM on bind and on updates.
        expect(el.textContent).toBe('hello');
        model.value = 'world';
        expect(el.textContent).toBe('world');

        // DOM → model via the input event (contenteditable edit).
        el.textContent = 'typed';
        el.dispatchEvent(new Event('input'));
        expect(model.value).toBe('typed');

        dispose();
      });

      it('does not install inline on* handlers via bind', () => {
        const el = document.createElement('div');
        document.body.appendChild(el);
        const handler = signal(() => {});

        const dispose = bindElement(
          el,
          'onclick',
          () => handler.value,
          () => {},
        );
        expect((el as any).onclick).toBeNull();
        dispose();
      });

      it('still allows benign custom element properties', () => {
        const el = document.createElement('my-widget');
        document.body.appendChild(el);
        const model = signal('hello');

        const dispose = bindElement(
          el,
          'customValue',
          () => model.value,
          (v) => {
            model.value = v as string;
          },
        );
        expect((el as any).customValue).toBe('hello');

        model.value = 'world';
        expect((el as any).customValue).toBe('world');
        dispose();
      });
    });

    describe('hydration (BIND-02)', () => {
      // Regression tests: the initial model→DOM effect must not clobber
      // pre-hydration user input / autofill.
      //
      // Policy:
      // - Control is CLEAN (value === defaultValue, not focused) → skip the
      //   first write; the SSR markup already shows the model value.
      // - Control is DIRTY (user typed / autofill before the bundle attached)
      //   → adopt the DOM value into the model instead (DOM → model once).
      // - After hydration ends, normal model→DOM behaviour resumes.
      let container: HTMLElement;

      beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
      });

      afterEach(() => {
        endHydration();
        container.remove();
      });

      /**
       * Simulate an SSR-rendered input: value attribute → defaultValue.
       * Marks the node as SSR-adopted — in a real hydration pass
       * claimHydratedNodes / getRenderedElement does this for every node
       * reused from server markup, and the BIND-02 first-write skip only
       * applies to adopted nodes.
       */
      function ssrInput(defaultValue: string): HTMLInputElement {
        container.innerHTML = `<input value="${defaultValue}">`;
        const input = container.querySelector('input')!;
        markNodeHydrated(input);
        return input;
      }

      it('clean control: skips the first write during hydration', () => {
        const input = ssrInput('ssr-value');
        // SSR rendered from the model; input.value === defaultValue.
        const model = signal('ssr-value');
        beginHydration(container);

        let writes = 0;
        const origSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!;
        Object.defineProperty(input, 'value', {
          get: origSetter.get,
          set(v) {
            writes++;
            origSetter.set!.call(this, v);
          },
          configurable: true,
        });

        const dispose = bindElement(
          input,
          'value',
          () => model.value,
          (v) => {
            model.value = v as string;
          },
        );

        // No write happened during the hydration first run.
        expect(writes).toBe(0);
        endHydration();

        // Normal reactivity after hydration.
        model.value = 'updated';
        expect(input.value).toBe('updated');
        dispose();
      });

      it('dirty control: adopts pre-hydration user input into the model', () => {
        const input = ssrInput('ssr-value');
        // User typed before hydration: value differs from defaultValue.
        input.value = 'user-typed';
        const model = signal('ssr-value');
        beginHydration(container);

        const dispose = bindElement(
          input,
          'value',
          () => model.value,
          (v) => {
            model.value = v as string;
          },
        );

        // The user's input was NOT clobbered and flowed into the model.
        expect(input.value).toBe('user-typed');
        expect(model.value).toBe('user-typed');
        endHydration();
        dispose();
      });

      it('dirty checkbox: adopts pre-hydration checked state', () => {
        container.innerHTML = `<input type="checkbox">`;
        const box = container.querySelector('input')!;
        markNodeHydrated(box); // SSR-adopted, like ssrInput()
        // User checked it before hydration (defaultChecked stays false).
        box.checked = true;
        const model = signal(false);
        beginHydration(container);

        const dispose = bindElement(
          box,
          'checked',
          () => model.value,
          (v) => {
            model.value = v as boolean;
          },
        );

        expect(box.checked).toBe(true);
        expect(model.value).toBe(true);
        endHydration();
        dispose();
      });

      it('model changes after a skipped hydration write still propagate', () => {
        const input = ssrInput('same');
        const model = signal('same');
        beginHydration(container);

        const dispose = bindElement(
          input,
          'value',
          () => model.value,
          (v) => {
            model.value = v as string;
          },
        );
        endHydration();

        model.value = 'later';
        expect(input.value).toBe('later');
        dispose();
      });

      it('csr-created node during hydration: first write executes (not skipped)', () => {
        // A claim mismatch makes reconcile create FRESH nodes while
        // isHydrating() is still true. Those controls carry no SSR markup —
        // skipping the first model→DOM write leaves them blank.
        beginHydration(container);
        const input = document.createElement('input');
        container.appendChild(input); // created client-side, never claimed
        const model = signal('model-value');

        const dispose = bindElement(
          input,
          'value',
          () => model.value,
          (v) => {
            model.value = v as string;
          },
        );

        expect(input.value).toBe('model-value');
        endHydration();
        dispose();
      });

      it('bind target inside a claimed SSR subtree still skips the first write', () => {
        // The claimed node is the ANCESTOR; the bound control is a
        // descendant. isNodeHydrated must find the marked ancestor.
        container.innerHTML = `<form><input value="ssr-value"></form>`;
        const form = container.querySelector('form')!;
        const input = container.querySelector('input')!;
        const model = signal('ssr-value');
        beginHydration(container);
        markNodeHydrated(form);

        let writes = 0;
        const origSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!;
        Object.defineProperty(input, 'value', {
          get: origSetter.get,
          set(v) {
            writes++;
            origSetter.set!.call(this, v);
          },
          configurable: true,
        });

        const dispose = bindElement(
          input,
          'value',
          () => model.value,
          (v) => {
            model.value = v as string;
          },
        );

        expect(writes).toBe(0);
        endHydration();
        dispose();
      });
    });
  });
});
