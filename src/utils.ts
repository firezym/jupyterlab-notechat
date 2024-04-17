// 移除ANSI转义序列
export const removeANSISequences = (str: string): string => {
  // eslint-disable-next-line no-control-regex
  const ansiEscapeRegex = /\u001b\[[0-9;]*m/g
  return str.replace(ansiEscapeRegex, '')
}

// 将字符串编码为base64
export const utf8ToBase64 = (str: string): string => {
  // 将字符串编码为UTF-8字节
  const utf8Bytes = new TextEncoder().encode(str)
  // 转换为Base64
  const base64 = btoa(String.fromCharCode.apply(null, Array.from(utf8Bytes)))
  return base64
}

// 处理 Markdown 单元格的字符串，根据指定的字符串数组移除首尾行
export const processCellSourceString = async (
  cellString: string,
  removeHeadStringArr: string[] = [], // 默认为空数组
  removeTailStringArr: string[] = [] // 默认为空数组
): Promise<string> => {
  let lines = cellString.split('\n')

  // 如果第一行包含 removeHeadStringArr 中的任何字符串，则移除第一行
  if (lines.length > 0 && removeHeadStringArr.some(headString => lines[0].includes(headString))) {
    lines = lines.slice(1)
  }

  // 如果最后一行包含 removeTailStringArr 中的任何字符串，则移除最后一行
  if (lines.length > 0 && removeTailStringArr.some(tailString => lines[lines.length - 1].includes(tailString))) {
    lines = lines.slice(0, -1)
  }

  // 返回处理后的字符串
  return lines.join('\n').trim()
}

// 定义解析对话中参数的函数，接收一段文本作为输入，返回一个键值对映射对象
export const parseChatParams = async (input: string): Promise<{ [key: string]: any }> => {
  // 初始化一个空对象来存储解析出的参数
  const params: { [key: string]: any } = {}

  // 使用正则表达式匹配参数模式

  // 以及不带值的 -param 或 --param 形式的参数
  // 在文本的开头和结尾添加一个空格
  // const modifiedText = ' ' + input.trim() + ' '
  // 正则表达式以匹配以空格开头的参数
  // const regex = /\s--?\w+.*?(?=\s--?\w+|$)/g
  // const matches = modifiedText.match(regex)

  // 使用正则表达式匹配参数文本中含有'.'的路径字符串，并替换路径中的可能的'@'，防止被误解析为参数
  const placeholder = '<AT>'
  const texts = input.trim().replace(/\S+?\.\S+/g, match => {
    // 只替换路径中的 '@'，如果包含 '.'
    if (match.includes('.') && match.includes('@')) {
      return match.replace(/@/g, placeholder)
    } else {
      return match
    }
  })

  // 改为用@来匹配，因为-很容易和数字中的负号以及id中的-连接符混淆
  const regex = /@(\w+)\s([^@]*)/g

  // 使用正则表达式在提供的文本中查找匹配项
  const matches = texts.trim().match(regex)

  // 如果找到了匹配项，则遍历它们
  if (matches) {
    matches.forEach(param => {
      // 将每个匹配项分割为单独的部分（参数名和参数值）
      const parts = param.trim().split(/\s+/)
      // 获取参数名，移除前面的 - 或 -- 前缀
      // const key = parts[0].replace(/^-+/, '')
      // 用@来匹配
      const key = parts[0].replace(/^@/, '')

      // 如果参数后面没有跟随任何值，则将参数值设置为空字符串
      // 否则，将参数后面的所有部分作为字符串值连接起来
      if (parts.length === 1) {
        params[key] = ''
      } else {
        // slice取匹配的参数之后的参数值用空格连接，然后还原placeholder为@
        params[key] = parts.slice(1).join(' ').replace(new RegExp(placeholder, 'g'), '@')
      }
    })
  }
  // 返回解析出的参数映射对象
  return params
}

// 专门解析cellid列表的函数
export const parseCellReferences = async (input: string, currentId: number, maxId: number, numPrevCells: number = 2): Promise<(number | string)[]> => {
  // 如果输入为空，则返回当前id及其前numPrevCells个id，如果用户定义为负数则取绝对值，只向前取不向后取
  if (!input) {
    const refs = []
    for (let i = Math.max(0, currentId - Math.abs(numPrevCells)); i <= currentId; i++) {
      refs.push(i)
    }
    return refs
  }

  // 移除输入字符串两端的包裹符号
  // eslint-disable-next-line no-useless-escape
  const trimmedInput = input.replace(/^\s*[\[\]【】{}()（）]\s*|\s*[\[\]【】{}()（）]\s*$/g, '')
  // 使用逗号、分号、空格等分隔符将字符串分割成多个token
  const tokens = trimmedInput.split(/[,，|；; ]+/)

  // Set元素不重复
  const refs: Set<number | string> = new Set()
  // 无论如何当前的id肯定是要加入到ids集合中的
  refs.add(currentId)

  // cell中的范围定义覆盖全局：是否有范围，如果有，就不用加入prevNumCells作为参数，如果没有，就加入prevNumCells作为参数
  let hasRange = false

  tokens.forEach(token => {
    /** 如果token包含引号，处理为唯一ID引用 */
    if (token.match(/['"“”‘’`]/)) {
      // 移除所有引号并去除首尾空格
      const uniqueId = token.replace(/['"“”‘’`]/g, '').trim()
      // 如果处理后的字符串非空，则添加到ids集合中
      if (uniqueId) {
        refs.add(uniqueId)
      }
    } else if (token.match(/^[-+]\d+$/)) {
      /** 处理单独的带有正负号的数字，处理单个相对数字ID引用 */
      // 将token转换为数字
      const relativeNumId = parseInt(token, 10)
      // 计算相对于currentId的绝对值
      const adjustedId = currentId + relativeNumId
      // 将计算后的ID添加到ids集合中
      refs.add(adjustedId)
    } else if (token.match(/^\d+$/)) {
      /** 如果token是一个纯数字，处理为单个绝对数字ID引用 */
      const numId = parseInt(token, 10)
      refs.add(numId)
    } else if (token.match(/^(alone|single|sole)$/)) {
      /** 如果token匹配`sole`,`single`,`alone`三个单词，则视为当前活动单元格，为stand alone模式，忽略默认的range */
      hasRange = true
      refs.add(currentId)
    }
    // 如果token是一个带有正负号的范围，处理为相对数字ID引用
    // 匹配全范围
    else if (token.match(/^[:：~]+$/)) {
      hasRange = true
      // 无需解析，直接添加所有ID
      for (let i = 0; i <= maxId; i++) {
        refs.add(i)
      }
    }
    // 匹配+和: +0: | +: || :+0 | :+ || +:0 | 0:+ ，表示active index之后的所有的cell，可以匹配多个重复字符
    else if (token.match(/^(\++0*[:：~]+|[:：~]+\++0*|\++[:：~]+0+|0+[:：~]+\++)$/)) {
      hasRange = true
      // 无需解析，直接添加所有ID
      for (let i = currentId; i <= maxId; i++) {
        refs.add(i)
      }
    }
    // 匹配-和: -0: | -: || :-0 | :- || -:0 | 0:- ，表示active index之前的所有的cell，可以匹配多个重复字符
    // eslint-disable-next-line no-useless-escape
    else if (token.match(/^(\-+0*[:：~]+|[:：~]+\-+0*|\-+[:：~]+0+|0+[:：~]+\-+)$/)) {
      hasRange = true
      // 无需解析，直接添加所有ID
      for (let i = 0; i <= currentId; i++) {
        refs.add(i)
      }
    }
    // 匹配 +x: | -x:，表示该相对index之后所有的cell
    else if (token.match(/^[-+]\d+[:：~]$/)) {
      hasRange = true
      // 分割起始和结束范围，并转换为数字，缺省值为0
      const [startStr] = token.split(/[:：~]/)
      const start = startStr ? parseInt(startStr, 10) : 0
      // 调整范围为绝对值，基于currentId计算，如果小于0则取0
      const adjustedStart = Math.max(0, currentId + start)
      // 将调整后的范围内的每个数字添加到ids集合中
      for (let i = adjustedStart; i <= maxId; i++) {
        refs.add(i)
      }
    }
    // 匹配无符号 x:，表示该绝对index之后所有的cell
    else if (token.match(/^\d+[:：~]$/)) {
      hasRange = true
      // 分割起始和结束范围，并转换为数字，缺省值为0
      const [startStr] = token.split(/[:：~]/)
      const start = startStr ? parseInt(startStr, 10) : 0
      // 调整范围为绝对值，如果小于0则取0
      const adjustedStart = Math.max(0, start)
      // 将调整后的范围内的每个数字添加到ids集合中
      for (let i = adjustedStart; i <= maxId; i++) {
        refs.add(i)
      }
    }
    // 匹配 :+x | :-x，表示该相对index之前所有的cell
    else if (token.match(/^[:：~][-+]\d+$/)) {
      hasRange = true
      // 分割起始和结束范围，并转换为数字，缺省值为0
      const [, endStr] = token.split(/[:：~]/)
      const end = endStr ? parseInt(endStr, 10) : 0
      // 调整范围为绝对值，基于currentId计算，如果大于maxId则取maxId
      const adjustedEnd = Math.min(currentId + end, maxId)
      // 将调整后的范围内的每个数字添加到ids集合中
      for (let i = 0; i <= adjustedEnd; i++) {
        refs.add(i)
      }
    }
    // 匹配无符号 :x，表示该绝对index之前所有的cell
    else if (token.match(/^[:：~]\d+$/)) {
      hasRange = true
      // 分割起始和结束范围，并转换为数字，缺省值为0
      const [, endStr] = token.split(/[:：~]/)
      const end = endStr ? parseInt(endStr, 10) : 0
      // 调整范围为绝对值，如果大于maxId则取maxId
      const adjustedEnd = Math.min(end, maxId)
      // 将调整后的范围内的每个数字添加到ids集合中
      for (let i = 0; i <= adjustedEnd; i++) {
        refs.add(i)
      }
    }
    // 匹配 +-x:y | x:+-y | +-x:+-y 三种带符号的情况
    else if (token.match(/^([-+]\d+[:：~]\d+|\d+[:：~][-+]\d+|[-+]\d+[:：~][-+]\d+)$/)) {
      hasRange = true
      // 分割起始和结束范围，并转换为数字，缺省值为0
      const [startStr, endStr] = token.split(/[:：~]/)
      const start = startStr ? parseInt(startStr, 10) : 0
      const end = endStr ? parseInt(endStr, 10) : 0
      // 调整范围为绝对值，基于currentId计算，通过判断大小把范围顺序先调整好
      const adjustedStart = Math.min(currentId + start, currentId + end)
      const adjustedEnd = Math.max(currentId + start, currentId + end)
      // 将调整后的范围内的每个数字添加到ids集合中
      for (let i = Math.max(0, adjustedStart); i <= Math.min(adjustedEnd, maxId); i++) {
        refs.add(i)
      }
    }
    // 如果token是一个纯数字范围，处理为绝对数字ID引用
    else if (token.match(/^(\d+[:：~]\d*|\d*[:：~]\d+)$/)) {
      hasRange = true
      // 分割起始和结束范围，并转换为数字，如果没有指定结束范围，则结束范围等于起始范围
      const [startStr, endStr] = token.split(/[:：~]/)
      const start = startStr ? parseInt(startStr, 10) : 0
      const end = endStr ? parseInt(endStr, 10) : 0
      // 调整范围为绝对值，通过判断大小把范围顺序先调整好
      const adjustedStart = Math.min(start, end)
      const adjustedEnd = Math.max(start, end)
      // 将范围内的每个数字添加到ids集合中
      for (let i = Math.max(0, adjustedStart); i <= Math.min(adjustedEnd, maxId); i++) {
        refs.add(i)
      }
    }
    // 如果token既不包含引号，也不符合数字范围的模式，视为唯一ID
    else if (token.trim()) {
      // 去除首尾空格后添加到ids集合中
      refs.add(token.trim())
    }
  })

  // 如果没有cell的个性化范围覆盖，就加入默认的prevNumCells范围
  if (hasRange === false) {
    for (let i = Math.max(0, currentId - Math.abs(numPrevCells)); i <= currentId; i++) {
      refs.add(i)
    }
  }

  // 返回去重并排序的结果
  return Array.from(refs).sort((a, b) => {
    // 如果两个元素都是数字，按数字大小排序
    if (typeof a === 'number' && typeof b === 'number') {
      return a - b
    }
    // 如果两个元素都是字符串，按字典序排序
    if (typeof a === 'string' && typeof b === 'string') {
      return a.localeCompare(b)
    }
    // 如果一个是数字一个是字符串，数字排在前面
    return typeof a === 'number' ? -1 : 1
  })
}
