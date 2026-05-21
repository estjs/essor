# bind 双向绑定

`bind` 把表单元素和响应式状态双向连起来：

1. 状态变了,DOM 自动更新
2. 用户输入 / 选择 / 切换,状态自动更新

支持 `<input>`、`<textarea>`、`<select>`,以及实现了 `update:*` 约定的组件。

## 基本用法

```tsx
function Form() {
  const $name = ''
  const $agree = false

  return (
    <div>
      <input bind:value={$name} placeholder='请输入姓名' />
      <input type='checkbox' bind:checked={$agree} />
      <p>name: {$name}</p>
      <p>agree: {$agree ? 'yes' : 'no'}</p>
    </div>
  )
}
```

## 修饰符 (Modifiers)

`bind:` 支持元组形式来挂载修饰符:

```tsx
<input bind:value={[$signal, { trim: true, number: true, lazy: true }]} />
```

数组第一个元素是绑定的信号,第二个元素是修饰符对象。
**JSX 不支持 `bind:value.trim` 这种带点号的写法**,因为 JSX 语法中属性名只允许
一对 `:`(即 `JSXNamespacedName`),不能再嵌套 `.`。元组写法是官方且唯一的修饰
符指定方式。

支持的修饰符:

| 修饰符   | 作用                                                                          |
| -------- | ----------------------------------------------------------------------------- |
| `trim`   | 去除两端空白(仅作用于字符串)                                                |
| `number` | 数字字符串自动转 number。空白 / NaN 时**保留原字符串**(不会偷偷变成 0)。   |
| `lazy`   | 在 `change` 事件提交(通常是失焦),而非 `input`                             |

```tsx
function Demo() {
  let $keyword = ''
  let $age: number | string = ''
  let $slug = ''

  return (
    <>
      <input bind:value={[$keyword, { trim: true }]} placeholder='自动 trim' />
      <input bind:value={[$age, { number: true }]}    placeholder='数字化' />
      <input bind:value={[$slug, { trim: true, lazy: true }]} placeholder='失焦才提交' />
    </>
  )
}
```

**未知修饰符在编译期就会报错**,例如 `{ trimm: true }` 会得到清晰的错误信息,
不会被静默忽略。

### `<input type="number">` 自动数字化

`<input type="number">` 和 `<input type="range">` 即使不写 `{ number: true }`
也会自动把值转成数字 —— 这点对齐 Vue 的 `v-model.number` 自动行为:

```tsx
let $progress = 0
<input type='range' min='0' max='100' bind:value={$progress} />
// $progress 是 number,不是 string
```

## 各种输入示例

### 文本输入

```tsx
let $title = ''
<input bind:value={$title} />
```

### 单个 Checkbox(布尔)

```tsx
let $enabled = false
<input type='checkbox' bind:checked={$enabled} />
```

### Checkbox 组(数组)

当绑定的 model 是数组时,每个 checkbox 的 `value` 会被加入 / 移出数组。编译器
不检查 model 类型,运行时根据当前 model 是不是数组动态决定:

```tsx
const $skills: string[] = []
<>
  <input type='checkbox' value='ts'    bind:checked={$skills} /> TypeScript
  <input type='checkbox' value='react' bind:checked={$skills} /> React
  <input type='checkbox' value='essor' bind:checked={$skills} /> Essor
</>
```

### Radio

```tsx
let $theme = 'light'

<>
  <input type='radio' name='theme' value='light' bind:checked={$theme} />
  <input type='radio' name='theme' value='dark'  bind:checked={$theme} />
</>
```

### Select

```tsx
const $city = 'beijing'
<select bind:value={$city}>
  <option value='beijing'>Beijing</option>
  <option value='shanghai'>Shanghai</option>
</select>
```

### Select 多选

```tsx
const $skills = ['ts']
<select multiple bind:value={$skills}>
  <option value='ts'>TypeScript</option>
  <option value='react'>React</option>
  <option value='essor'>Essor</option>
</select>
```

### Textarea

```tsx
const $bio = ''
<textarea bind:value={$bio} />
```

### 文件输入

```tsx
let $files: FileList | null = null
<input type='file' bind:files={$files} />
```

浏览器禁止程序写入 `<input type=file>`,所以本质是单向(DOM → model)。把 model
设为 `null` 时,会尝试通过 `DataTransfer` 创建空 FileList 来清空选择(浏览器支
持时生效)。

## 组件上的 bind

组件上的 `bind:value={$x}` 会脱糖为**两个普通 prop** —— `value` 和
`'update:value'`:

```tsx
<MyInput bind:value={$name} />
// 编译为:
<MyInput value={$name} update:value={(v) => $name = v} />
```

组件直接从 `props` 上读这两个键:

```tsx
function MyInput(props: {
  value?: string
  'update:value'?: (value: string) => void
}) {
  return (
    <input
      value={props.value}
      onInput={(e) =>
        props['update:value']?.((e.currentTarget as HTMLInputElement).value)
      }
    />
  )
}

function App() {
  const $name = ''
  return <MyInput bind:value={$name} />
}
```

绑定的 key 同时控制两个 prop 名 —— `bind:checked` 会变成 `checked={...}` +
`'update:checked'={...}`,依此类推。

**调用方传给组件的修饰符对象不会被转发** —— 修饰符语义属于叶子 DOM 元素。如果
需要 DOM 级别的修饰符,在组件内部调用 setter 前自行处理:

```tsx
function MyInput(props: {
  value?: string
  'update:value'?: (value: string) => void
}) {
  return (
    <input
      value={props.value}
      onInput={(e) =>
        props['update:value']?.((e.currentTarget as HTMLInputElement).value.trim())
      }
    />
  )
}
```

## 行为细节

`bind:` 由 [`bindElement`](../../packages/template/src/binding.ts) 实现,行为
对齐 Vue 的 `v-model`:

1. **IME 输入法**:用户用 CJK 输入法拼词时,直到 `compositionend` 触发才会写
   入 model(不会提交半成品)。同样,**输入法期间外部 model 写入也会被挂起**,
   避免把用户正在拼的字干掉。
2. **lazy + IME**:即使 `{ lazy: true }`,输入法期间的外部 model 写入依然被挂
   起;`lazy` 只改变 DOM→model 的提交时机(`change` 而不是 `input`)。
3. **光标保留**:如果输入框处于焦点中,且当前显示的值经 `trim` / `number` 处理
   后已经等于 model,框架会跳过 DOM 写入,避免光标跳动。
4. **trim/number 归一**:启用这两个修饰符时,blur 触发的 `change` 也会重新归一
   显示值,把用户多余空白等"洗"成标准形态。
5. **空白安全**:`{ number: true }` 遇到纯空白 / 空字符串会**返回原字符串**,
   而不是悄悄变成 `0`(`Number(' ')` 默认会返回 0)。
6. **生命周期**:DOM 更新用的响应式 effect 注册在当前作用域,组件卸载时自动停
   止。

## 常见错误

### 1. 绑定到不可写表达式

错误:

```tsx
const $name = 'a'
<input bind:value={$name + 'x'} />
```

`$name + 'x'` 是表达式,不是可写目标 —— 编译器无法生成 setter。

正确:

```tsx
let $name = 'a'
<input bind:value={$name} />
```

### 2. 未知修饰符

```tsx
<input bind:value={[$x, { trimm: true }]} />
// 编译期抛出:
// [essor] Unknown bind:value modifier "trimm". Allowed: trim, number, lazy.
```

### 3. 点号写法不工作

```tsx
// ❌ JSX 解析错误 —— 属性名里不允许有 '.'。
<input bind:value.trim={$x} />

// ✅ 用元组形式。
<input bind:value={[$x, { trim: true }]} />
```

## 最佳实践

1. 文本类控件用 `bind:value`;布尔 / 单选用 `bind:checked`;文件用 `bind:files`
2. 凡是要持久化的用户输入,基本都该加 `{ trim: true }`
3. 数字字段优先用 `<input type="number">` 而不是手动 `{ number: true }` ——
   既能免费自动数字化,又在手机上自动给数字键盘
4. 搜索框 / slug 字段适合 `{ lazy: true }`,不必每个按键都写状态
5. 不要绑定计算表达式,只绑定变量或对象字段
6. 大表单建议把字段放在一个响应式对象里,方便整体序列化 / 重置 / 校验
