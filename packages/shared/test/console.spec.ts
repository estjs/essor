import { describe, expect, it, vi } from 'vitest';
import { error, info, warn } from '../src';

describe('logger functions', () => {
  it('should log a warning message with the correct prefix', () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    warn('This is a warning', 'arg1', 'arg2');

    expect(consoleWarnSpy).toHaveBeenCalledWith('[Essor warn]: This is a warning', 'arg1', 'arg2');

    consoleWarnSpy.mockRestore();
  });

  it('should log an info message with the correct prefix', () => {
    const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

    info('This is an info message', 'arg1', 'arg2');

    expect(consoleInfoSpy).toHaveBeenCalledWith(
      '[Essor info]: This is an info message',
      'arg1',
      'arg2',
    );

    consoleInfoSpy.mockRestore();
  });

  it('should log an error message with the correct prefix', () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    error('This is an error message', 'arg1', 'arg2');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[Essor error]: This is an error message',
      'arg1',
      'arg2',
    );

    consoleErrorSpy.mockRestore();
  });
});
