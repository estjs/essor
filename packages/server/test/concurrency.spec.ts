import { describe, expect, it } from 'vitest';
import { effect, getCurrentScope, signal } from '@estjs/signals';
import { type InjectionKey, getHydrationKey, inject, provide } from '@estjs/template';
import {
  activateScopeEffects,
  createScope,
  disposeScope,
  getActiveScope,
} from '@estjs/template/internal';
import { createSSRContext, getSSRContext } from '../src/context';
import { createSSRComponent, renderToStringAsync } from '../src/render';

function createGate(): { promise: Promise<void>; release: () => void } {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

/**
 * Regression tests for SSR-P0-01: SSR request state (active scope + hydration
 * key counter) must be request-local. Two renderToStringAsync calls whose
 * components interleave at `await` points must not pollute each other's
 * provide/inject data or hydration keys, and deferred thunks executed during
 * serialization must still see their own request's scope.
 *
 * NOTE: outputs deliberately use plain text (no HTML metacharacters) so the
 * expectations are independent of child-text escaping semantics.
 */
describe('server/concurrency', () => {
  it('restores direct effect-scope activation idempotently', () => {
    const requestScope = createScope(null);
    const nextScope = createScope(null);
    const restoreRequest = activateScopeEffects(requestScope);
    let restoreNext: (() => void) | undefined;

    try {
      expect(getCurrentScope()).toBe(requestScope.effectScope);
      restoreRequest();
      expect(getCurrentScope()).toBeUndefined();

      restoreNext = activateScopeEffects(nextScope);
      restoreRequest();
      expect(getCurrentScope()).toBe(nextScope.effectScope);
    } finally {
      restoreNext?.();
      restoreRequest();
      disposeScope(requestScope);
      disposeScope(nextScope);
    }
  });

  it.each([
    ['A then B, finish B first', ['A', 'B'], 'B'],
    ['B then A, finish A first', ['B', 'A'], 'A'],
  ] as const)(
    'keeps async continuation effects request-local: %s',
    async (_label, creationOrder, firstToFinish) => {
      type RenderName = 'A' | 'B';

      const source = signal(0);
      const create = { A: createGate(), B: createGate() };
      const created = { A: createGate(), B: createGate() };
      const finish = { A: createGate(), B: createGate() };
      const runs: Record<RenderName, number> = { A: 0, B: 0 };
      const runners: Partial<Record<RenderName, ReturnType<typeof effect>>> = {};

      const make = (name: RenderName) => async () => {
        await create[name].promise;
        runners[name] = effect(() => {
          source.value;
          runs[name]++;
        });
        created[name].release();
        await finish[name].promise;
        return name;
      };

      const renders = {
        A: renderToStringAsync(make('A')),
        B: renderToStringAsync(make('B')),
      };
      const survivor: RenderName = firstToFinish === 'A' ? 'B' : 'A';

      try {
        for (const name of creationOrder) {
          create[name].release();
          await created[name].promise;
        }

        finish[firstToFinish].release();
        await expect(renders[firstToFinish]).resolves.toBe(firstToFinish);

        source.value = 1;
        expect(runs[firstToFinish]).toBe(1);
        expect(runs[survivor]).toBe(2);

        finish[survivor].release();
        await expect(renders[survivor]).resolves.toBe(survivor);

        source.value = 2;
        expect(runs[firstToFinish]).toBe(1);
        expect(runs[survivor]).toBe(2);
      } finally {
        create.A.release();
        create.B.release();
        finish.A.release();
        finish.B.release();
        await Promise.allSettled([renders.A, renders.B]);
        runners.A?.stop();
        runners.B?.stop();
      }
    },
  );

  it('does not attach effects created outside a suspended render to that request', async () => {
    const source = signal(0);
    const entered = createGate();
    const finish = createGate();
    let outsideRuns = 0;

    const render = renderToStringAsync(async () => {
      entered.release();
      await finish.promise;
      return 'done';
    });
    await entered.promise;

    const outsideEffect = effect(() => {
      source.value;
      outsideRuns++;
    });

    try {
      source.value = 1;
      expect(outsideRuns).toBe(2);

      finish.release();
      await expect(render).resolves.toBe('done');

      source.value = 2;
      expect(outsideRuns).toBe(3);
    } finally {
      finish.release();
      await Promise.allSettled([render]);
      outsideEffect.stop();
    }
  });

  it('restores effect ownership before an outside microtask after a continuation throws', async () => {
    const source = signal(0);
    const resume = createGate();
    const outsideCreated = createGate();
    let outsideRuns = 0;
    let outsideEffect: ReturnType<typeof effect> | undefined;
    let renderSettled = false;
    let outsideRanBeforeRenderSettled = false;

    const rejectedRender = renderToStringAsync(async () => {
      await resume.promise;
      throw new Error('continuation failed');
    });
    const handledRender = rejectedRender.catch((error: unknown) => {
      renderSettled = true;
      return error;
    });

    try {
      resume.release();
      queueMicrotask(() => {
        try {
          outsideRanBeforeRenderSettled = !renderSettled;
          outsideEffect = effect(() => {
            source.value;
            outsideRuns++;
          });
        } finally {
          outsideCreated.release();
        }
      });

      const error = await handledRender;
      await outsideCreated.promise;

      expect(outsideRanBeforeRenderSettled).toBe(true);
      expect(error).toBeInstanceOf(Error);
      expect((error as Error).message).toBe('continuation failed');

      source.value = 1;
      expect(outsideRuns).toBe(2);
    } finally {
      resume.release();
      await Promise.allSettled([handledRender]);
      outsideEffect?.stop();
    }
  });

  it('isolates scope and hydration keys across interleaved async renders', async () => {
    const key: InjectionKey<string> = Symbol('req');
    let release1!: () => void;
    let release2!: () => void;
    const gate1 = new Promise<void>((r) => (release1 = r));
    const gate2 = new Promise<void>((r) => (release2 = r));

    const make = (name: string, gate: Promise<void>) => async () => {
      provide(key, name);
      const first = getHydrationKey();
      await gate; // interleave point — the other request runs here
      return `${inject(key, 'none')}:${first}:${getHydrationKey()}`;
    };

    const p1 = renderToStringAsync(make('one', gate1) as any);
    const p2 = renderToStringAsync(make('two', gate2) as any);

    // Resolve out of order to force full interleaving.
    release2();
    release1();

    expect(await p1).toBe('one:0:1');
    expect(await p2).toBe('two:0:1');
  });

  it('keeps the request scope alive for thunks executed during serialization', async () => {
    const key: InjectionKey<string> = Symbol('thunk');
    const Component = async () => {
      provide(key, 'from-request');
      await Promise.resolve();
      // The thunk runs inside resolveAsync, after the component body finished.
      return () => inject(key, 'lost');
    };

    await expect(renderToStringAsync(Component as any)).resolves.toBe('from-request');
  });

  it('keeps the request scope alive for thunks in interleaved concurrent renders', async () => {
    const key: InjectionKey<string> = Symbol('thunk-concurrent');
    let releaseA!: () => void;
    const gateA = new Promise<void>((r) => (releaseA = r));

    const A = async () => {
      provide(key, 'A');
      await gateA;
      return () => inject(key, 'lost');
    };
    const B = async () => {
      provide(key, 'B');
      await Promise.resolve();
      return () => inject(key, 'lost');
    };

    const pA = renderToStringAsync(A as any);
    const pB = renderToStringAsync(B as any);
    releaseA();

    expect(await pA).toBe('A');
    expect(await pB).toBe('B');
  });

  it('isolates SSRContext metadata between concurrent renders', async () => {
    let release1!: () => void;
    let release2!: () => void;
    const gate1 = new Promise<void>((r) => (release1 = r));
    const gate2 = new Promise<void>((r) => (release2 = r));

    const make = (id: string, gate: Promise<void>) => async () => {
      getSSRContext()!.requestId = id;
      await gate;
      return String(getSSRContext()!.requestId);
    };

    const ctx1 = createSSRContext();
    const ctx2 = createSSRContext();
    const p1 = renderToStringAsync(make('req-1', gate1) as any, {}, ctx1);
    const p2 = renderToStringAsync(make('req-2', gate2) as any, {}, ctx2);
    release2();
    release1();

    expect(await p1).toBe('req-1');
    expect(await p2).toBe('req-2');
    expect(ctx1.requestId).toBe('req-1');
    expect(ctx2.requestId).toBe('req-2');
  });

  it('restores a null active scope after concurrent renders settle', async () => {
    const A = async () => {
      await Promise.resolve();
      return 'a';
    };
    const B = async () => {
      await Promise.resolve();
      return 'b';
    };
    await Promise.all([renderToStringAsync(A as any), renderToStringAsync(B as any)]);
    expect(getActiveScope()).toBeNull();
  });

  it('does not leak hydration keys between sequential renders', async () => {
    const Component = async () => {
      await Promise.resolve();
      return `${getHydrationKey()}:${getHydrationKey()}`;
    };
    await expect(renderToStringAsync(Component as any)).resolves.toBe('0:1');
    await expect(renderToStringAsync(Component as any)).resolves.toBe('0:1');
  });

  it('nested createSSRComponent inherits its own request scope under concurrency', async () => {
    // A nested createSSRComponent call runs in a CHILD scope of the enclosing
    // render. Under interleaved async renders each nested component must still
    // read its own request's provide() value — never the other request's.
    const key: InjectionKey<string> = Symbol('nested');
    let release1!: () => void;
    let release2!: () => void;
    const gate1 = new Promise<void>((r) => (release1 = r));
    const gate2 = new Promise<void>((r) => (release2 = r));

    const Inner = () => `inner=${inject(key, 'none')}`;
    const make = (name: string, gate: Promise<void>) => async () => {
      provide(key, name);
      await gate; // interleave with the other request
      return String(createSSRComponent(Inner));
    };

    const p1 = renderToStringAsync(make('one', gate1) as any);
    const p2 = renderToStringAsync(make('two', gate2) as any);
    release2();
    release1();

    expect(await p1).toBe('inner=one');
    expect(await p2).toBe('inner=two');
  });
});
