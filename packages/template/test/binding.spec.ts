import { beforeEach, describe, expect, it, vi } from 'vitest';
import { signal } from '@estjs/signals';
import { bindElement } from '../src/binding';
import { addEventListener } from '../src/events';
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
      expect(() => bindElement(null, 'value', '', setter)).not.toThrow();
      expect(setter).not.toHaveBeenCalled();
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
      });
    });
  });
});
