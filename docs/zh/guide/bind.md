# bind 双向绑定

`bind` 用来把表单元素和状态做双向同步：

1. 状态变化时，自动更新 DOM
2. 用户输入时，自动写回状态

适用于 `input`、`textarea`、`select` 以及遵循约定的组件。

## 基础用法

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

## 简写语法

`bind` 支持简写，框架会根据元素类型自动推断绑定属性：

```tsx
function Demo() {
  const $text = ''
  const $checked = false

  return (
    <>
      <input bind={$text} />
      <input type='checkbox' bind={$checked} />
    </>
  )
}
```

推断规则：

1. `input[type=checkbox|radio]` -> `checked`
2. `input[type=file]` -> `files`
3. 其他 `input/textarea/select` -> `value`

## 修饰符

目前支持 3 个修饰符：`trim`、`number`、`lazy`。

```tsx
function Demo() {
  let $keyword = ''
  let $age: string | number = ''

  return (
    <>
      <input bind:value.trim={$keyword} placeholder='会自动去首尾空格' />
      <input bind:value.number={$age} placeholder='尝试转数字' />
      <input bind:value.lazy={$keyword} placeholder='change 时才提交' />
    </>
  )
}
```

说明：

1. `trim`：仅字符串生效
2. `number`：可转数字则转，`NaN` 时保留原值
3. `lazy`：从 `input` 事件改为 `change` 事件提交

## 不同输入类型

### 文本输入

```tsx
let $title = ''
<input bind:value={$title} />
```

### checkbox

```tsx
let $enabled = false
<input type='checkbox' bind:checked={$enabled} />
```

### radio

```tsx
let $theme = 'light'

<>
  <input type='radio' name='theme' value='light' bind:checked={$theme} />
  <input type='radio' name='theme' value='dark' bind:checked={$theme} />
</>
```

### select

```tsx
let $city = 'beijing'

<select bind:value={$city}>
  <option value='beijing'>北京</option>
  <option value='shanghai'>上海</option>
</select>
```

### select multiple

```tsx
let $skills = ['ts']

<select multiple bind:value={$skills}>
  <option value='ts'>TypeScript</option>
  <option value='react'>React</option>
  <option value='essor'>Essor</option>
</select>
```

### textarea

```tsx
let $bio = ''
<textarea bind:value={$bio} />
```

### file

```tsx
let $files: FileList | null = null
<input type='file' bind:files={$files} />
```

注意：浏览器安全限制下，`file` 类型通常只能“用户选择 -> 写回状态”，不能任意脚本回填文件。

## 组件上的 bind

组件上 `bind:value={$x}` 会编译为：

1. `value={x}`
2. `onValueChange={(v) => x = v}`

示例：

```tsx
function MyInput(props) {
  return (
    <input
      value={props.value}
      onInput={e => props.onValueChange?.((e.target as HTMLInputElement).value)}
    />
  )
}

function App() {
  const $name = ''
  return <MyInput bind:value={$name} />
}
```

## 行为说明

`bind:` 由 `bindElement` 实现，行为类似 Vue 的 `v-model`：

1. **输入法（IME）合成**：用户正在输入中文/日文等需要合成的字符时，模型不会立即更新，而是等到 `compositionend` 事件触发后再写回。这避免把半成品字符提交到信号中。
2. **光标保持**：当被绑定的文本框处于焦点状态，且其屏幕值（应用 `trim` / `number` 归一化后）已与模型一致时，框架会跳过 DOM 写入，防止用户输入过程中光标位置被重置。
3. **trim/number 归一化**：在 `change`（失焦）时也会再次归一化显示值，即使用户输入了多余空白，输入框也会展示规范化后的内容。
4. **自动清理**：驱动 DOM 更新的响应式 effect 注册在当前作用域中，组件卸载时会自动停止。

## 常见错误

### 1. bind 目标不可写

错误写法：

```tsx
const $name = 'a'
<input bind:value={$name + 'x'} />
```

原因：`$name + 'x'` 是表达式，不是可写目标。

正确写法：

```tsx
let $name = 'a'
<input bind:value={$name} />
```

### 2. 修饰符拼错

只支持：`trim`、`number`、`lazy`。  
其他修饰符会在编译阶段报错。

## 推荐实践

1. 文本输入优先用 `bind:value`
2. 布尔状态用 `bind:checked`
3. 需要数字转换时再加 `.number`
4. 避免对复杂表达式直接 `bind`，优先绑定变量或对象字段
5. 表单项较多时，建议把状态组织到一个响应式对象中
