import { beforeEach, describe, expect, it } from 'vitest';
import { createApp, template } from '../src/renderer';
import { resetEnvironment } from './test-utils';

describe('renderer utilities', () => {
  beforeEach(() => {
    resetEnvironment();
  });

  it('creates reusable templates', () => {
    const factory = template('<button>Click</button>');
    const first = factory();
    const second = factory();

    expect(first.isEqualNode(second)).toBe(true);
    expect(first).not.toBe(second);
  });

  it('throws when template is empty', () => {
    const factory = template('');
    expect(() => factory()).toThrow();
  });

  it('mounts application to target element', () => {
    const container = document.createElement('div');
    container.id = 'root';
    document.body.appendChild(container);

    const Root = () => {
      const div = document.createElement('div');
      div.textContent = 'hello';
      return div;
    };

    const instance = createApp(Root, '#root');
    expect(instance).toBeTruthy();
    expect(container.textContent).toBe('hello');
  });

  it('returns undefined when target is missing', () => {
    const result = createApp(() => document.createElement('div'), '#missing');
    expect(result).toBeUndefined();
  });
});
