import { defineConfig } from 'athen';

export default defineConfig({
  lang: 'en-US',
  title: 'aube',
  icon: '/logo.png',

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
            text: 'v0.0.0',
            items: [
              {
                text: '更新日志',
                link: 'https://github.com/aube/aube/blob/master/CHANGELOG.md',
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
              text: '基础',
              items: [
                {
                  text: 'signal',
                  link: '/zh/basic/signal',
                },
                {
                  text: 'watch',
                  link: '/zh/basic/watch',
                },

                {
                  text: 'store',
                  link: '/zh/basic/store',
                },
              ],
            },
          ],
          '/zh/api/': [
            {
              text: 'API',
              items: [
                {
                  text: 'api',
                  link: '/zh/api/api',
                },
              ],
            },
          ],
        },
        title: 'aube',
        outlineTitle: '目录',
        prevPageText: '上一页',
        nextPageText: '下一页',
        description: '',
        editLink: {
          pattern: 'https://github.com/aube/aube/tree/master/docs/:path',
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
            text: 'v0.0.0',
            items: [
              {
                text: 'Changelog',
                link: 'https://github.com/aube/aube/blob/master/CHANGELOG.md',
              },
            ],
          },
        ],
        sidebar: {
          '/en/guide/': [
            {
              text: 'Getting Started',
              items: [
                {
                  text: 'Getting Started',
                  link: '/en/guide/getting-started',
                },
              ],
            },
            {
              text: 'basic',
              items: [
                {
                  text: 'signal',
                  link: '/zh/basic/signal',
                },
                {
                  text: 'watch',
                  link: '/zh/basic/watch',
                },

                {
                  text: 'store',
                  link: '/zh/basic/store',
                },
              ],
            },
          ],
          '/en/api/': [
            {
              text: 'Config',
              items: [
                {
                  text: 'Basic Config',
                  link: '/en/api/api',
                },
              ],
            },
            {
              text: 'Client API',
              items: [
                {
                  text: 'Runtime API',
                  link: '/en/api/api-runtime',
                },
              ],
            },
          ],
        },
        title: 'aube',
        description: '',
        lastUpdatedText: 'Last Updated',
        editLink: {
          pattern: 'https://github.com/aube/aube/tree/master/docs/:path',
          text: '📝 Edit this page on GitHub',
        },
      },
    },
    outlineTitle: 'ON THIS PAGE',
    socialLinks: [
      {
        icon: 'github',
        mode: 'link',
        content: 'https://github.com/aube/aube',
      },
      {
        icon: 'discord',
        mode: 'link',
        content: 'https://discord.gg',
      },
    ],
    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2023-present jiangxd2016<jiangxd2016@gmail.com>',
    },
  },
});
