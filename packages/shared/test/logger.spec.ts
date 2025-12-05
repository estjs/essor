import { vi } from 'vitest';
import { error, info, warn } from '../src';

describe('logger Utils', () => {
  let consoleWarnSpy: ReturnType<typeof vi.fn>;
  let consoleInfoSpy: ReturnType<typeof vi.fn>;
  let consoleErrorSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
    consoleInfoSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  describe('warn', () => {
    const testCases = [
      { msg: 'Test warning', args: [], expectedArgs: ['[Essor warn]: Test warning'] },
      {
        msg: 'Warning with args',
        args: [{ foo: 'bar' }],
        expectedArgs: ['[Essor warn]: Warning with args', { foo: 'bar' }],
      },
    ];

    testCases.forEach(({ msg, args, expectedArgs }) => {
      it(`should log warning messages with prefix: ${msg}`, () => {
        warn(msg, ...args);
        expect(consoleWarnSpy).toHaveBeenCalledWith(...expectedArgs);
      });
    });
  });

  describe('info', () => {
    const testCases = [
      { msg: 'Test info', args: [], expectedArgs: ['[Essor info]: Test info'] },
      {
        msg: 'Info with args',
        args: [{ foo: 'bar' }],
        expectedArgs: ['[Essor info]: Info with args', { foo: 'bar' }],
      },
    ];

    testCases.forEach(({ msg, args, expectedArgs }) => {
      it(`should log info messages with prefix: ${msg}`, () => {
        info(msg, ...args);
        expect(consoleInfoSpy).toHaveBeenCalledWith(...expectedArgs);
      });
    });
  });

  describe('error', () => {
    const testCases = [
      { msg: 'Test error', args: [], expectedArgs: ['[Essor error]: Test error'] },
      {
        msg: 'Error with args',
        args: [new Error('Something went wrong')],
        expectedArgs: ['[Essor error]: Error with args', new Error('Something went wrong')],
      },
    ];

    testCases.forEach(({ msg, args, expectedArgs }) => {
      it(`should log error messages with prefix: ${msg}`, () => {
        error(msg, ...args);
        expect(consoleErrorSpy).toHaveBeenCalledWith(...expectedArgs);
      });
    });
  });
});
