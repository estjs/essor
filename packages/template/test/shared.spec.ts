import { endHydration, isHydrating, startHydration } from '../src';

describe('shared', () => {
  it('manages hydration state', () => {
    endHydration();
    expect(isHydrating()).toBe(false);
    startHydration();
    expect(isHydrating()).toBe(true);
    endHydration();
    expect(isHydrating()).toBe(false);
  });
});
