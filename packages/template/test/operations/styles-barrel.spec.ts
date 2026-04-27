import { describe, expect, it } from 'vitest';
import {
  type Style as BarrelStyle,
  patchStyle as barrelPatchStyle,
  setStyle as barrelSetStyle,
} from '../../src/operations/styles';
import { patchStyle, setStyle } from '../../src/operations/style';

describe('operations/styles barrel', () => {
  it('re-exports patchStyle and setStyle from the style implementation', () => {
    expect(barrelPatchStyle).toBe(patchStyle);
    expect(barrelSetStyle).toBe(setStyle);
  });

  it('re-exports the Style type for downstream imports', () => {
    const style: BarrelStyle = { color: 'red' };
    expect(style).toEqual({ color: 'red' });
  });
});
