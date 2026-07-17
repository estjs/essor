import { defineConfig } from 'athen';
import pkg from '../package.json';

export default defineConfig({
  lang: 'en-US',
  title: 'Essor',
  favicon: '/logo.png',

  themeConfig: {
    locales: {
      '/zh/': {
        lang: 'zh',
        label: '简体中文',
        lastUpdatedText: '上次更新',
        nav: [
          {
            text: '指南',
            link: '/zh/guide/getting-started',
            activeMatch: '/guide/',
          },
          {
            text: 'API',
            link: '/zh/api/api',
            activeMatch: '/api/',
          },
          {
            text: '组件',
            link: '/zh/components/Fragment',
            activeMatch: '/components/',
          },
          {
            text: '服务端',
            link: '/zh/server/ssr',
            activeMatch: '/server/',
          },
          {
            text: `v${pkg.version}`,
            items: [
              {
                text: '更新日志',
                link: 'https://github.com/estjs/essor/blob/main/CHANGELOG.md',
              },
            ],
          },
        ],
        sidebar: {
          '/zh/guide/': [
            {
              text: '介绍',
              items: [
                {
                  text: '快速开始',
                  link: '/zh/guide/getting-started',
                },
              ],
            },
            {
              text: '进阶',
              items: [
                {
                  text: 'bind 双向绑定',
                  link: '/zh/guide/bind',
                },
                {
                  text: 'Transition 过渡动画',
                  link: '/zh/guide/transition',
                },
                {
                  text: '迁移指南',
                  link: '/zh/guide/migration',
                },
              ],
            },
          ],
          '/zh/server/': [
            {
              text: '服务端渲染',
              items: [
                {
                  text: 'SSR',
                  link: '/zh/server/ssr',
                },
                {
                  text: 'SSG',
                  link: '/zh/server/ssg',
                },
                {
                  text: '异步 SSR',
                  link: '/zh/server/streaming',
                },
                {
                  text: 'SSR 上下文与请求隔离',
                  link: '/zh/server/ssr-context',
                },
                {
                  text: '安全与转义',
                  link: '/zh/server/security',
                },
                {
                  text: '异步资源 (Resources)',
                  link: '/zh/server/resources',
                },
                {
                  text: '编译产物 API',
                  link: '/zh/server/compiler-output',
                },
              ],
            },
          ],
          '/zh/components/': [
            {
              text: '内置组件',
              items: [
                {
                  text: 'Fragment',
                  link: '/zh/components/Fragment',
                },
                {
                  text: 'Portal',
                  link: '/zh/components/Portal',
                },
                {
                  text: 'Suspense',
                  link: '/zh/components/Suspense',
                },
              ],
            },
          ],

          '/zh/api/': [
            {
              text: 'API 总览',
              items: [
                {
                  text: 'API 总览',
                  link: '/zh/api/api',
                },
              ],
            },
            {
              text: '响应式核心',
              items: [
                { text: 'signal', link: '/zh/api/signal' },
                { text: 'computed', link: '/zh/api/computed' },
                { text: 'effect', link: '/zh/api/effect' },
                { text: 'watch', link: '/zh/api/watch' },
                { text: 'reactive', link: '/zh/api/reactive' },
                { text: 'ref', link: '/zh/api/ref' },
                { text: 'store', link: '/zh/api/store' },
                { text: 'effectScope', link: '/zh/api/effect-scope' },
              ],
            },
            {
              text: '运行时组件',
              items: [
                { text: '运行时 API', link: '/zh/api/runtime-api' },
                { text: '生命周期', link: '/zh/api/lifecycle' },
                { text: '依赖注入', link: '/zh/api/provide-inject' },
                { text: '批量更新', link: '/zh/api/batch' },
                { text: '调度器', link: '/zh/api/scheduler' },
              ],
            },
          ],
        },
        title: 'Essor',
        outlineTitle: '目录',
        prevPageText: '上一页',
        nextPageText: '下一页',
        description: '',
        editLink: {
          pattern: 'https://github.com/estjs/essor/tree/main/docs/:path',
          text: '📝 在 GitHub 上编辑此页',
        },
      },
      '/en/': {
        lang: 'en',
        label: 'English',
        lastUpdated: 'Last Updated',
        nav: [
          {
            text: 'Guide',
            link: '/en/guide/getting-started',
            activeMatch: '/guide/',
          },
          {
            text: 'API',
            link: '/en/api/api',
            activeMatch: '/api/',
          },
          {
            text: 'Components',
            link: '/en/components/Fragment',
            activeMatch: '/components/',
          },
          {
            text: 'Server',
            link: '/en/server/ssr',
            activeMatch: '/server/',
          },
          {
            text: `v${pkg.version}`,
            items: [
              {
                text: 'Changelog',
                link: 'https://github.com/estjs/essor/blob/main/CHANGELOG.md',
              },
            ],
          },
        ],
        sidebar: {
          '/en/guide/': [
            {
              text: 'Introduction',
              items: [
                {
                  text: 'Getting Started',
                  link: '/en/guide/getting-started',
                },
              ],
            },
            {
              text: 'Advanced',
              items: [
                {
                  text: 'bind two-way binding',
                  link: '/en/guide/bind',
                },
                {
                  text: 'Transition & TransitionGroup',
                  link: '/en/guide/transition',
                },
                {
                  text: 'Migration Guide',
                  link: '/en/guide/migration',
                },
              ],
            },
          ],
          '/en/server/': [
            {
              text: 'Server-Side Rendering',
              items: [
                {
                  text: 'SSR',
                  link: '/en/server/ssr',
                },
                {
                  text: 'SSG',
                  link: '/en/server/ssg',
                },
                {
                  text: 'Async SSR',
                  link: '/en/server/streaming',
                },
                {
                  text: 'SSR Context & Isolation',
                  link: '/en/server/ssr-context',
                },
                {
                  text: 'Security & Escaping',
                  link: '/en/server/security',
                },
                {
                  text: 'Async Resources',
                  link: '/en/server/resources',
                },
                {
                  text: 'Compiler Output API',
                  link: '/en/server/compiler-output',
                },
              ],
            },
          ],
          '/en/components/': [
            {
              text: 'Built-in Components',
              items: [
                {
                  text: 'Fragment',
                  link: '/en/components/Fragment',
                },
                {
                  text: 'Portal',
                  link: '/en/components/Portal',
                },
                {
                  text: 'Suspense',
                  link: '/en/components/Suspense',
                },
              ],
            },
          ],

          '/en/api/': [
            {
              text: 'Overview',
              items: [
                {
                  text: 'API Overview',
                  link: '/en/api/api',
                },
              ],
            },
            {
              text: 'Reactive Core',
              items: [
                { text: 'signal', link: '/en/api/signal' },
                { text: 'computed', link: '/en/api/computed' },
                { text: 'effect', link: '/en/api/effect' },
                { text: 'watch', link: '/en/api/watch' },
                { text: 'reactive', link: '/en/api/reactive' },
                { text: 'ref', link: '/en/api/ref' },
                { text: 'store', link: '/en/api/store' },
                { text: 'effectScope', link: '/en/api/effect-scope' },
              ],
            },
            {
              text: 'Runtime',
              items: [
                { text: 'Runtime API', link: '/en/api/runtime-api' },
                { text: 'Lifecycle', link: '/en/api/lifecycle' },
                { text: 'Dependency Injection', link: '/en/api/provide-inject' },
                { text: 'Batch Updates', link: '/en/api/batch' },
                { text: 'Scheduler', link: '/en/api/scheduler' },
              ],
            },
          ],
        },
        title: 'Essor',
        description: '',
        lastUpdatedText: 'Last Updated',
        outlineTitle: 'ON THIS PAGE',
        editLink: {
          pattern: 'https://github.com/estjs/essor/tree/main/docs/:path',
          text: '📝 Edit this page on GitHub',
        },
      },
    },
    socialLinks: [
      {
        icon: 'github',
        mode: 'link',
        content: 'https://github.com/estjs/essor',
      },
      {
        icon: 'discord',
        mode: 'link',
        content: 'https://discord.gg/estjs',
      },
    ],
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2023-present jiangxd2016<jiangxd2016@gmail.com>',
    },
  },
});
