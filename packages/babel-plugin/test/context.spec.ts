import { beforeEach, describe, expect, it } from 'vitest';
import { types as t } from '@babel/core';

// Import context management functions and types to be tested
import { type TransformContext, getContext, resetContext, setContext } from '../src/jsx/context';
import type { NodePath } from '@babel/core';
import type { State } from '../src/types'; // Ensure State type is imported

// Mock Path and State objects
const mockPath: NodePath<t.JSXElement> = {
  node: t.jsxElement(t.jsxOpeningElement(t.jsxIdentifier('div'), []), null, []),
  scope: {
    generateUidIdentifier: (name: string) => t.identifier(`_mock${name}$`),
    // ...other potentially needed scope properties
  } as any, // Simplified mock scope
  // ...other potentially needed NodePath properties
} as NodePath<t.JSXElement>; // Force type assertion

const mockState: State = {
  opts: { mode: 'client' },
  imports: {
    template: t.identifier('_tmpl$'),
    signal: t.identifier('_signal$'),
    // ...other import identifiers
  },
  hmrEnabled: false,
  filename: '/mock/file.tsx',
  templateDeclaration: t.variableDeclaration('const', []), // Provide a mock VariableDeclaration
} as State; // Force type assertion

beforeEach(() => {
  // Ensure context is reset before each test to avoid interference between tests
  resetContext();
});

describe('transformation Context Management', () => {
  describe('setContext', () => {
    it('should correctly set and make context accessible', () => {
      const context: TransformContext = { path: mockPath, state: mockState };
      setContext(context);
      expect(getContext()).toBe(context);
      expect(getContext().path).toBe(mockPath);
      expect(getContext().state).toBe(mockState);
    });

    it('setting context multiple times should update to the latest value', () => {
      const context1: TransformContext = { path: mockPath, state: mockState };
      setContext(context1);
      expect(getContext()).toBe(context1);

      const newMockPath: NodePath<t.JSXElement> = {
        node: t.jsxElement(t.jsxOpeningElement(t.jsxIdentifier('span'), []), null, []),
        scope: { generateUidIdentifier: (name: string) => t.identifier(`_newmock${name}$`) } as any,
      } as NodePath<t.JSXElement>;
      const newMockState: State = { ...mockState, opts: { mode: 'ssg' } };
      const context2: TransformContext = { path: newMockPath, state: newMockState };
      setContext(context2);
      expect(getContext()).toBe(context2);
      expect(getContext().path).toBe(newMockPath);
      expect(getContext().state).toBe(newMockState);
    });
  });

  describe('getContext', () => {
    it('should throw an error or return null when context is not set', () => {
      // By default, getContext() should throw an error because activeContext is initialized to null
      // If your implementation allows activeContext to be null and getContext does not throw, then expect null
      // According to your `getContext(): TransformContext { return activeContext!; }` signature, it asserts non-null, so expect a throw here
      expect(() => getContext()).toThrow();
    });

    it('should return the currently set context', () => {
      const context: TransformContext = { path: mockPath, state: mockState };
      setContext(context);
      expect(getContext()).toBe(context);
    });
  });

  describe('resetContext', () => {
    it('should reset the context to null', () => {
      const context: TransformContext = { path: mockPath, state: mockState };
      setContext(context);
      expect(getContext()).toBe(context); // Confirm it's set

      resetContext();
      expect(getContext()).toBeNull();
    });

    it('multiple resets should have no side effects', () => {
      const context: TransformContext = { path: mockPath, state: mockState };
      setContext(context);
      resetContext();
      expect(getContext()).toBeNull();
      resetContext(); // Reset again
      expect(getContext()).toBeNull();
    });
  });
});
