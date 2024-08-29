
使用有限状态机实现简版的html解析器
===================

 更新时间：2023年11月29日 10:12:18   作者：咖啡教室  

FSM(Finite State Machines) 有限状态机,也叫有限状态自动机,是为研究有限内存的计算过程和某些语言类而抽象出的一种计算模型,本文将使用有限状态机实现一个简版的html解析器,有需要的小伙伴可以参考下

−

##### 目录

* [有限状态机有什么用](#_label0)
* [有限状态机是怎么工作的](#_label1)
* [简版的 html 解析器](#_label2)

* [词法分析，生成 token 流](#_lab2_2_0)
* [语法分析，生成 AST 抽象语法树](#_lab2_2_1)

FSM(Finite State Machines) 有限状态机，也叫有限状态自动机，是为研究有限内存的计算过程和某些语言类而抽象出的一种计算模型，它拥有有限个数量的状态，每个状态可以迁移到零个或多个状态，输入字串决定执行哪个状态的迁移。

有限状态机有什么用
---------

代码编译器在工作时就需要通过词法分析、语法分析、语义分析来得到 AST(Abtract Syntaxt Tree) 抽象语法树。需要先词法分析拿到的所有 token 流，接着通过语法分析将 token 流进行文法校验生成语法解析树，这个过程一般有两种：

* 边分词边生成 AST，像解析 HTML、CSS
* 先分词生成所有 token，再来进行语法分析生成 AST，像 js

我们在前端工作中经常用到的：babel、typescript、eslint、postcss、prettier、uniapp、htmlparse、代码编辑器的语法高亮...这些其实都是基于 AST 抽象语法树来实现的，而为了得到 AST 我们需要先进行分词，而分词一个比较好的方式就是通过有限状态机来实现。

代码的本质就是字符串，分词就是把代码字符串变成一个个最小单元到不能再拆分的单词，也叫 token(注意不是咱们平时用到的登录态 token)，分词器的英文 tokenizer。代码其实跟我们一篇英文文章、一首中文古诗、一个数学运算...都是一样的，我们一样可以用分词技术来拆分这些元素。

有限状态机是怎么工作的
-----------

为了理解有限状态机到底是怎么工作的，我们先来实现一个简单的减法运算分词。要求用状态机把 500-250=250 这个减法运算分词成一个数组，首先定义一共有2种状态：number-数字、operator-运算符，每一个最小的 token 只能是这两个当中的一个，代码如下

``` js
// 500-250=250
// [
//   { type: 'number', value: '500' },
//   { type: 'operator', value: '-' },
//   { type: 'number', value: '250' },
//   { type: 'operator', value: '=' },
//   { type: 'number', value: '250' }
// ]
 
function mathTokenizer(text) {
  // 匹配数字正则
  const numberReg = /\d/
  // 匹配运算符正则
  const operatorReg = /[=-]/
  // 存储所有读取到的 token 数组
  const tokens = []
  // 当前正在读取的 token 信息
  let currentToken = {}
 
  // 初始状态
  function init(e) {
    if (numberReg.test(e)) {
      currentToken = { type: 'number', value: e }
      return onNumber
    } else if (operatorReg.test(e)) {
      currentToken = { type: 'operator', value: e }
      return onOperator
    }
  }
 
  // 读取到数字
  function onNumber(e) {
    if (numberReg.test(e)) {
      currentToken.value += e
      return onNumber
    }
    if (operatorReg.test(e)) {
      pushToken(currentToken)
      currentToken = { type: 'operator', value: e }
      return onOperator
    }
  }
 
  // 读取到运算符
  function onOperator(e) {
    if (numberReg.test(e)) {
      pushToken(currentToken)
      currentToken = { type: 'number', value: e }
      return onNumber
    }
    if (operatorReg.test(e)) {
      pushToken(currentToken)
      currentToken = { type: 'operator', value: e }
      return onOperator
    }
  }
 
  // 每次读取到完整的一个 token 后存入到数组中
  function pushToken(token) {
    tokens.push(token)
    currentToken = {}
  }
 
  // 遍历读取数组
  function parse(str) {
    const len = str.length
    let stateMachine = init
    for (let i = 0; i < len; i++) {
      const char = str[i]
      stateMachine = stateMachine(char)
 
      // 最后一个字符匹配完了要自己 pushToken
      if (i === len - 1) {
        pushToken(currentToken)
      }
    }
 
    return tokens
  }
 
  return parse(text)
}
 
const arr = mathTokenizer('500-250=250')
console.log(arr)
```



简版的 html 解析器
------------

### 词法分析，生成 token 流

利用状态机来生成 token 流，为了方便理解以下示例不考虑标签属性节点、自闭合标签和一些异常情况。

我们先定义5个状态：标签开始、结束标签开始、标签名、标签结束、文本，每次读取到的内容会在这5个状态之间切换，每次读取时只要不是标签开始、结束标签开始、标签名、标签结束这4个状态的我们都当成文本来处理。

实际上我们只需要存储：开始标签、文本、结束标签这3个状态，所以定义的节点 type 分别为：startTag、text、endTag。你要按前面定义的5个状态来储存其实也是可以的，在下面生成 AST 直接忽略掉我们不需要的标签开始、标签结束这些状态信息就行了，只不过这里我们直接在分词这一步提前就给过滤了。

这里我们可以把状态机理解成一个函数，每遍历到一个字符我们都将这个字符传到函数中，而函数中可以根据这个字符来判断下一个状态是什么，再返回出去下一个状态函数就行了。

``` js
function htmlTokenizer(str){
  // 标签开始
  const tagStartReg = /</
  // 结束标签开始
  const closeTagReg = ///
  // 标签结束
  const tagEndReg = />/
  // 标签名
  const tagNameReg = /[a-zA-Z]/
 
    let tokens = []
    let currentToken = {}
 
  // 初始状态
  function init(e) {
    if (tagStartReg.test(e)) {
      currentToken = { type: 'startTag', tagName: '' }
            return init
        }
    if (closeTagReg.test(e)) {
      currentToken = { type: 'endTag', tagName: '' }
            return onTagName
        }
    if (tagNameReg.test(e)) {
      currentToken.tagName += e
            return onTagName
        }
 
    // 不是上面3个状态的都当成文本节点处理
    currentToken = { type: 'text', text: e }
    return onText
  }
 
  // 读取到标签名
  function onTagName(e) {
    if (tagEndReg.test(e)) {
      pushToken(currentToken)
            return init
        } else {
      currentToken.tagName = (currentToken.tagName || '') + e
            return onTagName
        }
  }
 
  // 读取到文本
  function onText(e) {
    if (tagStartReg.test(e)) {
      pushToken(currentToken)
      currentToken = { type: 'startTag', tagName: '' }
            return init
        } else {
      currentToken.text = (currentToken.text || '') + e
            return onText
    }
  }
 
  // 每次读取到完整的一个 token 后存入到数组中
    function pushToken(e) {
        tokens.push(e)
        currentToken = {}
    }
 
  // 遍历读取数组
  function parse(chars){
    let stateMachine = init
        for (const char of chars) {
            stateMachine = stateMachine(char)
        }
        return tokens
    }
 
  return parse(str)
}
 
const tokenList = htmlTokenizer('<div>静夜思<p>锄禾日当午</p>周小黑<p>粒粒皆辛苦</p>公元一七八八年</div>')
console.log(tokenList)
```



### 语法分析，生成 AST 抽象语法树

这一步主要就怎么能把分词得到的数组转换成树形 tree 数据结构，日常开发中我们 array 转 tree 一般都是需要根据父亲 id 之类的来实现遍历生成，但是这里咱拿到的数组是没有这个父 id 的，那要怎么实现呢？

先观察数据结构，虽然是一个数组，但是这个数组其实是个类似中心对称结构的，我们暂时先忽略掉数组里的 type 为 text 的文本内容(因为这个其实我们是不能把它当成一个父节点的，它只能是某个标签的子节点)，过滤掉文本后数组第1个元素和最后1个元素正好是1对，第2个元素和倒数第2个元素又是1对，我们要实现的就是把内层获取到的一对对标签不断挂载到它前面一对签的 children 属性上来实现 tree 结构。

那我们可以从数组第一项目开始遍历，然后用一个数组来模拟 stack 栈存每次遍历到的标签信息(栈的特点是先进后出，类似我们往一个桶里放东西，放在最上面的可以最先拿出来，规定数组只能使用 push 和 pop 就能模拟栈了)。

当遇到开始标签的时候就说明遇到一个新的标签了，这时就往栈里 push 进去，当遇到结束标签时就说明当前这个标签的所有信息都已经读取处理完了，那我们就可以将它从栈里弹出来，然后现在栈里最上面的一个元素其实就是当前弹出来的父标签了，直接挂载到 children 上就行了。整个过程其实主要就是理解下面2点：

* 用栈来缓存节点：嵌套在内部的节点就可以先出栈，根节点最后出栈
* 用引用类型对象的特点，来不断挂载节点

``` js
function htmlAst(tokenList) {
    const stack = []
 
  for (const node of tokenList) {
 
    // 开始标签：入栈
        if (node.type === 'startTag'){
            stack.push(node)
        }
 
    // 结束标签：出栈
        if (node.type === 'endTag') {
            const currentNode = stack.pop()
            const parent = stack[stack.length - 1]
 
            if (parent) {
                if (!parent.children) parent.children = []
        parent.children.push(currentNode)
            } else {
        const root = { type: 'document', children: [currentNode] }
                return root
            }
        }
 
    // 文本：加到父标签的 children 上
        if (node.type === 'text') {
            const parent = stack[stack.length - 1]
      if (!parent.children) parent.children = []
      parent.children.push(node)
        }
  }
}
```



然后就能拿到我们需要的 AST 语法树了，结构如下：

``` json
{
  "type": "document",
  "children": [
    {
      "type": "startTag",
      "tagName": "div",
      "children": [
        {
          "type": "text",
          "text": "静夜思"
        },
        {
          "type": "startTag",
          "tagName": "p",
          "children": [
            {
              "type": "text",
              "text": "锄禾日当午"
            }
          ]
        },
        {
          "type": "text",
          "text": "周小黑"
        },
        {
          "type": "startTag",
          "tagName": "p",
          "children": [
            {
              "type": "text",
              "text": "粒粒皆辛苦"
            }
          ]
        },
        {
          "type": "text",
          "text": "公元一七八八年"
        }
      ]
    }
  ]
}
```



理解了状态机就如给你按上了一双翅膀，不管给你任何一段字符任容，都可以通过状态机来拆分成我们想要的结构，理解了上面这些再去看 vue 里的模板编译，你就能知道它到底是怎么加进去那些语法糖的了。还比如小程序中的富文本解析，特定平台的小程序实际上是不能识别浏览器里的 html 的，那我们就需要先将 html 通过状态机转成 AST，然后再按照小程序的语法来进行特定的转换。

到此这篇关于使用有限状态机实现简版的html解析器的文章就介绍到这了
