import * as signals from '@estjs/signals';
import * as template from '@estjs/template';
import { describe, expect, it } from 'vitest';
import * as essor from '../src/index';

// Source-level re-export parity. The `essor` entry is
// `export * from '@estjs/signals'; export * from '@estjs/template'` plus
// `__version`. Two invariants keep that composition safe:
//
// 1. The union must be exact — a name exported by signals/template but
//    missing from essor means `export *` was replaced by a stale explicit
//    list (or a bundler regression).
// 2. signals and template must never export the same runtime name — with
//    `export *`, a collision is silently DROPPED from the combined namespace
//    (per ES module semantics), so a user-facing API would vanish without
//    any build error.
//
// This runs against src (vitest alias); the dist-level counterpart lives in
// cross-entry-instance.spec.ts.

const runtimeKeys = (mod: Record<string, unknown>): string[] =>
  Object.keys(mod).filter((k) => k !== 'default');

describe('essor entry: re-export parity with @estjs/signals + @estjs/template', () => {
  it('exports the exact union of signals, template, and __version', () => {
    const expected = new Set([...runtimeKeys(signals), ...runtimeKeys(template), '__version']);
    expect(new Set(runtimeKeys(essor))).toEqual(expected);
  });

  it('signals and template runtime export names never collide', () => {
    const templateKeys = new Set(runtimeKeys(template));
    const overlap = runtimeKeys(signals).filter((k) => templateKeys.has(k));
    expect(overlap).toEqual([]);
  });

  it('registers the version on globalThis', () => {
    expect((globalThis as Record<string, unknown>).__essor_version__).toBe(essor.__version);
  });
});
