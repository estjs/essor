import { describe, expect, it } from 'vitest';
import pluginFactory from '../src';

describe('babel plugin entry', () => {
  it('exposes named visitors with plugin name', () => {
    const plugin = pluginFactory();
    expect(plugin.name).toBe('babel-plugin-essor');
    expect(plugin.visitor?.Program).toBeDefined();
  });
});
