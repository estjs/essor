# Transition 过渡动画

`<Transition>` 在单个子元素**挂载**和**卸载**时自动播放进入/离开动画。把任意
条件渲染的 UI 包在 `<Transition>` 里,定义好 CSS 类,运行时负责整个序列编排。

功能一览:

- **CSS 类过渡** — 经典的 6-class `*-enter-*` / `*-leave-*` 序列
- **JS 钩子** — `onBeforeEnter`、`onEnter(done)`、`onAfterEnter`、`onEnterCancelled` 及 leave 对应钩子
- **appear** — 首次挂载时也播放进入动画
- **duration 覆盖** — 用精确毫秒值跳过 CSS 事件检测
- **取消动画** — 进行中被反向触发时干净处理,不留孤立元素
- **`css={false}`** — 完全关闭类操作,专用 Web Animations API 或外部库
- **type 检测** — 同时存在 transition 和 animation 时强制指定监听哪个结束事件

> `<TransitionGroup>`(列表动画)暂未实现,计划中。

## 基本用法

```tsx
import { useSignal } from 'essor'
import { Transition } from 'essor'

function Demo() {
  const $show = useSignal(true)

  return (
    <>
      <button onClick={() => ($show.value = !$show.value)}>切换</button>

      <Transition name='fade'>
        {() => $show.value && <div class='box'>Hello</div>}
      </Transition>
    </>
  )
}
```

```css
/* transition 写在 -active 类上 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 300ms ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
```

子节点以**函数插槽**的形式传入 —— `() => $show.value && <div/>`。表达式为假值
(`false`、`null`、`undefined`、`0`)时,`<Transition>` 将其视为"无子节点"并对
上一个已挂载的元素触发离开动画;再次变为真值时播放进入动画。

### `name` prop

`name`(默认 `'v'`)决定 CSS 类前缀:

| `name`   | 进入类                                      | 离开类                                      |
| -------- | ------------------------------------------ | ------------------------------------------ |
| `'v'`    | `v-enter-from`, `v-enter-active`, `v-enter-to` | `v-leave-from`, `v-leave-active`, `v-leave-to` |
| `'fade'` | `fade-enter-from`, `fade-enter-active`, `fade-enter-to` | `fade-leave-from`, `fade-leave-active`, `fade-leave-to` |

## CSS 类序列

运行时用精确的两帧序列来确保浏览器在过渡开始前先提交初始状态:

**进入阶段:**

```
第 0 帧 │ 将元素插入 DOM
         │ 添加  name-enter-from
         │ 添加  name-enter-active
第 1 帧  │ (reflow — 浏览器绘制初始状态)
         │ 移除  name-enter-from
         │ 添加  name-enter-to
         │ 等待 transitionend / animationend(或 duration)
完成     │ 移除  name-enter-active
         │ 移除  name-enter-to
         │ → onAfterEnter 触发
```

**离开阶段**(镜像):

```
第 0 帧 │ 添加  name-leave-from
         │ 添加  name-leave-active
第 1 帧  │ 移除  name-leave-from
         │ 添加  name-leave-to
         │ 等待 transitionend / animationend(或 duration)
完成     │ 移除  name-leave-active
         │ 移除  name-leave-to
         │ 元素从 DOM 中移除
         │ → onAfterLeave 触发
```

`transition: ...` 或 `animation: ...` 规则写在 **`-active` 类**上;
`-from` / `-to` 类定义起始/结束值。

## JS 钩子

8 个钩子可拦截每个阶段,可与 CSS 类并用,也可配合 `css={false}` 单独使用:

| 钩子               | 签名                                      | 触发时机                                   |
| ------------------ | ----------------------------------------- | ------------------------------------------ |
| `onBeforeEnter`    | `(el: Element) => void`                   | 添加进入类 / 插入元素之前                  |
| `onEnter`          | `(el: Element, done: () => void) => void` | reflow 之后,active 阶段开始时             |
| `onAfterEnter`     | `(el: Element) => void`                   | 进入动画完成后                             |
| `onEnterCancelled` | `(el: Element) => void`                   | 进入过程中触发了离开                       |
| `onBeforeLeave`    | `(el: Element) => void`                   | 添加离开类之前                             |
| `onLeave`          | `(el: Element, done: () => void) => void` | reflow 之后,离开 active 阶段开始时        |
| `onAfterLeave`     | `(el: Element) => void`                   | 离开动画完成后                             |
| `onLeaveCancelled` | `(el: Element) => void`                   | 离开过程中触发了进入                       |

提供 `onEnter` 或 `onLeave` 时,需手动调用 `done()` 来通知完成。`done()` 是幂等
的,多次调用无副作用。

```tsx
<Transition
  name='slide'
  onEnter={(el, done) => {
    el.animate([{ transform: 'translateX(-100%)' }, { transform: 'translateX(0)' }], {
      duration: 300,
      easing: 'ease-out',
    }).finished.then(done)
  }}
  onLeave={(el, done) => {
    el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(100%)' }], {
      duration: 300,
      easing: 'ease-in',
    }).finished.then(done)
  }}
>
  {() => $show.value && <div class='panel'>面板</div>}
</Transition>
```

钩子触发顺序:`onBeforeEnter` → `onEnter(done)` → `onAfterEnter`(或被中断时
触发 `onEnterCancelled`)。

## `css={false}` — 纯 JS 模式

`css={false}` 会阻止 `<Transition>` 操作任何 CSS 类,由你全权用 JS 驱动动画 ——
Web Animations API、motion-one、anime.js、GSAP 等均可:

```tsx
<Transition
  css={false}
  onEnter={(el, done) => {
    el.animate(
      [{ opacity: 0, transform: 'scale(0.9)' }, { opacity: 1, transform: 'scale(1)' }],
      { duration: 250, easing: 'ease-out' },
    ).finished.then(done)
  }}
  onLeave={(el, done) => {
    el.animate(
      [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.9)' }],
      { duration: 200, easing: 'ease-in' },
    ).finished.then(done)
  }}
>
  {() => $visible.value && <div class='modal'>弹窗</div>}
</Transition>
```

> 未提供 JS 钩子时设 `css={false}`,元素会**瞬间**出现 / 消失 —— 什么都没有
> 驱动动画。

## `duration` prop

默认情况下 `<Transition>` 通过 `transitionend` / `animationend` 事件检测结束时
机。`duration` prop 用精确超时值(毫秒)覆盖这一行为:

```tsx
{/* 进入和离开使用相同时长 */}
<Transition name='fade' duration={300}>
  {() => $show.value && <div />}
</Transition>

{/* 进入和离开使用不同时长 */}
<Transition name='fade' duration={{ enter: 300, leave: 150 }}>
  {() => $show.value && <div />}
</Transition>
```

当 CSS 里用了 `all` 缩写(会产生多余的 `transitionend` 事件),或者你有复杂链式
动画需要精确时机时,推荐使用 `duration`。

## `appear` prop

默认情况下,**首次挂载**时子元素直接出现,不播放进入动画。设置 `appear` 即可让
首次挂载也有动画:

```tsx
<Transition name='fade' appear>
  {() => $show.value && <div>首次渲染也会淡入</div>}
</Transition>
```

提供 `appearFromClass` / `appearActiveClass` / `appearToClass` 时使用这些类;
否则回退到普通的 `enter-*` 类:

```tsx
<Transition
  name='fade'
  appear
  appearFromClass='fade-appear-from'
  appearActiveClass='fade-appear-active'
  appearToClass='fade-appear-to'
>
  {() => <div>始终可见,但首次渲染时淡入</div>}
</Transition>
```

## `type` prop

当元素**同时**有 CSS `transition` 和 CSS `animation` 时,`<Transition>` 会选择
时长较长的那个。用 `type` 强制指定:

```tsx
<Transition name='combo' type='animation'>
  {() => $show.value && <div />}
</Transition>
```

| `type`         | 监听事件               |
| -------------- | ---------------------- |
| `'transition'` | `transitionend`        |
| `'animation'`  | `animationend`         |
| _(省略)_       | 取计算时长较长的那个    |

## 自定义类名

集成第三方 CSS 框架(Animate.css、Tailwind `transition` 等)时,可以单独覆盖
每个类名:

| Prop                | 默认值                            |
| ------------------- | --------------------------------- |
| `enterFromClass`    | `{name}-enter-from`               |
| `enterActiveClass`  | `{name}-enter-active`             |
| `enterToClass`      | `{name}-enter-to`                 |
| `leaveFromClass`    | `{name}-leave-from`               |
| `leaveActiveClass`  | `{name}-leave-active`             |
| `leaveToClass`      | `{name}-leave-to`                 |
| `appearFromClass`   | 回退到 `enterFromClass`           |
| `appearActiveClass` | 回退到 `enterActiveClass`         |
| `appearToClass`     | 回退到 `enterToClass`             |

```tsx
{/* 集成 Animate.css */}
<Transition
  enterActiveClass='animate__animated animate__fadeIn'
  leaveActiveClass='animate__animated animate__fadeOut'
  duration={500}
>
  {() => $show.value && <div>用 Animate.css 做动画</div>}
</Transition>
```

## 取消动画

`<Transition>` 能正确处理快速反复切换 —— 绝不会二次挂载或在 DOM 中留下孤立元素。

**进入过程中触发离开(正在进入时关掉):**

1. `onEnterCancelled(el)` 触发。
2. 立即移除进入类。
3. 从元素当前视觉状态开始播放离开动画。

**离开过程中触发进入(正在离开时开启):**

1. `onLeaveCancelled(el)` 触发。
2. 移除离开类。
3. 元素被保留在 DOM 中,继续播放进入动画。

具体实现见
[`packages/template/src/components/Transition.ts`](../../packages/template/src/components/Transition.ts)
中 `onMount` 的 effect —— 状态机在决定走哪条分支前会检查 `state === 'leaving'`
/ `state === 'entering'`。

## SSR

服务端渲染时,`<Transition>` 直接将子元素输出为**静态 HTML** —— 动画类**不会**
写入 HTML 字符串。这是安全的:动画类在客户端 hydration 之后才由客户端代码添加。

- `appear={true}` 在客户端 hydration 完成后触发一次进入动画。
- SSR 渲染期间触发的离开/进入切换只输出当前子节点状态。

## 约束

- **只支持单个根子节点。** 传入子节点数组时,`__DEV__` 下会抛出:
  ```
  [essor] <Transition> expects a single root child. Use <TransitionGroup> for multiple children.
  ```
- **非元素子节点跳过动画。** 字符串、数字等非 `Element` 值在 `__DEV__` 下会打
  印警告,不执行动画。
- **插槽应为函数。** 标准写法是 `{() => show.value && <div/>}`。函数会被响应式追
  踪;返回真值 `Element` 则挂载,返回假值则触发离开。
- **`<TransitionGroup>` 暂未实现。**

## 常见错误

### 1. 多个子节点

```tsx
{/* ❌ __DEV__ 下抛出异常 */}
<Transition name='fade'>
  {() => [<div key='a' />, <div key='b' />]}
</Transition>

{/* ✅ 包一个容器 */}
<Transition name='fade'>
  {() => $show.value && (
    <div>
      <span>a</span>
      <span>b</span>
    </div>
  )}
</Transition>
```

### 2. 漏写 `-active` CSS

没有 `-active` 规则时动画静默跳过 —— 组件仍然正常工作,元素会瞬间出现/消失,
但没有运动效果。

```css
/* ❌ 没有规则 — 无动画 */
.fade-enter-from { opacity: 0; }

/* ✅ 补上 -active 规则 */
.fade-enter-active { transition: opacity 300ms; }
.fade-enter-from   { opacity: 0; }
```

### 3. 使用 `transition: all` 却没加 `type: 'transition'`

```css
.fade-enter-active { transition: all 300ms; }
```

可以工作,但 `all` 会让所有可动画属性都参与过渡。如果过渡期间有其他属性变化,
可能提前触发 `transitionend` 导致动画被截断。优先用具体属性名,或加上
`type='transition'` 锁定监听 `transitionend`。

### 4. `css={false}` 却没有 JS 钩子

```tsx
{/* ❌ 元素瞬间出现 / 消失,无动画 */}
<Transition css={false}>
  {() => $show.value && <div />}
</Transition>

{/* ✅ 提供 onEnter / onLeave 钩子 */}
<Transition
  css={false}
  onEnter={(el, done) => { /* 播放动画,然后调用 done() */ }}
  onLeave={(el, done) => { /* 播放动画,然后调用 done() */ }}
>
  {() => $show.value && <div />}
</Transition>
```

## 最佳实践

1. **始终写 `-active` 规则**,并明确指定 `transition-duration` 或
   `animation-duration`。没有这条规则,组件照常工作但没有动画效果。
2. **用 `duration` prop 做确定性计时** —— 尤其是 CSS 里用了 `transition: all`
   或链式动画时。
3. **复杂动画优先用 `css={false}` + Web Animations API**,可完全命令式控制,同
   时让 `<Transition>` 管理挂载/卸载生命周期。
4. **动画类名是 kebab-case**,前缀跟 `name` prop 一致 —— `name='myAnim'` 产生
   `myAnim-enter-from`,不是 `my-anim-enter-from`。
5. **插槽保持函数形式** —— `{() => cond && <El/>}` 是标准写法。传静态节点意味
   着 `<Transition>` 始终看到"子节点存在",离开路径永远不会触发。
6. **纯出场动画**(如页面加载淡入)设置 `appear`,插槽函数始终返回该元素即可。
