import { computed, effect, signal } from '../src';

describe('branch Tracking', () => {
  it('should handle nested branch tracking with multiple conditions', () => {
    const a = signal(false);
    const b = signal(true);
    const c = signal(true);
    const value = signal(0);
    let renderCount = 0;

    effect(
      () => {
        if (a.value && b.value && c.value) {
          value.value;
        }
        renderCount++;
      },
      { flush: 'sync' },
    );

    expect(renderCount).toBe(1);

    // a的值为false，应该不触发effect
    value.value++;
    expect(renderCount).toBe(1);

    a.value = true;
    expect(renderCount).toBe(2);
    value.value++;
    // a的值为true，应该触发effect
    expect(renderCount).toBe(3);

    b.value = false;
    expect(renderCount).toBe(4);

    // b的值为false，value变化不应触发effect
    value.value++;
    expect(renderCount).toBe(4);

    // 重新打开中间分支
    b.value = true;
    expect(renderCount).toBe(5);

    // b的值为true value变化应该触发effect
    value.value++;
    expect(renderCount).toBe(6);
  });

  it('should handle computed values in branches', () => {
    const count = signal(0);
    const doubled = computed(() => count.value * 2);
    const show = signal(true);
    let renderCount = 0;

    effect(
      () => {
        if (show.value) {
          doubled.value;
        }
        renderCount++;
      },
      { flush: 'sync' },
    );

    expect(renderCount).toBe(1);

    // 当 show 为 true 时，count 变化应该触发 effect
    count.value++;
    expect(renderCount).toBe(2);

    // 关闭分支
    show.value = false;
    expect(renderCount).toBe(3);

    // count 变化不应触发 effect
    count.value++;
    expect(renderCount).toBe(3);
  });

  it('should work computed with branch track', () => {
    const a = signal(true);
    const b = signal(2);
    const c = signal(3);

    let runCount = 0;
    computed(() => {
      if (a.value) {
        b.value;
      }
      runCount++;
      c.value;
      return 1;
    });

    // 默认运行一次收集依赖
    expect(runCount).toBe(1);

    // a的值改变，触发computed
    a.value = false;
    expect(runCount).toBe(2);
    // b的值改变，因为a的值为false，不触发
    b.value = 4;
    expect(runCount).toBe(2);
    // a的值改变，触发computed
    a.value = true;
    expect(runCount).toBe(3);
    // b的值改变，触发computed
    b.value = 5;
    expect(runCount).toBe(4);
  });

  it('should handle dynamic branch dependencies', () => {
    const items = signal([1, 2, 3]);
    const showEven = signal(true);
    const results: number[] = [];

    effect(
      () => {
        results.length = 0;
        for (const item of items.value) {
          if (showEven.value) {
            if (item % 2 === 0) {
              results.push(item);
            }
          } else {
            if (item % 2 === 1) {
              results.push(item);
            }
          }
        }
      },
      { flush: 'sync' },
    );

    expect(results).toEqual([2]);

    // 切换显示条件
    showEven.value = false;
    expect(results).toEqual([1, 3]);

    // 添加新项
    items.value.push(4);
    expect(results).toEqual([1, 3]);
  });
});
