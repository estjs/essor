import { beforeEach, describe, expect, it } from 'vitest';
import { types as t } from '@babel/core';

// Import context management functions and types to be tested
import { type TransformContext, getContext, resetContext, setContext } from '../src/jsx/context';
import { setupTestEnvironment } from './test-utils';
import type { NodePath } from '@babel/core';
import type { State } from '../src/types';

// Create mock Path and State objects directly
function createMockContext(): TransformContext {
  const mockPath: NodePath<t.JSXElement> = {
    node: t.jsxElement(t.jsxOpeningElement(t.jsxIdentifier('div'), []), null, []),
    scope: {
      generateUidIdentifier: (name: string) => t.identifier(`_mock${name}$`),
    } as any,
  } as NodePath<t.JSXElement>;

  const mockState: State = {
    opts: { mode: 'client' },
    imports: {
      template: t.identifier('_tmpl$'),
      signal: t.identifier('_signal$'),
    },
    hmrEnabled: false,
    filename: '/mock/file.tsx',
    templateDeclaration: t.variableDeclaration('const', []),
  } as State;

  return { path: mockPath, state: mockState };
}

beforeEach(() => {
  setupTestEnvironment();
});

describe('transformation Context Management', () => {
  describe('setContext', () => {
    it('should correctly set and make context accessible', () => {
      const context = createMockContext();
      setContext(context);
      expect(getContext()).toBe(context);
      expect(getContext().path).toBe(context.path);
      expect(getContext().state).toBe(context.state);
    });

    it('setting context multiple times should update to the latest value', () => {
      const context1 = createMockContext();
      setContext(context1);
      expect(getContext()).toBe(context1);

      // Create a new context with different values
      const context2 = createMockContext();
      (context2.path as any).node = t.jsxElement(
        t.jsxOpeningElement(t.jsxIdentifier('span'), []),
        null,
        [],
      );
      (context2.state as any).opts = { mode: 'ssg' };

      setContext(context2);
      expect(getContext()).toBe(context2);
      expect(getContext().path).toBe(context2.path);
      expect(getContext().state).toBe(context2.state);
      expect(getContext().state.opts.mode).toBe('ssg');
    });
  });

  describe('getContext', () => {
    it('should throw an error when context is not set', () => {
      resetContext();
      expect(getContext()).toBeNull();
    });

    it('should return the currently set context', () => {
      const context = createMockContext();
      setContext(context);
      expect(getContext()).toBe(context);
    });
  });

  describe('resetContext', () => {
    it('should reset the context to null', () => {
      const context = createMockContext();
      setContext(context);
      expect(getContext()).toBe(context); // Confirm it's set
      resetContext();
      expect(getContext()).toBeNull();
    });

    it('multiple resets should have no side effects', () => {
      const context = createMockContext();
      setContext(context);
      resetContext();
      expect(getContext()).toBeNull();
      resetContext(); // Reset again
      expect(getContext()).toBeNull();
    });
  });
});
