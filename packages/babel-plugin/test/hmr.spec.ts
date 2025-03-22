/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from 'vitest';
import { getTransform } from './util';

describe('hMR Transformation', () => {
  it('should wrap root component with HMR wrapper', () => {
    const code = `
      function App({ title }) {
        return <div>{title}</div>;
      }

      export default function Container() {
        return <App title="Hello World" />;
      }
    `;

    const transform = getTransform('jsx', { mode: 'client' });
    const result = transform(code);

    // 验证转换后的代码包含createHMR调用
    expect(result).toContain('createHMR$');
    expect(result).toContain('acceptHMR$');

    // 验证转换后的代码包含App组件
    expect(result).toContain('App');

    // 验证props被正确传递 - 更新匹配字符串格式
    expect(result).toContain('"title": "Hello World"');
  });

  it('should not apply HMR wrapper in SSR mode', () => {
    const code = `
      function App({ title }) {
        return <div>{title}</div>;
      }

      export default function Container() {
        return <App title="Hello World" />;
      }
    `;

    const transform = getTransform('jsx', { mode: 'ssr' });
    const result = transform(code);

    // SSR模式下不应该包含HMR相关函数
    expect(result).not.toContain('createHMR$');
    expect(result).not.toContain('acceptHMR$');
  });

  it('should not apply HMR wrapper to DOM elements', () => {
    const code = `
      export default function Container() {
        return <div>Hello World</div>;
      }
    `;

    const transform = getTransform('jsx', { mode: 'client' });
    const result = transform(code);

    // 普通DOM元素不应该被HMR包装
    expect(result).not.toContain('createHMR$');
    expect(result).not.toContain('acceptHMR$');
  });

  it('should handle complex component with dynamic props in HMR', () => {
    const code = `
      function App({ items }) {
        return (
          <div>
            {items.map(item => <Item key={item.id} {...item} />)}
          </div>
        );
      }

      export default function Container() {
        const data = [{id: 1, name: 'Item 1'}, {id: 2, name: 'Item 2'}];
        return <App items={data} />;
      }
    `;

    const transform = getTransform('jsx', { mode: 'client' });
    const result = transform(code);

    // 验证复杂组件的HMR包装
    expect(result).toContain('createHMR$');
    expect(result).toContain('acceptHMR$');

    // 验证动态props - 更新匹配字符串格式
    expect(result).toContain('"items": data');
  });

  it('should not apply HMR wrapper when hmr option is disabled', () => {
    const code = `
      function App({ title }) {
        return <div>{title}</div>;
      }

      export default function Container() {
        return <App title="Hello World" />;
      }
    `;

    const transform = getTransform('jsx', { mode: 'client', hmr: false });
    const result = transform(code);

    // 当hmr选项为false时，不应包含HMR相关函数
    expect(result).not.toContain('createHMR$');
    expect(result).not.toContain('acceptHMR$');
  });
});
