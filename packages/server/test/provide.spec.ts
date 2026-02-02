import { describe, expect, it } from 'vitest';
import { type InjectionKey, getHydrationKey, inject, provide } from '@estjs/template';
import { createSSGComponent, renderToString } from '../src/render';

describe('server/provide-inject', () => {
  describe('renderToString with provide/inject', () => {
    it('should support basic provide/inject in SSR', () => {
      const key: InjectionKey<string> = Symbol('theme');

      const Child = () => {
        const theme = inject(key, 'default');
        return `<div class="${theme}">content</div>`;
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
        return `<span>${value}</span>`;
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
        return `<div>${value}</div>`;
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
        return `<div>theme:${theme},user:${user}</div>`;
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
        return `<span>${value}</span>`;
      };

      const ShadowProvider = () => {
        provide(key, 'shadowed');
        return Child();
      };

      const Root = () => {
        provide(key, 'root');
        // Direct child sees 'root', but ShadowProvider's child sees 'shadowed'
        return `<div>${Child()}${ShadowProvider()}</div>`;
      };

      const result = renderToString(Root);
      expect(result).toBe('<div><span>root</span><span>shadowed</span></div>');
    });

    it('should support reactive values (objects) in provide/inject', () => {
      const storeKey: InjectionKey<{ count: number; name: string }> = Symbol('store');

      const Child = () => {
        const store = inject(storeKey, { count: 0, name: '' });
        return `<div>count:${store.count},name:${store.name}</div>`;
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
        return `<div>${fn()}</div>`;
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
        return `<div>${value}</div>`;
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

  describe('createSSGComponent with provide/inject', () => {
    it('should support provide/inject in nested SSG components', () => {
      const key: InjectionKey<string> = Symbol('ssg-key');

      const ChildComponent = () => {
        const value = inject(key, 'default');
        return `<span>${value}</span>`;
      };

      const ParentComponent = () => {
        provide(key, 'ssg-value');
        return `<div>${createSSGComponent(ChildComponent)}</div>`;
      };

      const result = renderToString(ParentComponent);
      expect(result).toBe('<div><span>ssg-value</span></div>');
    });

    it('should inherit parent scope in createSSGComponent', () => {
      const themeKey: InjectionKey<string> = Symbol('theme');
      const langKey: InjectionKey<string> = Symbol('lang');

      const DeepChild = () => {
        const theme = inject(themeKey, 'no-theme');
        const lang = inject(langKey, 'no-lang');
        return `<span>theme:${theme},lang:${lang}</span>`;
      };

      const MiddleComponent = () => {
        provide(langKey, 'en');
        return createSSGComponent(DeepChild);
      };

      const RootComponent = () => {
        provide(themeKey, 'light');
        return `<div>${createSSGComponent(MiddleComponent)}</div>`;
      };

      const result = renderToString(RootComponent);
      expect(result).toBe('<div><span>theme:light,lang:en</span></div>');
    });

    it('should support multiple nested createSSGComponent calls', () => {
      const key: InjectionKey<number> = Symbol('depth');

      const Level3 = () => {
        const depth = inject(key, 0);
        return `<span>depth:${depth}</span>`;
      };

      const Level2 = () => {
        return `<div>${createSSGComponent(Level3)}</div>`;
      };

      const Level1 = () => {
        provide(key, 3);
        return `<section>${createSSGComponent(Level2)}</section>`;
      };

      const result = renderToString(Level1);
      expect(result).toBe('<section><div><span>depth:3</span></div></section>');
    });

    it('should support shadowing in createSSGComponent', () => {
      const key: InjectionKey<string> = Symbol('shadow');

      const Leaf = () => {
        const value = inject(key, 'none');
        return `<span>${value}</span>`;
      };

      const ShadowBranch = () => {
        provide(key, 'shadow-value');
        return createSSGComponent(Leaf);
      };

      const NormalBranch = () => {
        return createSSGComponent(Leaf);
      };

      const Root = () => {
        provide(key, 'root-value');
        return `<div>${createSSGComponent(NormalBranch)}|${createSSGComponent(ShadowBranch)}</div>`;
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
        return `<button style="background:${theme.primary};color:${theme.secondary}">${props.label}</button>`;
      };

      const Card = (props: { title: string }) => {
        const theme = inject(ThemeKey, { primary: '#000', secondary: '#fff', mode: 'light' });
        return `<div class="card card-${theme.mode}"><h2>${props.title}</h2>${createSSGComponent(Button, { label: 'Click me' })}</div>`;
      };

      const App = () => {
        provide(ThemeKey, { primary: '#007bff', secondary: '#ffffff', mode: 'dark' });
        return `<main>${createSSGComponent(Card, { title: 'Welcome' })}</main>`;
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
        return `<p>${i18n.t('greeting')}</p>`;
      };

      const App = (props: { locale: string }) => {
        provide(I18nKey, createI18n(props.locale));
        return `<div>${createSSGComponent(Greeting)}</div>`;
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
          return '<span>Guest</span>';
        }
        return `<span>${auth.user.name} (${auth.user.role})</span>`;
      };

      const Header = () => {
        return `<header>${createSSGComponent(UserInfo)}</header>`;
      };

      const App = (props: { user?: { name: string; role: string } }) => {
        const auth: AuthContext = props.user
          ? { isAuthenticated: true, user: props.user }
          : { isAuthenticated: false, user: null };
        provide(AuthKey, auth);
        return `<div>${createSSGComponent(Header)}</div>`;
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
        return `<a href="${props.to}" class="${isActive ? 'active' : ''}">${props.children}</a>`;
      };

      const Nav = () => {
        return `<nav>${createSSGComponent(Link, { to: '/', children: 'Home' })}${createSSGComponent(Link, { to: '/about', children: 'About' })}</nav>`;
      };

      const App = (props: { path: string }) => {
        provide(RouterKey, { path: props.path, params: {} });
        return `<div>${createSSGComponent(Nav)}</div>`;
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
        return `<div data-hk="${hk}">${value}</div>`;
      };

      const Parent = () => {
        provide(key, 'hydrated-value');
        const hk = getHydrationKey();
        return `<main data-hk="${hk}">${createSSGComponent(Child)}</main>`;
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
        return `<div>${value ?? 'was-undefined'}</div>`;
      };

      const Parent = () => {
        provide(key, undefined);
        return Child();
      };

      // Note: inject returns default when value is falsy (including undefined)
      // This is current behavior - may want to change to explicit undefined check
      const result = renderToString(Parent);
      expect(result).toBe('<div>default</div>');
    });

    it('should handle null provided value', () => {
      const key: InjectionKey<string | null> = Symbol('null');

      const Child = () => {
        const value = inject(key, 'default');
        return `<div>${value ?? 'was-null'}</div>`;
      };

      const Parent = () => {
        provide(key, null);
        return Child();
      };

      const result = renderToString(Parent);
      expect(result).toBe('<div>default</div>');
    });

    it('should handle number keys', () => {
      const Child = () => {
        const value = inject(123, 'default');
        return `<div>${value}</div>`;
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
        return [`<span>${value}</span>`, '<span>second</span>'];
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
