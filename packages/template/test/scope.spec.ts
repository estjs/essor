import { afterEach, describe, expect, it } from 'vitest';
import { computed, effect, getCurrentScope, memoEffect, signal } from '@estjs/signals';
import { createScope, disposeScope, runWithScope, setActiveScope } from '../src/scope';
import { createComponent } from '../src/component';
import { child, insert, next } from '../src/dom';
import { patchAttr } from '../src/operations';
import { createApp, template } from '../src/renderer';
import { type Scope, getActiveScope } from '../src/scope';
describe('scope effectScope bridge', () => {
  afterEach(() => {
    setActiveScope(null);
  });

  it('activates the scope effectScope during runWithScope and restores the previous scope afterwards', () => {
    const parent = createScope(null);
    const child = createScope(parent);

    setActiveScope(parent);

    expect(getCurrentScope()).toBe(parent.effectScope);

    runWithScope(child, () => {
      expect(getActiveScope()).toBe(child);
      expect(getCurrentScope()).toBe(child.effectScope);
    });

    expect(getActiveScope()).toBe(parent);
    expect(getCurrentScope()).toBe(parent.effectScope);

    disposeScope(child);
    disposeScope(parent);
  });

  it('stops child-scope effects and computed values without stopping parent-scope effects', () => {
    const parent = createScope(null);
    const child = createScope(parent);
    const count = signal(0);
    let parentRuns = 0;
    let childRuns = 0;
    let childComputedRuns = 0;

    runWithScope(parent, () => {
      effect(() => {
        parentRuns++;
        count.value;
      });
    });

    runWithScope(child, () => {
      const doubled = computed(() => {
        childComputedRuns++;
        return count.value * 2;
      });

      effect(() => {
        childRuns++;
        doubled.value;
      });
    });

    expect(parentRuns).toBe(1);
    expect(childRuns).toBe(1);
    expect(childComputedRuns).toBe(1);

    count.value = 1;
    expect(parentRuns).toBe(2);
    expect(childRuns).toBe(2);

    disposeScope(child);
    count.value = 2;

    expect(parentRuns).toBe(3);
    expect(childRuns).toBe(2);

    disposeScope(parent);
    count.value = 3;

    expect(parentRuns).toBe(3);
    expect(childRuns).toBe(2);
    expect(childComputedRuns).toBeGreaterThan(0);
  });

  it('parent link is severed after disposal completes (SCOPE-01)', () => {
    const parent = createScope(null);
    let scopedChild!: Scope;
    runWithScope(parent, () => {
      scopedChild = createScope();
    });
    disposeScope(scopedChild);
    expect(scopedChild.parent).toBeNull();
    expect(scopedChild.isDestroyed).toBe(true);
    disposeScope(parent);
  });

  it('syncs setActiveScope with the active effectScope for direct stack manipulation', () => {
    const scope = createScope(null);
    const count = signal(0);
    let runs = 0;

    setActiveScope(scope);

    expect(getCurrentScope()).toBe(scope.effectScope);

    effect(() => {
      runs++;
      count.value;
    });

    setActiveScope(null);

    expect(runs).toBe(1);
    expect(getCurrentScope()).toBeUndefined();

    count.value = 1;
    expect(runs).toBe(2);

    disposeScope(scope);
    count.value = 2;

    expect(runs).toBe(2);
  });
  it('does not re-trigger after the child scope is disposed', () => {
    const heroBranchTemplate = template(
      '<div class="mx-auto h-270px flex justify-center"><img class="w-full"></div>',
    );
    const heroTemplate = template('<div class="mx-auto px-10 pb-16 pt-20"><!></div>');
    const appTemplate = template(
      '<main><button>toggle hero</button><button>toggle hero image</button><!></main>',
    );

    let effectRuns = 0;
    let srcPatches = 0;
    let altPatches = 0;
    let childScope: Scope | null = null;

    const HomeHero = (props: { hero: { image: { src: string; alt: string } } }) => {
      childScope = getActiveScope();

      effect(() => {
        effectRuns++;
        props.hero.image;
      });

      const root = heroTemplate() as HTMLDivElement;
      const anchor = child(root) as Node;

      insert(
        root,
        () =>
          props.hero.image &&
          (() => {
            const branch = heroBranchTemplate() as HTMLDivElement;
            const image = child(branch) as HTMLImageElement;

            memoEffect((prev: { src?: string }) => {
              const nextSrc = props.hero.image.src;
              if (nextSrc !== prev.src) {
                srcPatches++;
                patchAttr(image, 'src', prev.src, (prev.src = nextSrc));
              }
              return prev;
            }, {});

            memoEffect((prev: { alt?: string }) => {
              const nextAlt = props.hero.image.alt;
              if (nextAlt !== prev.alt) {
                altPatches++;
                patchAttr(image, 'alt', prev.alt, (prev.alt = nextAlt));
              }
              return prev;
            }, {});

            return branch;
          })(),
        anchor,
      );

      return root;
    };
    const $flag = signal(false);
    const $hero = signal({ image: { src: 'url1', alt: 'hero' } });

    const App = () => {
      return (() => {
        const root = appTemplate() as HTMLElement;
        const firstButton = child(root);
        const secondButton = next(firstButton, 1);
        const anchor = next(secondButton, 1) as Node;

        insert(
          root,
          () =>
            $flag.value &&
            createComponent(HomeHero, {
              get hero() {
                return $hero.value;
              },
            }),
          anchor,
        );

        return root;
      })();
    };

    const container = document.createElement('div');
    document.body.appendChild(container);

    const app = createApp(App, container);

    try {
      expect(app).toBeTruthy();
      expect(container.querySelector('img')).toBeNull();
      expect(effectRuns).toBe(0);
      expect(srcPatches).toBe(0);
      expect(altPatches).toBe(0);

      $flag.value = true;

      expect(childScope).not.toBeNull();
      expect(effectRuns).toBe(1);
      expect(srcPatches).toBe(1);
      expect(altPatches).toBe(1);
      expect(container.querySelector('img')?.getAttribute('src')).toBe('url1');
      expect(container.querySelector('img')?.getAttribute('alt')).toBe('hero');

      $flag.value = false;

      expect(container.querySelector('img')).toBeNull();

      $hero.value.image = { src: 'url2', alt: 'hero222' };
      $hero.value.image = { src: 'url2', alt: 'hero222' };
      $hero.value.image = { src: 'url2', alt: 'hero222' };
      $hero.value.image = { src: 'url2', alt: 'hero222' };
      $hero.value.image = { src: 'url2', alt: 'hero222' };

      expect(effectRuns).toBe(1);
      expect(srcPatches).toBe(1);
      expect(altPatches).toBe(1);
      expect(container.querySelector('img')).toBeNull();

      $flag.value = true;

      expect(effectRuns).toBe(2);
      expect(srcPatches).toBe(2);
      expect(altPatches).toBe(2);

      $hero.value.image = { src: 'url2', alt: 'hero222' };
      $hero.value.image = { src: 'url2', alt: 'hero222' };
      $hero.value.image = { src: 'url2', alt: 'hero222' };
      $hero.value.image = { src: 'url2', alt: 'hero222' };
      $hero.value.image = { src: 'url2', alt: 'hero222' };

      expect(effectRuns).toBe(7);
      expect(srcPatches).toBe(7);
      expect(altPatches).toBe(7);

      $flag.value = false;

      expect(container.querySelector('img')).toBeNull();

      $hero.value.image = { src: 'url2', alt: 'hero222' };
      $hero.value.image = { src: 'url2', alt: 'hero222' };
      $hero.value.image = { src: 'url2', alt: 'hero222' };
      $hero.value.image = { src: 'url2', alt: 'hero222' };
      $hero.value.image = { src: 'url2', alt: 'hero222' };

      expect(effectRuns).toBe(7);
      expect(srcPatches).toBe(7);
      expect(altPatches).toBe(7);
    } finally {
      app?.unmount();
    }
  });
});
