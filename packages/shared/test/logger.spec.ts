import { error, info, warn } from '../src';

describe('logger Utils', () => {
  describe('warn', () => {
    it('should log warning messages with prefix', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      warn('Test warning');
      expect(consoleSpy).toHaveBeenCalledWith('[Essor warn]: Test warning');

      warn('Warning with args', { foo: 'bar' });
      expect(consoleSpy).toHaveBeenCalledWith('[Essor warn]: Warning with args', { foo: 'bar' });

      consoleSpy.mockRestore();
    });
  });

  describe('info', () => {
    it('should log info messages with prefix', () => {
      const consoleSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      info('Test info');
      expect(consoleSpy).toHaveBeenCalledWith('[Essor info]: Test info');

      info('Info with args', { foo: 'bar' });
      expect(consoleSpy).toHaveBeenCalledWith('[Essor info]: Info with args', {
        foo: 'bar',
      });

      consoleSpy.mockRestore();
    });
  });

  describe('error', () => {
    it('should log error messages with prefix', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      error('Test error');
      expect(consoleSpy).toHaveBeenCalledWith('[Essor error]: Test error');

      error('Error with args', new Error('Something went wrong'));
      expect(consoleSpy).toHaveBeenCalledWith(
        '[Essor error]: Error with args',
        new Error('Something went wrong'),
      );

      consoleSpy.mockRestore();
    });
  });
});
