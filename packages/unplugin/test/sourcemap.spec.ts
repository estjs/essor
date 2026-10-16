import { describe, expect, it } from 'vitest';
import * as babel from '@babel/core';
import essorBabelPlugin from 'babel-plugin-essor';
import essorPlugin from '../src/index';

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function decodeVLQ(str: string): number[] {
  const values: number[] = [];
  let shift = 0;
  let value = 0;
  for (const element of str) {
    let integer = B64.indexOf(element);
    if (integer === -1) continue;
    const hasContinuation = (integer & 32) !== 0;
    integer &= 31;
    value += integer << shift;
    if (hasContinuation) {
      shift += 5;
    } else {
      const shouldNegate = (value & 1) === 1;
      value >>>= 1;
      if (shouldNegate) value = -value;
      values.push(value);
      value = 0;
      shift = 0;
    }
  }
  return values;
}

/**
 * Decodes sourcemap mappings string into [generatedLine, generatedCol, origLine, origCol]
 */
function decodeMappings(mappings: string) {
  const lines = mappings.split(';');
  const result: Array<{ genLine: number; genCol: number; origLine: number; origCol: number }> = [];

  let origLine = 0;
  let origCol = 0;

  lines.forEach((lineStr, lineIdx) => {
    if (!lineStr) return;
    const segments = lineStr.split(',');
    let genCol = 0;
    for (const seg of segments) {
      if (!seg) continue;
      const decoded = decodeVLQ(seg);
      if (decoded.length < 4) continue;
      genCol += decoded[0];
      origLine += decoded[2];
      origCol += decoded[3];
      result.push({
        genLine: lineIdx + 1,
        genCol,
        origLine: origLine + 1,
        origCol,
      });
    }
  });

  return result;
}

describe('source Map Fidelity & Position Recovery', () => {
  const source = `function Header() {
  const $title = "Welcome";
  return <h1>{$title}</h1>;
}
`;

  it('babel plugin outputs valid sourcemap mapping back to original TSX lines', () => {
    const res = babel.transformSync(source, {
      filename: 'Header.tsx',
      sourceMaps: true,
      parserOpts: { plugins: ['jsx', 'typescript'] },
      plugins: [[essorBabelPlugin, { mode: 'client' }]],
    });

    expect(res?.map).toBeDefined();
    expect(res?.map?.sources).toContain('Header.tsx');
    expect(res?.map?.mappings).toBeTypeOf('string');

    const decoded = decodeMappings(res!.map!.mappings);
    expect(decoded.length).toBeGreaterThan(0);

    // Assert that original line 1 (function Header) is mapped
    const line1Map = decoded.find((d) => d.origLine === 1);
    expect(line1Map).toBeDefined();
    expect(line1Map!.origLine).toBe(1);
  });

  it('unplugin transform preserves sourcemap without HMR', () => {
    const plugin = essorPlugin.raw({ mode: 'client', hmr: false }, { framework: 'vite' });
    const result = (plugin.transform as any)(source, 'src/Header.tsx');

    expect(result).toBeDefined();
    expect(result.map).toBeDefined();
    expect(result.map.sources[0]).toMatch(/Header\.tsx$/);

    const decoded = decodeMappings(result.map.mappings);
    expect(decoded.length).toBeGreaterThan(0);

    const line1Map = decoded.find((d) => d.origLine === 1);
    expect(line1Map).toBeDefined();
    expect(line1Map!.origLine).toBe(1);
  });

  it('unplugin transform accurately shifts sourcemap when HMR headers are prepended', () => {
    const plugin = essorPlugin.raw({ mode: 'client', hmr: true }, { framework: 'vite' });
    const result = (plugin.transform as any)(source, 'src/Header.tsx');

    expect(result).toBeDefined();
    expect(result.code).toContain('import.meta.hot');
    expect(result.map).toBeDefined();

    const decoded = decodeMappings(result.map.mappings);
    const line1Map = decoded.find((d) => d.origLine === 1);

    expect(line1Map).toBeDefined();
    // The mapped generated line must be greater than 1 because of prepended HMR headers
    expect(line1Map!.genLine).toBeGreaterThan(1);
    expect(line1Map!.origLine).toBe(1);

    // Verify the code at genLine corresponds to the function definition
    const lines = result.code.split('\n');
    expect(lines[line1Map!.genLine - 1]).toContain('function Header');
  });
});
