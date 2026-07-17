import { describe, expect, it } from 'vitest';
import { type InjectionKey, getHydrationKey, inject, provide } from '@estjs/template';
import { createSSRComponent, renderToString, ssrComponent } from '../src/render';
import { unsafeHTML } from '../src/utils';

describe('server/provide-inject', () => {
  describe('renderToString with provide/inject', () => {
    it('should support basic provide/inject in SSR', () => {
      const key: InjectionKey<string> = Symbol('theme');

      const Child = () => {
        const theme = inject(key, 'default');
        return unsafeHTML(`<div class="${theme}">content</div>`);
      };

      const Parent = () => {
        provide(key, 'dark');
        return Child();
      };

      const result = renderToString(Parent);
      expect(result).toBe('<div class="dark">content</div>');
    });

    it('should support string keys for provide/inject', () => {
      const Child = () => {
        const value = inject('my-key', 'fallback');
        return unsafeHTML(`<span>${value}</span>`);
      };

      const Parent = () => {
        provide('my-key', 'injected-value');
        return Child();
      };

      const result = renderToString(Parent);
      expect(result).toBe('<span>injected-value</span>');
    });

    it('should return default value when key not provided', () => {
      const key: InjectionKey<string> = Symbol('missing');

      const Component = () => {
        const value = inject(key, 'default-value');
        return unsafeHTML(`<div>${value}</div>`);
      };

      const result = renderToString(Component);
      expect(result).toBe('<div>default-value</div>');
    });

    it('should support nested provide/inject hierarchy', () => {
      const themeKey: InjectionKey<string> = Symbol('theme');
      const userKey: InjectionKey<string> = Symbol('user');

      const DeepChild = () => {
        const theme = inject(themeKey, 'no-theme');
        const user = inject(userKey, 'no-user');
        return unsafeHTML(`<div>theme:${theme},user:${user}</div>`);
      };

      const MiddleComponent = () => {
        provide(userKey, 'alice');
        return DeepChild();
      };

      const RootComponent = () => {
        provide(themeKey, 'dark');
        return MiddleComponent();
      };

      const result = renderToString(RootComponent);
      expect(result).toBe('<div>theme:dark,user:alice</div>');
    });

    it('should support shadowing provided values', () => {
      const key: InjectionKey<string> = Symbol('value');

      const Child = () => {
        const value = inject(key, 'default');
        return unsafeHTML(`<span>${value}</span>`);
      };

      const ShadowProvider = () => {
        provide(key, 'shadowed');
        return Child();
      };

      const Root = () => {
        provide(key, 'root');
        // Direct child sees 'root', but ShadowProvider's child sees 'shadowed'
        return unsafeHTML(`<div>${Child()}${ShadowProvider()}</div>`);
      };

      const result = renderToString(Root);
      expect(result).toBe('<div><span>root</span><span>shadowed</span></div>');
    });

    it('should support reactive values (objects) in provide/inject', () => {
      const storeKey: InjectionKey<{ count: number; name: string }> = Symbol('store');

      const Child = () => {
        const store = inject(storeKey, { count: 0, name: '' });
        return unsafeHTML(`<div>count:${store.count},name:${store.name}</div>`);
      };

      const Parent = () => {
        provide(storeKey, { count: 42, name: 'test' });
        return Child();
      };

      const result = renderToString(Parent);
      expect(result).toBe('<div>count:42,name:test</div>');
    });

    it('should support function values in provide/inject', () => {
      const fnKey: InjectionKey<() => string> = Symbol('fn');

      const Child = () => {
        const fn = inject(fnKey, () => 'default');
        return unsafeHTML(`<div>${fn()}</div>`);
      };

      const Parent = () => {
        provide(fnKey, () => 'provided-fn-result');
        return Child();
      };

      const result = renderToString(Parent);
      expect(result).toBe('<div>provided-fn-result</div>');
    });

    it('should isolate scope between multiple renderToString calls', () => {
      const key: InjectionKey<string> = Symbol('isolated');

      const Component = () => {
        const value = inject(key, 'not-found');
        return unsafeHTML(`<div>${value}</div>`);
      };

      const WithProvider = () => {
        provide(key, 'provided');
        return Component();
      };

      // First render with provider
      expect(renderToString(WithProvider)).toBe('<div>provided</div>');

      // Second render without provider should not see previous value
      expect(renderToString(Component)).toBe('<div>not-found</div>');

      // Third render with provider again
      expect(renderToString(WithProvider)).toBe('<div>provided</div>');
    });
  });

  describe('createSSRComponent and ssrComponent with provide/inject', () => {
    it('should support provide/inject in nested SSG components', () => {
      const key: InjectionKey<string> = Symbol('ssg-key');

      const ChildComponent = () => {
        const value = inject(key, 'default');
        return unsafeHTML(`<span>${value}</span>`);
      };

      const ParentComponent = () => {
        provide(key, 'ssg-value');
        return unsafeHTML(`<div>${createSSRComponent(ChildComponent)}</div>`);
      };

      const result = renderToString(ParentComponent);
      expect(result).toBe('<div><span>ssg-value</span></div>');
    });

    it('resolves lazy children thunks inside the provider scope (compiled output shape)', () => {
      const key: InjectionKey<string> = Symbol('lazy-key');

      const Child = () => {
        const value = inject(key, 'missing');
        return unsafeHTML(`<span>${value}</span>`);
      };

      // Mirrors compiled output: children are lazy thunks that resolve()
      // invokes AFTER the component body returns. They must still see the
      // provider's scope.
      const Provider = () => {
        provide(key, 'from-provider');
        return [unsafeHTML('<div>'), () => ssrComponent(Child), unsafeHTML('</div>')];
      };

      // ssrComponent delegates to createSSRComponent, then brands the result
      // so this nested compiled boundary stays trusted by renderToString.
      const App = () => ssrComponent(Provider);

      const result = renderToString(App);
      expect(result).toBe('<div><span>from-provider</span></div>');
    });

    it('should inherit parent scope in createSSRComponent', () => {
      const themeKey: InjectionKey<string> = Symbol('theme');
      const langKey: InjectionKey<string> = Symbol('lang');

      const DeepChild = () => {
        const theme = inject(themeKey, 'no-theme');
        const lang = inject(langKey, 'no-lang');
        return unsafeHTML(`<span>theme:${theme},lang:${lang}</span>`);
      };

      const MiddleComponent = () => {
        provide(langKey, 'en');
        return ssrComponent(DeepChild);
      };

      const RootComponent = () => {
        provide(themeKey, 'light');
        return unsafeHTML(`<div>${createSSRComponent(MiddleComponent)}</div>`);
      };

      const result = renderToString(RootComponent);
      expect(result).toBe('<div><span>theme:light,lang:en</span></div>');
    });

    it('should support multiple nested createSSRComponent calls', () => {
      const key: InjectionKey<number> = Symbol('depth');

      const Level3 = () => {
        const depth = inject(key, 0);
        return unsafeHTML(`<span>depth:${depth}</span>`);
      };

      const Level2 = () => {
        return unsafeHTML(`<div>${createSSRComponent(Level3)}</div>`);
      };

      const Level1 = () => {
        provide(key, 3);
        return unsafeHTML(`<section>${createSSRComponent(Level2)}</section>`);
      };

      const result = renderToString(Level1);
      expect(result).toBe('<section><div><span>depth:3</span></div></section>');
    });

    it('should support shadowing in createSSRComponent', () => {
      const key: InjectionKey<string> = Symbol('shadow');

      const Leaf = () => {
        const value = inject(key, 'none');
        return unsafeHTML(`<span>${value}</span>`);
      };

      const ShadowBranch = () => {
        provide(key, 'shadow-value');
        return ssrComponent(Leaf);
      };

      const NormalBranch = () => {
        return ssrComponent(Leaf);
      };

      const Root = () => {
        provide(key, 'root-value');
        return unsafeHTML(
          `<div>${createSSRComponent(NormalBranch)}|${createSSRComponent(ShadowBranch)}</div>`,
        );
      };

      const result = renderToString(Root);
      expect(result).toBe('<div><span>root-value</span>|<span>shadow-value</span></div>');
    });
  });

  describe('real-world SSR scenarios', () => {
    it('should support theme provider pattern', () => {
      interface Theme {
        primary: string;
        secondary: string;
        mode: 'light' | 'dark';
      }

      const ThemeKey: InjectionKey<Theme> = Symbol('theme');

      const Button = (props: { label: string }) => {
        const theme = inject(ThemeKey, { primary: '#000', secondary: '#fff', mode: 'light' });
        return unsafeHTML(
          `<button style="background:${theme.primary};color:${theme.secondary}">${props.label}</button>`,
        );
      };

      const Card = (props: { title: string }) => {
        const theme = inject(ThemeKey, { primary: '#000', secondary: '#fff', mode: 'light' });
        return unsafeHTML(
          `<div class="card card-${theme.mode}"><h2>${props.title}</h2>${createSSRComponent(Button, { label: 'Click me' })}</div>`,
        );
      };

      const App = () => {
        provide(ThemeKey, { primary: '#007bff', secondary: '#ffffff', mode: 'dark' });
        return unsafeHTML(`<main>${createSSRComponent(Card, { title: 'Welcome' })}</main>`);
      };

      const result = renderToString(App);
      expect(result).toContain('card-dark');
      expect(result).toContain('background:#007bff');
      expect(result).toContain('color:#ffffff');
    });

    it('should support i18n provider pattern', () => {
      interface I18n {
        locale: string;
        t: (key: string) => string;
      }

      const I18nKey: InjectionKey<I18n> = Symbol('i18n');

      const translations: Record<string, Record<string, string>> = {
        en: { greeting: 'Hello', farewell: 'Goodbye' },
        zh: { greeting: '你好', farewell: '再见' },
      };

      const createI18n = (locale: string): I18n => ({
        locale,
        t: (key: string) => translations[locale]?.[key] || key,
      });

      const Greeting = () => {
        const i18n = inject(I18nKey, createI18n('en'));
        return unsafeHTML(`<p>${i18n.t('greeting')}</p>`);
      };

      const App = (props: { locale: string }) => {
        provide(I18nKey, createI18n(props.locale));
        return unsafeHTML(`<div>${createSSRComponent(Greeting)}</div>`);
      };

      expect(renderToString(App, { locale: 'en' })).toBe('<div><p>Hello</p></div>');
      expect(renderToString(App, { locale: 'zh' })).toBe('<div><p>你好</p></div>');
    });

    it('should support auth context pattern', () => {
      interface AuthContext {
        isAuthenticated: boolean;
        user: { name: string; role: string } | null;
      }

      const AuthKey: InjectionKey<AuthContext> = Symbol('auth');

      const UserInfo = () => {
        const auth = inject(AuthKey, { isAuthenticated: false, user: null });
        if (!auth.isAuthenticated || !auth.user) {
          return unsafeHTML('<span>Guest</span>');
        }
        return unsafeHTML(`<span>${auth.user.name} (${auth.user.role})</span>`);
      };

      const Header = () => {
        return unsafeHTML(`<header>${createSSRComponent(UserInfo)}</header>`);
      };

      const App = (props: { user?: { name: string; role: string } }) => {
        const auth: AuthContext = props.user
          ? { isAuthenticated: true, user: props.user }
          : { isAuthenticated: false, user: null };
        provide(AuthKey, auth);
        return unsafeHTML(`<div>${createSSRComponent(Header)}</div>`);
      };

      // Guest user
      expect(renderToString(App, {})).toBe('<div><header><span>Guest</span></header></div>');

      // Authenticated user
      expect(renderToString(App, { user: { name: 'Alice', role: 'admin' } })).toBe(
        '<div><header><span>Alice (admin)</span></header></div>',
      );
    });

    it('should support router context pattern', () => {
      interface RouterContext {
        path: string;
        params: Record<string, string>;
      }

      const RouterKey: InjectionKey<RouterContext> = Symbol('router');

      const Link = (props: { to: string; children: string }) => {
        const router = inject(RouterKey, { path: '/', params: {} });
        const isActive = router.path === props.to;
        return unsafeHTML(
          `<a href="${props.to}" class="${isActive ? 'active' : ''}">${props.children}</a>`,
        );
      };

      const Nav = () => {
        return unsafeHTML(
          `<nav>${createSSRComponent(Link, { to: '/', children: 'Home' })}${createSSRComponent(Link, { to: '/about', children: 'About' })}</nav>`,
        );
      };

      const App = (props: { path: string }) => {
        provide(RouterKey, { path: props.path, params: {} });
        return unsafeHTML(`<div>${createSSRComponent(Nav)}</div>`);
      };

      const homeResult = renderToString(App, { path: '/' });
      expect(homeResult).toContain('<a href="/" class="active">Home</a>');
      expect(homeResult).toContain('<a href="/about" class="">About</a>');

      const aboutResult = renderToString(App, { path: '/about' });
      expect(aboutResult).toContain('<a href="/" class="">Home</a>');
      expect(aboutResult).toContain('<a href="/about" class="active">About</a>');
    });

    it('should work with hydration keys', () => {
      const key: InjectionKey<string> = Symbol('hydration-test');

      const Child = () => {
        const value = inject(key, 'default');
        const hk = getHydrationKey();
        return unsafeHTML(`<div data-hk="${hk}">${value}</div>`);
      };

      const Parent = () => {
        provide(key, 'hydrated-value');
        const hk = getHydrationKey();
        return unsafeHTML(`<main data-hk="${hk}">${createSSRComponent(Child)}</main>`);
      };

      const result = renderToString(Parent);
      expect(result).toContain('data-hk="0"');
      expect(result).toContain('data-hk="1"');
      expect(result).toContain('hydrated-value');
    });
  });

  describe('edge cases', () => {
    it('should handle undefined provided value', () => {
      const key: InjectionKey<string | undefined> = Symbol('undefined');

      const Child = () => {
        const value = inject(key, 'default');
        return unsafeHTML(`<div>${value ?? 'was-undefined'}</div>`);
      };

      const Parent = () => {
        provide(key, undefined);
        return Child();
      };

      // Default values are only used when the key is missing.
      // An explicit undefined provided value is returned as-is.
      const result = renderToString(Parent);
      expect(result).toBe('<div>was-undefined</div>');
    });

    it('should handle null provided value', () => {
      const key: InjectionKey<string | null> = Symbol('null');

      const Child = () => {
        const value = inject(key, 'default');
        return unsafeHTML(`<div>${value ?? 'was-null'}</div>`);
      };

      const Parent = () => {
        provide(key, null);
        return Child();
      };

      // Null is also treated as an explicitly provided value.
      const result = renderToString(Parent);
      expect(result).toBe('<div>was-null</div>');
    });

    it('should handle number keys', () => {
      const Child = () => {
        const value = inject(123, 'default');
        return unsafeHTML(`<div>${value}</div>`);
      };

      const Parent = () => {
        provide(123, 'number-key-value');
        return Child();
      };

      const result = renderToString(Parent);
      expect(result).toBe('<div>number-key-value</div>');
    });

    it('should handle empty component tree', () => {
      const key: InjectionKey<string> = Symbol('empty');

      const Component = () => {
        provide(key, 'value');
        return '';
      };

      const result = renderToString(Component);
      expect(result).toBe('');
    });

    it('should handle array return values', () => {
      const key: InjectionKey<string> = Symbol('array');

      const Child = () => {
        const value = inject(key, 'default');
        return [unsafeHTML(`<span>${value}</span>`), unsafeHTML('<span>second</span>')];
      };

      const Parent = () => {
        provide(key, 'array-value');
        return Child();
      };

      const result = renderToString(Parent);
      expect(result).toBe('<span>array-value</span><span>second</span>');
    });
  });
});
