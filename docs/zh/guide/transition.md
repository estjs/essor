# Transition 与 TransitionGroup

Essor 内置两个动画组件:

- **`<Transition>`** —— 对**单个元素**的挂载和卸载做过渡动画。
- **`<TransitionGroup>`** —— 对**带 key 的列表**做动画:进入、离开,以及位置
  变化(FLIP)。

两个组件默认都用 CSS 类驱动,同时支持 JS 钩子,可以完全命令式接管动画。

## `<Transition>`

把任意条件渲染的 UI 包在 `<Transition>` 里,定义好 CSS 类,运行时负责整个进入/
离开动画的编排。

功能一览:

- **CSS 类过渡** —— 经典的 6-class `*-enter-*` / `*-leave-*` 序列
- **JS 钩子** —— `onBeforeEnter`、`onEnter(done)`、`onAfterEnter`、`onEnterCancelled` 及 leave 对应钩子
- **appear** —— 首次挂载时也播放进入动画
- **duration 覆盖** —— 用精确毫秒值跳过 CSS 事件检测
- **取消动画** —— 进行中被反向触发时干净处理,不留孤立元素
- **`css={false}`** —— 完全关闭类操作,专用 Web Animations API 或外部库
- **type 检测** —— 同时存在 transition 和 animation 时强制指定监听哪个结束事件

### 基本用法

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

| `name`   | 进入类                                                  | 离开类                                                  |
| -------- | ------------------------------------------------------- | ------------------------------------------------------- |
| `'v'`    | `v-enter-from`, `v-enter-active`, `v-enter-to`          | `v-leave-from`, `v-leave-active`, `v-leave-to`          |
| `'fade'` | `fade-enter-from`, `fade-enter-active`, `fade-enter-to` | `fade-leave-from`, `fade-leave-active`, `fade-leave-to` |

### CSS 类序列

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

### JS 钩子

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

### `css={false}` —— 纯 JS 模式

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

### `duration` prop

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

### `appear` prop

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

### `type` prop

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

### 自定义类名

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

### 取消动画

`<Transition>` 能正确处理快速反复切换 —— 绝不会二次挂载或在 DOM 中留下孤立元素。

**进入过程中触发离开(正在进入时关掉):**

1. `onEnterCancelled(el)` 触发。
2. 立即移除进入类。
3. 从元素当前视觉状态开始播放离开动画。

**离开过程中触发进入(正在离开时开启):**

1. `onLeaveCancelled(el)` 触发。
2. 移除离开类。
3. 元素被保留在 DOM 中,继续播放进入动画。

### SSR

服务端渲染时,`<Transition>` 直接将子元素输出为**静态 HTML** —— 动画类**不会**
写入 HTML 字符串。这是安全的:动画类在客户端 hydration 之后才由客户端代码添加。

- `appear={true}` 在客户端 hydration 完成后触发一次进入动画。
- SSR 渲染期间触发的离开/进入切换只输出当前子节点状态。

### 约束

- **只支持单个根子节点。** 传入子节点数组时,`__DEV__` 下会抛出:
  ```
  [essor] <Transition> expects a single root child. Use <TransitionGroup> for multiple children.
  ```
- **非元素子节点跳过动画。** 字符串、数字等非 `Element` 值在 `__DEV__` 下会打
  印警告,不执行动画。
- **插槽应为函数。** 标准写法是 `{() => show.value && <div/>}`。函数会被响应式追
  踪;返回真值 `Element` 则挂载,返回假值则触发离开。

---

## `<TransitionGroup>`

`<TransitionGroup>` 给**带 key 的列表**做三种协同动画:

- **进入(enter)** —— 新加入的项目用 `*-enter-*` 类淡入或滑入
- **离开(leave)** —— 被移除的项目播放离场动画;运行时会将它们设为
  `position: absolute`,让其它项目能在下方平滑回流,动画结束后再卸载
- **移动(move)** —— 留在列表中但位置变化的项目用 **FLIP** 技术做位置过渡:
  先快照旧位置,DOM 重排后量出位移,先用 `transform` 跳回旧位置,再过渡到
  新位置,过渡期间挂载 `moveClass`

继承了 `<Transition>` 的全部单项配置(name、css、type、duration、JS 钩子、自定
义类名等),并新增了一些列表专属的 prop。

### 基本用法

```tsx
import { useSignal } from 'essor'
import { TransitionGroup } from 'essor'

function TodoList() {
  const $items = useSignal([
    { id: 1, label: '买牛奶' },
    { id: 2, label: '遛狗' },
  ])

  const add = () =>
    ($items.value = [...$items.value, { id: Date.now(), label: '新任务' }])

  const remove = (id: number) =>
    ($items.value = $items.value.filter(i => i.id !== id))

  return (
    <>
      <button onClick={add}>添加</button>
      <TransitionGroup name='list' each={$items} key={item => item.id} tag='ul'>
        {(item) => (
          <li onClick={() => remove(item.id)}>{item.label}</li>
        )}
      </TransitionGroup>
    </>
  )
}
```

```css
/* enter / leave / move 共享同一条过渡规则 */
.list-enter-active,
.list-leave-active,
.list-move {
  transition: all 300ms ease;
}

.list-enter-from,
.list-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
```

> `<TransitionGroup>` 在离开阶段会**自动**给离开的项目设置
> `position: absolute` 并锁定 `top` / `left` / `width` / `height`,让周围
> 项目正常回流。**不需要**自己写 `position: absolute` 规则。

### 必需 prop

| Prop       | 类型                                                | 说明                                                                        |
| ---------- | --------------------------------------------------- | --------------------------------------------------------------------------- |
| `each`     | `T[] \| Signal<T[]> \| () => T[]`                   | 源列表,变化时响应式触发更新。                                              |
| `key`      | `(item: T, index: number) => unknown`               | 每一行的稳定唯一标识,用于检测新增 / 删除 / 移动。                          |
| `children` | `(item: T, index: number) => Element \| Component`  | 单行的渲染函数,必须返回单个根 Element 或 Component。                       |

### 可选 prop

| Prop        | 默认值          | 说明                                                          |
| ----------- | --------------- | ------------------------------------------------------------- |
| `tag`       | `'div'`         | 外层包裹元素。提供布局根,用作 FLIP 测量基准。                |
| `moveClass` | `${name}-move`  | 移动动画期间挂载在子项上的 class。                            |

`<Transition>` 的其余 prop 都被继承 —— `name`、`css`、`type`、`duration`、
`enterFromClass` … `leaveToClass`,以及下面的 JS 钩子。

### 单项钩子

钩子集合与 `<Transition>` 完全一致,**按行触发**:

| 钩子               | 触发时机                                |
| ------------------ | --------------------------------------- |
| `onBeforeEnter`    | 给新加项目添加进入类之前                |
| `onEnter`          | 进入 active 阶段开始时                  |
| `onAfterEnter`     | 进入动画完成后                          |
| `onEnterCancelled` | 进入过程中又触发了离开                  |
| `onBeforeLeave`    | 添加离开类之前                          |
| `onLeave`          | 离开 active 阶段开始时                  |
| `onAfterLeave`     | 离开动画完成后                          |
| `onLeaveCancelled` | 离开过程中同一 key 又回到列表           |

```tsx
<TransitionGroup
  name='list'
  each={$items}
  key={i => i.id}
  onEnter={(el, done) => {
    el.animate(
      [{ opacity: 0 }, { opacity: 1 }],
      { duration: 200 },
    ).finished.then(done)
  }}
>
  {(item) => <div class='card'>{item.label}</div>}
</TransitionGroup>
```

### FLIP 移动动画

当同一 key 出现在新的索引位置时,运行时对该行的元素执行 **FLIP**:

```
1. 重排前快照 getBoundingClientRect()。
2. 将 DOM 子节点重排成新顺序。
3. 重排后再快照,计算 (dx, dy) 位移。
4. 设置 transform: translate(dx, dy),transitionDuration: 0s,触发 reflow。
5. 添加 moveClass,恢复原 transitionDuration。
6. 清空 transform —— 浏览器自动过渡回原位置。
7. 等待 transitionend,移除 moveClass。
```

默认 `moveClass` 为 `${name}-move`(例如 `list-move`)。在该 class 上写
`transition` 规则即可,通常和 enter/leave 共用同一条:

```css
.list-move {
  transition: transform 300ms ease;
}
```

如果新旧位置完全一致(没有位移),FLIP 一步直接跳过。

### 子节点为 Component

`children(item, index)` 既可以返回 `Element`,也可以返回一个 `Component`
实例。返回 Component 时:

- 该 Component 会被挂载到 wrapper 中,作为普通子节点存在。
- 它**渲染出的第一个 Element** 参与 enter/leave/move。
- 若 Component 渲染出多个根节点,只有第一个动画 —— `__DEV__` 下会打印警告。

```tsx
<TransitionGroup name='cards' each={$items} key={i => i.id}>
  {(item) => <Card data={item} />}  {/* Card 是一个 Essor 组件 */}
</TransitionGroup>
```

### 每行独立作用域

每一行的渲染函数运行在**独立的响应式作用域**中(行为与 `<For>` 一致)。在
`children(item, index)` 中创建的 signal、effect、`onCleanup` 等会在该行被
移除时**自动清理** —— 不需要等整个 `<TransitionGroup>` 卸载。

### `css={false}`

语义和 `<Transition>` 一致 —— 完全禁用类操作。未提供 JS 钩子时,被移除的项目
会**同步**从 DOM 上拆除(无离开动画),新加项目立即出现。

### 首次挂载不会播放进入动画

首屏渲染就在列表中的项目**不会**触发进入动画。`<TransitionGroup>` 不支持
`appear`。如需首屏动画,可在挂载后再 push 项目,或自己在 JS 钩子里做一次性
处理。

### 约束

- **`key` 必须稳定且唯一。** 两个项目返回同一 key 会被视为重复 —— 第二个
  不会进入,reconcile 时也会错乱。
- **渲染函数必须返回单个根 Element 或 Component。** 返回 `null`、字符串、
  数字时该行会被跳过,`__DEV__` 下打印警告。
- **Component 渲染多个根节点时只动画第一个**,其余根节点不参与过渡。
- **不支持 `appear`。** 首屏渲染的项目跳过进入动画。需要首屏动画时,可先用
  空列表挂载、再 push 项目,或自己写 JS 钩子。
- **离开时 `position` 由运行时接管。** 自定义 `*-leave-active` 样式时**不要**
  覆盖 `position`,运行时会在离开期间设为 `absolute`。

### 常见写法

**列表交错(stagger):**

```tsx
<TransitionGroup
  name='list'
  each={$items}
  key={i => i.id}
  onEnter={(el, done) => {
    const i = Number((el as HTMLElement).dataset.index)
    setTimeout(done, 50 * i + 200)
  }}
>
  {(item, index) => (
    <li data-index={index}>{item.label}</li>
  )}
</TransitionGroup>
```

**只做移动动画(enter / leave 立即完成):**

```css
.list-move {
  transition: transform 500ms cubic-bezier(0.22, 1, 0.36, 1);
}
/* 关闭 enter/leave,仅 reorder 动画 */
.list-enter-active,
.list-leave-active {
  transition: none;
}
```

---

## 常见错误

### 1. `<Transition>` 内多个子节点

```tsx
{/* ❌ __DEV__ 下抛出异常 */}
<Transition name='fade'>
  {() => [<div key='a' />, <div key='b' />]}
</Transition>

{/* ✅ 包一个容器 —— 或对列表使用 TransitionGroup */}
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

### 5. `<TransitionGroup>` 没有给 `moveClass` 写过渡规则

```css
/* ❌ 列表项突变到新位置,没有移动动画 */
.list-enter-active, .list-leave-active {
  transition: opacity 300ms;
}

/* ✅ 一并给 .list-move 加规则 */
.list-enter-active, .list-leave-active, .list-move {
  transition: all 300ms;
}
```

### 6. key 不唯一

```tsx
{/* ❌ 两项共享 key=0 — 第二项被当作重复,行为异常 */}
<TransitionGroup each={items} key={() => 0}>
  {item => <li>{item.label}</li>}
</TransitionGroup>

{/* ✅ 用稳定的业务 id 作为 key */}
<TransitionGroup each={items} key={item => item.id}>
  {item => <li>{item.label}</li>}
</TransitionGroup>
```

---

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
7. **`<TransitionGroup>` 的 key 用稳定身份** —— 用 `item.id`,不要用数组下
   标。下标作为 key 会让移动动画完全失效。
8. **`-enter-active`、`-leave-active`、`-move` 使用同一条 transition 规则**,
   列表动画看起来才连贯。
