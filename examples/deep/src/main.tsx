import { shallowSignal, useEffect, useSignal } from "essor";

const mock1 = {
  "/zh/guide/": [
      {
          "text": "介绍",
          "items": [
              {
                  "text": "快速开始",
                  "link": "/zh/guide/getting-started"
              },
              {
                  "text": "配置站点",
                  "link": "/zh/guide/configure-site"
              }
          ]
      },
      {
          "text": "基础功能",
          "items": [
              {
                  "text": "约定式路由",
                  "link": "/zh/guide/conventional-route"
              },
              {
                  "text": "使用 MDX 语法",
                  "link": "/zh/guide/use-mdx"
              },
              {
                  "text": "静态资源",
                  "link": "/zh/guide/static-assets"
              }
          ]
      },
      {
          "text": "默认主题功能",
          "items": [
              {
                  "text": "Home 主页",
                  "link": "/zh/guide/home-page"
              },
              {
                  "text": "API 预览页",
                  "link": "/zh/guide/api-page"
              },
              {
                  "text": "正文页面",
                  "link": "/zh/guide/doc-page"
              },
              {
                  "text": "国际化",
                  "link": "/zh/guide/i18n"
              },
              {
                  "text": "全文搜索",
                  "link": "/zh/guide/search"
              }
          ]
      }
  ],
  "/zh/api/": [
      {
          "text": "配置项",
          "items": [
              {
                  "text": "基础配置",
                  "link": "/zh/api/config-basic"
              },
              {
                  "text": "主题配置",
                  "link": "/zh/api/config-theme"
              },
              {
                  "text": "Front Matter 配置",
                  "link": "/zh/api/config-front-matter"
              }
          ]
      },
      {
          "text": "Client API",
          "items": [
              {
                  "text": "运行时 API",
                  "link": "/zh/api/api-runtime"
              }
          ]
      }
  ]
}

function geMock(name) {
  return mock1[name];
}
function App() {
  const items = shallowSignal<any[]>([]);

  const onClick = (name) => {
    items.value = geMock(name);
  }


  return (
    <aside class="sidebar">
<button onClick={onClick.bind(null, '/zh/guide/')}>guider</button>
<button onClick={onClick.bind(null, '/zh/api/')}>api</button>
      <nav>
        {items.value.map(item => (
          <section class="mt-4 border-t b-border-default first:mt-4">
            <div class="flex items-center justify-between">
              <h2 class="mb-2 mt-3 text-16px font-bold">
                <span>{item.text}</span>
              </h2>
            </div>
            <div class="mb-1">
              {JSON.stringify(item.items)}
              {item.items.map(i => (
                <div class="ml-5" >
                  <div
                    class={`p-1 font-medium `}
                  onClick={() => {
                    console.log(i.link);
                  }}
                  >
                    {
                      i.link
                    }
                    {i.text}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </nav>
    </aside>
  );
}

(<App />).mount(document.querySelector('#app')!);
