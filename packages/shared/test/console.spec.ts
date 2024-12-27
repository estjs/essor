import { error, info, warn } from '../src';
describe('logger Functions', () => {
  let consoleWarnSpy;
  let consoleInfoSpy;
  let consoleErrorSpy;

  beforeEach(() => {
    // Spying on console methods
    consoleWarnSpy = vitest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleInfoSpy = vitest.spyOn(console, 'info').mockImplementation(() => {});
    consoleErrorSpy = vitest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // Restore console methods after each test
    consoleWarnSpy.mockRestore();
    consoleInfoSpy.mockRestore();
    consoleErrorSpy.mockRestore();
  });

  it('warn() should call console.warn with the correct message and arguments', () => {
    const message = 'This is a warning';
    const additionalArgs = ['arg1', { key: 'value' }, 123];

    warn(message, ...additionalArgs);

    expect(consoleWarnSpy).toHaveBeenCalledWith(
      '[aube warn]: This is a warning',
      ...additionalArgs,
    );
  });

  it('info() should call console.info with the correct message and arguments', () => {
    const message = 'This is an info message';
    const additionalArgs = ['arg1', { key: 'value' }, 123];

    info(message, ...additionalArgs);

    expect(consoleInfoSpy).toHaveBeenCalledWith(
      '[aube info]: This is an info message',
      ...additionalArgs,
    );
  });

  it('error() should call console.error with the correct message and arguments', () => {
    const message = 'This is an error';
    const additionalArgs = ['arg1', { key: 'value' }, 123];

    error(message, ...additionalArgs);

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      '[aube error]: This is an error',
      ...additionalArgs,
    );
  });

  it('warn() should call console.warn with only the message if no additional arguments are provided', () => {
    const message = 'Simple warning';

    warn(message);

    expect(consoleWarnSpy).toHaveBeenCalledWith('[aube warn]: Simple warning');
  });

  it('info() should call console.info with only the message if no additional arguments are provided', () => {
    const message = 'Simple info';

    info(message);

    expect(consoleInfoSpy).toHaveBeenCalledWith('[aube info]: Simple info');
  });

  it('error() should call console.error with only the message if no additional arguments are provided', () => {
    const message = 'Simple error';

    error(message);

    expect(consoleErrorSpy).toHaveBeenCalledWith('[aube error]: Simple error');
  });
});
