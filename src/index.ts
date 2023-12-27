import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application'

import { ISettingRegistry } from '@jupyterlab/settingregistry'

import { ICommandPalette, ToolbarButton } from '@jupyterlab/apputils'
import { URLExt } from '@jupyterlab/coreutils'
import {
  INotebookTracker,
  NotebookPanel,
  NotebookActions,
  Notebook
} from '@jupyterlab/notebook'
import { Cell } from '@jupyterlab/cells'
import { IOutput, IExecuteResult } from '@jupyterlab/nbformat'
import { ServerConnection } from '@jupyterlab/services'
import {
  atomIconNoteChat,
  infoIconNoteChat,
  runAllIconNoteChat,
  runAboveIconNoteChat,
  runBelowIconNoteChat,
  runSelectedIconNoteChat,
  helpIconNoteChat,
  addUserCellIconNoteChat
} from './icon'
import { showCustomNotification } from './notification'

/**
 * Initialization data for the jupyterlab-notechat extension.
 */

const PLUGIN_ID = 'jupyterlab-notechat:plugin'

// 用于存储每个NotebookPanel对应的按钮，暂时这么解决
const BUTTON_MAP = new Map()

const SETTINGS = {
  'AI_NAME': '**AI Assistant:**',
  'USER_NAME': '**User:**',
  'REF_NAME': '_ref',
  'DEFAULT_PROMPT': "You are a helpful assistant, especially good at coding and quantitative analysis. You have a good background knowledge in AI, technology, finance, economics, statistics and related fields. Now you are helping the user under a JupyterLab notebook coding environment (format: *.ipynb). You will receive the source codes and outputs of the currently active cell and several preceding cells as your context. Please try to answer the user's questions or solve problems presented in the active cell. Please use simplified Chinese as your primary language to respond :) Switch to English at anytime when it's necessary, or more helpful for understanding and analysis, or instructed to do so.",
  'HELP': "How to Use NoteChat<br><br>",
  'DATA_TYPES': ['text/plain', 'image/png', 'image/jpeg']
}

// 插件定义
const plugin: JupyterFrontEndPlugin<void> = {
  id: PLUGIN_ID,
  description: 'Chat with an AI Assistant in the Notebook using OpenAI API',
  autoStart: true,
  requires: [ICommandPalette, INotebookTracker, ISettingRegistry],
  activate: (
    app: JupyterFrontEnd,
    palette: ICommandPalette,
    notebookTracker: INotebookTracker,
    settingRegistry: ISettingRegistry | null
  ) => {
    console.log('JupyterLab extension jupyterlab-notechat is activated!')

    if (settingRegistry) {
      settingRegistry
        .load(plugin.id)
        .then(settings => {
          console.log('NoteChat: settings loaded', settings.composite)
          
          /** Add command: chat cell with AI Assistant */
          addChatCellDataCommand(app, palette, notebookTracker, settings)

          // Add a toolbar button
          notebookTracker.widgetAdded.connect((tracker, panel) => {

            /** 将button和panel绑定起来 */
            addButtonWidgetToPanel(panel, settings)

            // 初始化panel完成后，执行自定义的初始化
            // 刷新后要重新初始化panel，将notebook设定为非chatting状态，将所有markdown的信息放入kernel中
            panel.sessionContext.ready.then(() => {
              initializePanel(panel)
            })
            // console.log('notechat: metadata state before: ', panel.model?.getMetadata('is_chatting'))
            // panel.model?.setMetadata('is_chatting', false)
            // tracker.currentWidget?.model?.setMetadata('is_chatting', false) //也不行
            // console.log('notechat: metadata state after: ', panel.model?.getMetadata('is_chatting'))
            /** 显示并不一致，不知道为什么panel.model中的metadata的is_chatting没有更新，
             * 但是panel.model?.metadata却是更新过的状态，而在chatCellData函数中操作后，
             * model又是可以正常更新的，感觉可能还是加载顺序的问题，*/
            // console.log('notechat: model', panel.model?.metadata)
            // console.log('notechat: model', panel.model)
          })

          /** Add command: chat cell data range with AI Assistant: Run All */
          addChatCellDataAllCommand(app, palette, notebookTracker, settings)

          /** Add command: chat cell data range with AI Assistant: Run All Above */
          addChatCellDataAboveCommand(app, palette, notebookTracker, settings)

          /** Add command: chat cell data range with AI Assistant: Run All Below */
          addChatCellDataBelowCommand(app, palette, notebookTracker, settings)

          /** Add command: chat cell data range with AI Assistant: Run All Selected */
          addChatCellDataSelectedCommand(app, palette, notebookTracker, settings)

          /** Add command: 展示cell的序号和唯一编号 */
          addShowCellRefCommand(app, palette, notebookTracker, settings)

          /** Add command: 添加帮助通知 */
          addHelpCommand(app, palette, notebookTracker, settings)

          /** Add command: 添加用户对话框 */
          addUserCellCommand(app, palette, notebookTracker, settings)

          /** 绑定函数：将cell执行的最新结果，放入kernel中，方便notebook代码使用 */
          NotebookActions.executed.connect((sender, args) => {
            sendOutputToKernel(notebookTracker, sender, args)
          })

        })
        .catch(reason => {
          console.error(
            'NoteChat: failed to load settings for jupyterlab-notechat.',
            reason
          )
        })
    }
  }
}

/** Add command: chat cell with AI Assistant */
function addChatCellDataCommand(
  app: JupyterFrontEnd,
  palette: ICommandPalette,
  notebookTracker: INotebookTracker,
  settings: ISettingRegistry.ISettings) {
    const command = 'jupyterlab-notechat:chat-cell-data'
    app.commands.addCommand(command, {
      label: 'Chat with AI Assistant',
      icon: atomIconNoteChat,
      execute: () => {
        const currentPanel = notebookTracker.currentWidget
        if (!currentPanel) {
          return
        }
        console.log(
          'NoteChat: command triggered settings: ',
          settings.composite
        )
        // 通过标识符获取按钮，使用类型断言
        const button = BUTTON_MAP.get(currentPanel)
        if (button && button.chatCellData) {
          console.log(
            'NoteChat: command triggered chatButton id: ',
            button.creationTimestamp
          )
          return button.chatCellData()
        }
      }
    })
    // Add command to the palette
    palette.addItem({ command, category: 'notechat' })
    // Add hotkeys: Alt + C
    app.commands.addKeyBinding({
      command,
      keys: ['Alt C'],
      selector: '.jp-Notebook'
    })
}

/** Add command: chat cell data range with AI Assistant: Run All */
function addChatCellDataAllCommand(
  app: JupyterFrontEnd,
  palette: ICommandPalette,
  notebookTracker: INotebookTracker,
  settings: ISettingRegistry.ISettings) {
    const command = 'jupyterlab-notechat:chat-cell-data-all'
    app.commands.addCommand(command, {
      label: 'Run All Cells with AI Assistant',
      icon: runAllIconNoteChat,
      execute: () => {
        const currentPanel = notebookTracker.currentWidget
        if (!currentPanel) {
          return
        }
        return chatCellDataRange(currentPanel, settings, null, null, null)
      }
    })
    // Add command to the palette
    palette.addItem({ command, category: 'notechat' })
    // Add hotkeys
    app.commands.addKeyBinding({
      command,
      keys: ['Alt R', 'Alt T'],
      selector: '.jp-Notebook'
    })
}

/** Add command: chat cell data range with AI Assistant: Run All Above */
function addChatCellDataAboveCommand(
  app: JupyterFrontEnd,
  palette: ICommandPalette,
  notebookTracker: INotebookTracker,
  settings: ISettingRegistry.ISettings) {
    const command = 'jupyterlab-notechat:chat-cell-data-above'
    app.commands.addCommand(command, {
      label: 'Run Above Cells with AI Assistant',
      icon: runAboveIconNoteChat,
      execute: () => {
        const currentPanel = notebookTracker.currentWidget
        if (!currentPanel) {
          return
        }
        const endIndex = currentPanel.content.activeCellIndex
        return chatCellDataRange(currentPanel, settings, null, endIndex, null)
      }
    })
    // Add command to the palette
    palette.addItem({ command, category: 'notechat' })
    // Add hotkeys
    app.commands.addKeyBinding({
      command,
      keys: ['Alt R', 'Alt B'],
      selector: '.jp-Notebook'
    })
}

/** Add command: chat cell data range with AI Assistant: Run All Below */
function addChatCellDataBelowCommand(
  app: JupyterFrontEnd,
  palette: ICommandPalette,
  notebookTracker: INotebookTracker,
  settings: ISettingRegistry.ISettings) {
    const command = 'jupyterlab-notechat:chat-cell-data-below'
    app.commands.addCommand(command, {
      label: 'Run Below Cells with AI Assistant',
      icon: runBelowIconNoteChat,
      execute: () => {
        const currentPanel = notebookTracker.currentWidget
        if (!currentPanel) {
          return
        }
        const startIndex = currentPanel.content.activeCellIndex
        return chatCellDataRange(currentPanel, settings, startIndex, null, null)
      }
    })
    // Add command to the palette
    palette.addItem({ command, category: 'notechat' })
    // Add hotkeys
    app.commands.addKeyBinding({
      command,
      keys: ['Alt R', 'Alt F'],
      selector: '.jp-Notebook'
    })
}

/** Add command: chat cell data range with AI Assistant: Run All Selected */
function addChatCellDataSelectedCommand(
  app: JupyterFrontEnd,
  palette: ICommandPalette,
  notebookTracker: INotebookTracker,
  settings: ISettingRegistry.ISettings) {
    const command = 'jupyterlab-notechat:chat-cell-data-selected'
    app.commands.addCommand(command, {
      label: 'Run Selected Cells with AI Assistant',
      icon: runSelectedIconNoteChat,
      execute: () => {
        const currentPanel = notebookTracker.currentWidget
        if (!currentPanel) {
          return
        }
        const selectedCellIdArr = []
        for (let i = 0; i < currentPanel.content.widgets.length; i++) {
          const cell = currentPanel.content.widgets[i]
          if (currentPanel.content.isSelectedOrActive(cell)) {
            selectedCellIdArr.push(i)
          }
        }
        console.log('NoteChat: selected cells index: ', selectedCellIdArr)
        if (selectedCellIdArr.length === 0) {
          return
        }
        return chatCellDataRange(currentPanel, settings, null, null, selectedCellIdArr)
      }
    })
    // Add command to the palette
    palette.addItem({ command, category: 'notechat' })
    // Add hotkeys: Alt + C
    app.commands.addKeyBinding({
      command,
      keys: ['Alt R', 'Alt S'],
      selector: '.jp-Notebook'
    })
}

/** Add command: Help Notification */
function addHelpCommand(
  app: JupyterFrontEnd,
  palette: ICommandPalette,
  notebookTracker: INotebookTracker,
  settings: ISettingRegistry.ISettings) {
    const command = 'jupyterlab-notechat:help'
    app.commands.addCommand(command, {
      label: 'Help: How to Use NoteChat',
      icon: helpIconNoteChat,
      execute: async () => {
        const currentPanel = notebookTracker.currentWidget
        if (!currentPanel) {
          return
        }

        let displayString = SETTINGS.HELP + '--------<br>参数解析<br>'

        const cellString = currentPanel.content.activeCell?.model.toJSON().source?.toString() ?? ''
        const lines = cellString.trim().split('\n')
        let params = await parseChatParams(lines[0] ?? '')
        let counts = 0
        let paramString = ''
        for (const key in params) {
          paramString += `${key}: ${params[key]}<br>`
          counts++
        }
        
        displayString = displayString + `一共${counts}个参数<br><br>`
        displayString = displayString + paramString + '<br><br>--------<br>ID参数解析<br>'

        const idArr = await parseCellReferences(params['ids'], currentPanel.content.activeCellIndex)

        displayString = displayString + `一共${idArr.length}个id<br><br>`
        displayString = displayString + idArr.join('<br>')
        
        displayString = displayString + '<br><br>--------<br>传入后端的cell<br>'
        
        const cellJsonArr = await getCellJsonArrById(currentPanel, idArr)

        for (let i = 0; i < cellJsonArr.length; i++) {
          displayString = displayString + cellJsonArr[i].id +' : ' + await processCellSourceString(cellJsonArr[i].source ?? '', [], [`${SETTINGS.REF_NAME} || ${SETTINGS.REF_NAME}s`]) + '<br>'
          console.log('NoteChat: cellJsonArr: ', cellJsonArr[i])
        }

        showCustomNotification(displayString, currentPanel, 2000)
        // showCustomNotification(SETTINGS.HELP, currentPanel, 2000)
      }
    })
    // Add command to the palette
    palette.addItem({ command, category: 'notechat' })
    // Add hotkeys: Alt + C
    app.commands.addKeyBinding({
      command,
      keys: ['Alt H'],
      selector: '.jp-Notebook'
    })
}

/** Add command: 添加用户对话框 */
function addUserCellCommand(
  app: JupyterFrontEnd,
  palette: ICommandPalette,
  notebookTracker: INotebookTracker,
  settings: ISettingRegistry.ISettings) {
    const command = 'jupyterlab-notechat:add-user-cell'
    app.commands.addCommand(command, {
      label: 'Add a User Chat Cell Below',
      icon: addUserCellIconNoteChat,
      execute: () => {
        const currentPanel = notebookTracker.currentWidget
        if (!currentPanel) {
          return
        }
        insertNewMdCellBelow(currentPanel, '', `${SETTINGS.USER_NAME}\n\n`, false, false)
      }
    })
    // Add command to the palette
    palette.addItem({ command, category: 'notechat' })
    // Add hotkeys: Alt + C
    app.commands.addKeyBinding({
      command,
      keys: ['Alt U'],
      selector: '.jp-Notebook'
    })
}

/** 将button和panel绑定起来 */
function addButtonWidgetToPanel(panel: NotebookPanel, settings: ISettingRegistry.ISettings) {
  let button = BUTTON_MAP.get(panel)
  if (button) {
    console.log(
      'NoteChat: chatButton already on toolbar, id: ',
      button.creationTimestamp
    )
    return
  }
  // 如果没有按钮，则创建一个
  button = new RotatingToolbarButton(panel, settings, {
    label: 'NoteChat',
    icon: atomIconNoteChat,
    iconClass: 'show-cell-ref',
    tooltip: 'Chat with AI Assistant'
  })
  // console.log('NoteChat: new chatButton CREATED, id: ', button.creationTimestamp)
  const toolbar = panel.toolbar
  toolbar.insertItem(11, 'chatButton', button)
  // 将 panel 与按钮关联
  BUTTON_MAP.set(panel, button)

  // console.log('NoteChat: panel and chatButton binding BUTTON_MAP size: ', BUTTON_MAP.size)

  // 监听 panel 的关闭或销毁事件，防止内存泄露
  panel.disposed.connect(() => {
    // 当 panel 被销毁时，从 Map 中移除它的引用
    BUTTON_MAP.delete(panel)
    console.log(
      'NoteChat: panel and chatButton binding BUTTON_MAP size: ',
      BUTTON_MAP.size
    )
  })
}

// 按钮定义，按钮维护转动和非转动状态，所以一般chatCellData都从按钮组件入口调用
class RotatingToolbarButton extends ToolbarButton {
  public readonly creationTimestamp: number
  private panel: NotebookPanel | null
  private settings: ISettingRegistry.ISettings | null

  constructor(
    panel: NotebookPanel,
    settings: ISettingRegistry.ISettings,
    ...args: any[]
  ) {
    super(...args)
    this.creationTimestamp = Date.now()
    this.panel = panel
    this.settings = settings
    this.node.addEventListener('click', this.handleClick)
  }

  // 点击事件
  handleClick = () => {
    console.log('NoteChat: chatButton ON CLICK, id: ', this.creationTimestamp)
    this.chatCellData()
  }

  // 开始旋转
  startRotation() {
    // console.log('NoteChat: chatButton START rotating, id: ', this.creationTimestamp)
    const iconElement = this.node.querySelector('[class*="icon"]')
    if (iconElement) {
      iconElement.classList.add('rotate', 'rotate-color')
    }
  }

  // 停止旋转
  stopRotation() {
    // console.log('NoteChat: chatButton STOP rotating, id: ', this.creationTimestamp)
    const iconElement = this.node.querySelector('[class*="icon"]')
    if (iconElement) {
      iconElement.classList.remove('rotate', 'rotate-color')
    }
  }

  // 封装chatCellData函数，加入一些设计UI前端界面的操作
  public chatCellData = async (): Promise<void> => {
    // 如果AI正忙，则弹框提示
    if (this.panel?.model?.getMetadata('is_chatting')) {
      showCustomNotification(
        'Please wait a moment, the AI Assistant is responding...',
        this.panel, 2000
      )
      return
    }

    // 开始和AI对话
    this.startRotation()
    await chatCellData(this.panel, this.settings)
    this.stopRotation()
  }
}

// 和AI对话的主逻辑，这里除了在notebook中插入生成的单元格外，较少进行button等UI界面逻辑的处理
const chatCellData = async (
  panel: NotebookPanel | null,
  userSettings: ISettingRegistry.ISettings | null
): Promise<void> => {
  if (!panel || !userSettings) {
    return
  }

  // 设置is_chatting状态，可以防止用户重复点击或重复执行命令
  panel?.model?.setMetadata('is_chatting', true)
  console.log(
    'NoteChat: START chatting, notebook is_chatting status: ',
    panel?.model?.getMetadata('is_chatting')
  )

  // 获取用户设置
  const numPrevCells = (userSettings.get('num_prev_cells').composite as number) || 2
  const userSettingsData = {
    prompt: (userSettings.get('prompt').composite as string) || SETTINGS.DEFAULT_PROMPT
  }

  // 获取提问单元格的id
  // 默认为当前活动单元格的id
  let activeCellIndex = panel.content.activeCellIndex
  // 向上寻找直到找到一个不是AI回复的单元格
  while (
    panel.content.widgets[activeCellIndex]?.model
      .toJSON().source?.toString().startsWith(SETTINGS.AI_NAME)
  ) {
    activeCellIndex = activeCellIndex - 1
    console.log(
      'NoteChat: this is an AI Assistant reply, jump to previous cell for question, previous id : ',
      activeCellIndex
    )
    panel.content.activeCellIndex = activeCellIndex
  }

  /** TODO: 用户添加/删除了单元格，index改变错位，需要额外的监听处理，比较复杂，对于常见用户不一定重要，暂时不处理 */

  // 首先获取上下文
  const cellContext = await getOrganizedCellContext(panel, numPrevCells)

  getCellJsonArrById(panel, [0,1])

  // 访问服务端
  const responseText = await getChatCompletions(cellContext, userSettingsData)

  // 激活activeCellIndex所在的单元格：因为用户可能在等待过程中，切换到了其他单元格
  panel.content.activeCellIndex = activeCellIndex

  // 如果下方单元格中如果是AI回复内容，则替换原内容，否则插入新单元格
  if (
    panel.content.widgets[activeCellIndex + 1]?.model
      .toJSON()
      .source?.toString()
      .startsWith(SETTINGS.AI_NAME)
  ) {
    // 下方单元格中含有AI_NAME，则替换原内容
    console.log(`NoteChat: replace below md cell content containing ${SETTINGS.AI_NAME}`)
    await replaceMdCellContentBelow(panel, responseText, `${SETTINGS.AI_NAME}\n\n`, true, true)
  } else {
    // 如果下方没有单元格或不含有AI回复标记，则插入新单元格
    await insertNewMdCellBelow(panel, responseText, `${SETTINGS.AI_NAME}\n\n`, true, true)
  }

  // 解锁is_chatting状态，用户可以继续提问
  panel?.model?.setMetadata('is_chatting', false)
  console.log(
    'NoteChat: END chatting, notebook is_chatting status: ',
    panel?.model?.getMetadata('is_chatting')
  )
}

// 定义解析对话中参数的函数，接收一段文本作为输入，返回一个键值对映射对象
const parseChatParams = async(
  input: string
  ): Promise<{ [key: string]: string }> => {
  
  // 初始化一个空对象来存储解析出的参数
  const params: { [key: string]: string } = {}

  // 使用正则表达式匹配参数模式

  // 以及不带值的 -param 或 --param 形式的参数
  // 在文本的开头和结尾添加一个空格
  // const modifiedText = ' ' + input.trim() + ' '
  // 正则表达式以匹配以空格开头的参数
  // const regex = /\s--?\w+.*?(?=\s--?\w+|$)/g
  // const matches = modifiedText.match(regex)

  // 改为用@来匹配，因为-很容易和数字中的负号以及id中的-连接符混淆
  const regex = /@(\w+)\s([^@]*)/g;

  // 使用正则表达式在提供的文本中查找匹配项
  const matches = input.trim().match(regex)

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
        params[key] = parts.slice(1).join(' ')
      }
    })
  }
  // 返回解析出的参数映射对象
  return params;
}

// 专门解析cellid列表的函数
const parseCellReferences = async (
  input: string,
  currentId: number
  ): Promise<(number | string)[]> => {
  
  // 如果输入为空，则返回空数组
  if (!input) {
      return [currentId];
  }
  // 移除输入字符串两端的包裹符号
  const trimmedInput = input.replace(/^\s*[\[\]【】{}()（）]\s*|\s*[\[\]【】{}()（）]\s*$/g, '');
  // 使用逗号、分号、空格等分隔符将字符串分割成多个token
  const tokens = trimmedInput.split(/[,，|；; ]+/);
  // Set元素不重复
  const ids: Set<number | string> = new Set();

  // 无论如何当前的id肯定是要加入到ids集合中的
  ids.add(currentId);

  tokens.forEach(token => {
      // 如果token包含引号，处理为唯一ID引用
      if (token.match(/['"“”‘’`]/)) {
          // 移除所有引号并去除首尾空格
          const uniqueId = token.replace(/['"“”‘’`]/g, '').trim();
          // 如果处理后的字符串非空，则添加到ids集合中
          if (uniqueId) {
              ids.add(uniqueId);
          }
      }
      // 处理单独的带有正负号的数字
      else if (token.match(/^[-+]\d+$/)) {
        // 将token转换为数字
        const offset = parseInt(token, 10);
        // 计算相对于currentId的绝对值
        const adjustedId = currentId + offset;
        // 将计算后的ID添加到ids集合中
        ids.add(adjustedId);
      } 
      // 如果token是一个纯数字或数字范围，处理为绝对数字ID引用
      else if (token.match(/^(\d+(:\d+)?|\d+)$/)) {
          // 分割起始和结束范围，并转换为数字，如果没有指定结束范围，则结束范围等于起始范围
          const [startStr, endStr] = token.split(/[:：~]/);
          const start = parseInt(startStr, 10);
          const end = endStr ? parseInt(endStr, 10) : start;
          // 将范围内的每个数字添加到ids集合中
          for (let i = start; i <= end; i++) {
              ids.add(i);
          }
      }
      // 如果token是一个带有正负号的范围，处理为相对数字ID引用
      else if (token.match(/^([-+]\d*[:：~]\d*|\d*[:：~][-+]\d*)$/)) {
          // 分割起始和结束范围，并转换为数字，缺省值为0
          const [startStr, endStr] = token.split(/[:：~]/);
          const start = startStr ? parseInt(startStr, 10) : 0;
          const end = endStr ? parseInt(endStr, 10) : 0;
          // 调整范围为绝对值，基于currentId计算
          const adjustedStart = currentId + start;
          const adjustedEnd = currentId + end;
          // 将调整后的范围内的每个数字添加到ids集合中
          for (let i = Math.min(adjustedStart, adjustedEnd); i <= Math.max(adjustedStart, adjustedEnd); i++) {
              ids.add(i);
          }
      }
      // 如果token既不包含引号，也不符合数字范围的模式，视为唯一ID
      else if (token.trim()) {
          // 去除首尾空格后添加到ids集合中
          ids.add(token.trim());
      }
  });

  // 返回去重并排序的结果
  return Array.from(ids).sort((a, b) => {
      // 如果两个元素都是数字，按数字大小排序
      if (typeof a === 'number' && typeof b === 'number') {
          return a - b;
      }
      // 如果两个元素都是字符串，按字典序排序
      if (typeof a === 'string' && typeof b === 'string') {
          return a.localeCompare(b);
      }
      // 如果一个是数字一个是字符串，数字排在前面
      return typeof a === 'number' ? -1 : 1;
  });
}

// 获取指定范围数值id的单元格的json数据
const getCellJsonArrById = async (
  panel: NotebookPanel | null,
  selectedCellIdArr: any[] | null = null
): Promise<any[]> => {
  if (!panel) {
    return []
  }
  const cellJsonArr = []
  for (let i = 0; i < panel.content.widgets.length; i++) {
    const cellJson = panel.content.widgets[i]?.model.toJSON()
    // 选择模式，只运行范围中选中的单元格，所以selectedArray不为空，且该id不在选择范围内，则跳过
    if (selectedCellIdArr && !selectedCellIdArr.includes(i) && !selectedCellIdArr.includes(cellJson.id)) {
      continue
    }

    /** 遍历每个 cellJson?.outputs?里的output，如果output中有data字段，且该data字段有"text/html"，则置为[] */
    if (Array.isArray(cellJson.outputs)) {
      for (let output of cellJson.outputs) {
        // 使用类型断言强制将 output 视为包含 data 属性的类型
        const outputWithData = output as { data: { [key: string]: any } };
    
        if (outputWithData.data) {
          // 获取所有键名
          const dataKeys = Object.keys(outputWithData.data);
    
          // 遍历每个键，删除不是 image/png、text/plain 或 image/jpeg 的键
          for (let key of dataKeys) {
            if (!SETTINGS.DATA_TYPES.includes(key)) {
              delete outputWithData.data[key];
            }
          }
        }
      }
    }
    cellJsonArr.push(cellJson)
  }
  return cellJsonArr
}

// 获取和整理单元格上下文
const getOrganizedCellContext = async (
  panel: NotebookPanel,
  numPrevCells: number
): Promise<string> => {
  let combinedOutput = ''
  const activeCellIndex = panel.content.activeCellIndex
  const startIndex = Math.max(0, activeCellIndex - numPrevCells)

  // 遍历每个单元格
  for (let i = startIndex; i <= activeCellIndex; i++) {
    // 单元格模型
    const cellModel = panel.content.widgets[i].model.toJSON()
    console.log('cell info: ', panel.content.widgets[i].model.toJSON())
    // 添加单元格头
    combinedOutput += `##########\nCell: ${i}`
    if (i === activeCellIndex) {
      combinedOutput += ' (Current Active Cell)'
    }
    combinedOutput += '\n##########\n\n'

    // 单元格Input文本
    let cellSourceText = cellModel.source?.toString() ?? ''
    cellSourceText = await processCellSourceString(
      cellSourceText, [], [`${SETTINGS.REF_NAME} || ${SETTINGS.REF_NAME}s`]
    )

    // 处理Markdown类型的单元格
    if (cellModel.cell_type === 'markdown') {
      combinedOutput += `Markdown:\n----------\n${cellSourceText.trim()}\n----------\n\n`
    }

    // 处理Raw类型的单元格
    if (cellModel.cell_type === 'raw') {
      combinedOutput += `Raw:\n----------\n${cellSourceText.trim()}\n----------\n\n`
    }

    // 处理Code类型的单元格
    if (cellModel.cell_type === 'code') {
      combinedOutput += `Code:\n\`\`\`python\n${cellSourceText.trim()}\n\`\`\`\n\n`

      // 处理输出
      const cellOutputs = cellModel.outputs // 获取单元格的outputs
      if (Array.isArray(cellOutputs) && cellOutputs.length > 0) {
        combinedOutput += 'Outputs:\n----------\n'

        for (const output of cellOutputs) {
          const typedOutput = output as IOutput // 使用类型断言
          switch (typedOutput.output_type) {
            case 'stream':
              {
                combinedOutput += `${
                  typedOutput.text?.toString().trim() ?? ''
                }\n----------\n`
              }
              break
            case 'execute_result':
              {
                const typedOutputData =
                  typedOutput.data as IExecuteResult['data']

                if (typedOutputData['text/html']) {
                  combinedOutput += `${
                    typedOutputData['text/html']?.toString().trim() ?? ''
                  }\n----------\n`
                } else {
                  combinedOutput += `${
                    typedOutputData['text/plain']?.toString().trim() ?? ''
                  }\n----------\n`
                }
              }
              break
            case 'error':
              {
                const cellErrorText = typedOutput.traceback?.toString() ?? ''
                combinedOutput += `Error: ${
                  typedOutput.ename
                } --- Error Value: ${typedOutput.evalue}\n${removeANSISequences(
                  cellErrorText
                )}\n----------\n`
              }
              break
            // display_data 跳过
          }
        }
        combinedOutput += '\n'
      }
    }
    combinedOutput += '\n'
  }

  console.log(combinedOutput)
  console.log(
    'NoteChat: context processed, notebook is_chatting status: ',
    panel?.model?.getMetadata('is_chatting')
  )
  return combinedOutput
}

// 访问服务器获取AI回复
const getChatCompletions = async (
  cellContext: string,
  userSettingsData: any
): Promise<string> => {
  const defaultSettings = {
    prompt: SETTINGS.DEFAULT_PROMPT,
    model: 'gpt-3.5-turbo',
    response_format: 'text',
    temperature: 0.5,
    timeout: 200,
    retries: 2,
    delay: 0.5
    // 其他可能的默认值...
  }
  // 现在 combinedSettings 包含了所有的设置，缺失的部分使用了默认值
  // 你可以在这里使用 combinedSettings
  const combinedSettings = { ...defaultSettings, ...userSettingsData }

  // 如果cellContext为null、undefined、空字符串''、数字0、或布尔值false时，不访问服务器，直接返回
  if (!cellContext) {
    return 'No context is provided to the assistant...'
  }

  try {
    // 构建请求体
    const requestBody = {
      messages: [
        {
          role: 'system',
          content: combinedSettings.prompt
        },
        {
          role: 'user',
          content: cellContext
        }
      ],
      model: combinedSettings.model,
      response_format: combinedSettings.response_format,
      temperature: combinedSettings.temperature,
      timeout: combinedSettings.timeout,
      retries: combinedSettings.retries,
      delay: combinedSettings.delay
    }

    // 服务端交互
    const serverSettings = ServerConnection.makeSettings({})
    const serverResponse = await ServerConnection.makeRequest(
      URLExt.join(serverSettings.baseUrl, '/jupyterlab-notechat/chat'),
      {
        method: 'POST',
        body: JSON.stringify(requestBody),
        headers: {
          'Content-Type': 'application/json'
        }
      },
      serverSettings
    )

    //服务端异常处理
    if (!serverResponse.ok) {
      console.error(
        'NoteChat: ERROR in sending data to the server: ',
        serverResponse.statusText
      )
      return 'Error in sending data to the server...'
    }
    const res = await serverResponse.json()
    console.log('NoteChat: server response:', res)
    return res.choices[0].message.content
  } catch (error) {
    console.error('NoteChat: ERROR in function getChatCompletions: ', error)
    return 'Error in function getChatCompletions...'
  }
}

// 在当前活动单元格下方插入新的Markdown单元格，并执行，这样AI回复界面更美观
const insertNewMdCellBelow = async (
  panel: NotebookPanel,
  newText: string,
  heading: string = '',
  ref: boolean = true,
  needRun: boolean = true
): Promise<void> => {
  NotebookActions.insertBelow(panel.content)
  // 新插入的单元格，要先从code转化为markdown
  const newCell = panel.content.activeCell
  if (newCell) {
    // 将单元格类型更改为 Markdown，必须先变更，变更类型的时候id会变
    if (newCell.model.type !== 'markdown') {
      NotebookActions.changeCellType(panel.content, 'markdown')
    }
    // 当cell type从code变为markdown时，id会变，所以需要重新获取
    const changedNewCell = panel.content.activeCell
    //如果ref为true，则tailing输出指定ref格式，否则为空
    const tailing = ref
      ? `\n\n<div style="text-align: right; color: lightgray; font-style: italic; font-size: x-small;">${SETTINGS.REF_NAME} || ${SETTINGS.REF_NAME}s["${changedNewCell?.model.toJSON()
          .id}"]</div>`
      : ''
    // 将单元格的source设置为指定的内容
    changedNewCell.model.sharedModel.setSource(heading + newText + tailing)
    // 运行单元格
    if (needRun) {
      await NotebookActions.run(panel.content, panel.sessionContext)
    }
  }
}

// 置换下方Markdown单元格，并执行，这样AI回复界面更美观
const replaceMdCellContentBelow = async (
  panel: NotebookPanel,
  newText: string,
  heading: string = '',
  ref: boolean = true,
  needRun: boolean = true
): Promise<void> => {
  NotebookActions.selectBelow(panel.content)
  // 置换单元格内容
  const belowCell = panel.content.activeCell
  if (belowCell) {
    // 将单元格类型更改为 Markdown，必须先变更，变更类型的时候id会变
    if (belowCell.model.type !== 'markdown') {
      NotebookActions.changeCellType(panel.content, 'markdown')
    }
    // 当cell type从code变为markdown时，id会变，所以需要重新获取
    const changedBelowCell = panel.content.activeCell
    //如果ref为true，则tailing输出指定ref格式，否则为空
    const tailing = ref
      ? `\n\n<div style="text-align: right; color: lightgray; font-style: italic; font-size: x-small;">${SETTINGS.REF_NAME} || ${SETTINGS.REF_NAME}s["${changedBelowCell?.model.toJSON()
          .id}"]</div>`
      : ''
    // 将单元格的source设置为指定的内容
    changedBelowCell.model.sharedModel.setSource(heading + newText + tailing)
    // 运行单元格
    if (needRun) {
      await NotebookActions.run(panel.content, panel.sessionContext)
    }
  }
}

// 移除ANSI转义序列
const removeANSISequences = (str: string): string => {
  // eslint-disable-next-line no-control-regex
  const ansiEscapeRegex = /\u001b\[[0-9;]*m/g
  return str.replace(ansiEscapeRegex, '')
}

// 处理 Markdown 单元格的字符串，根据指定的字符串数组移除首尾行
const processCellSourceString = async (
  cellString: string,
  removeHeadStringArr: string[] = [], // 默认为空数组
  removeTailStringArr: string[] = []  // 默认为空数组
): Promise<string> => {
  let lines = cellString.split('\n');

  // 如果第一行包含 removeHeadStringArr 中的任何字符串，则移除第一行
  if (lines.length > 0 && removeHeadStringArr.some(headString => lines[0].includes(headString))) {
    lines = lines.slice(1);
  }

  // 如果最后一行包含 removeTailStringArr 中的任何字符串，则移除最后一行
  if (lines.length > 0 && removeTailStringArr.some(tailString => lines[lines.length - 1].includes(tailString))) {
    lines = lines.slice(0, -1);
  }

  // 返回处理后的字符串
  return lines.join('\n').trim();
}

// 按照用户指定的cell id范围，运行之间所有的cell，自动识别需要AI Assistant的回复
const chatCellDataRange = async (
  panel: NotebookPanel | null,
  userSettings: ISettingRegistry.ISettings | null,
  startIndex: number | null,
  endIndex: number | null,
  selectedCellIdArr: number[] | null = null
): Promise<void> => {
  if (!panel || !userSettings) {
    return
  }

  showCustomNotification(
    'Start running cells with AI Assistant, please do not add or delete any cells during running...',
    panel, 2000
  )

  console.log('NoteChat: START run cells with chatting')
  const maxIndex = panel.content.widgets.length - 1
  startIndex = startIndex ?? 0
  // 如果所选的范围中，第一个单元格正好为AI回复，则向前移动一个
  const startCellSource = panel.content.widgets[startIndex]?.model.toJSON().source?.toString() ?? ''
  if (startCellSource.startsWith(SETTINGS.AI_NAME)) {
    startIndex = Math.max(startIndex - 1, 0)
  }
  endIndex = endIndex ?? maxIndex

  // 先找到需要运行的cell，然后再一个个运行，从后向前找更方便，这样有多个Assistant的回复，就可以顺利跳开
  const runCellTypes = []
  for (let i = endIndex; i >= startIndex; i--) {

    // 选择模式，只运行范围中选中的单元格，所以selectedArray不为空，且该id不在选择范围内，则跳过
    if (selectedCellIdArr && !selectedCellIdArr.includes(i)) {
      continue
    }

    const currentCellSource = panel.content.widgets[i]?.model.toJSON().source?.toString() ?? ''
    if (currentCellSource.startsWith(SETTINGS.AI_NAME)) {
      continue
    } else {
      const nextCellSource = panel.content.widgets[i + 1]?.model.toJSON().source?.toString() ?? ''
      if (currentCellSource.startsWith(SETTINGS.USER_NAME) || nextCellSource.startsWith(SETTINGS.AI_NAME)) {
        runCellTypes.push({ id: i, type: 'chat' })
      } else {
        runCellTypes.push({ id: i, type: 'normal' })
      }
    }
  }
  // 反转数组，从前向后运行
  runCellTypes.reverse()
  console.log('NoteChat: run all cells, id: ', runCellTypes)

  const button = BUTTON_MAP.get(panel)
  console.log(
    'NoteChat: run all cells triggered chatButton id: ',
    button.creationTimestamp
  )

  // 遍历数组，运行单元格
  for (const cell of runCellTypes) {
    if (cell.type === 'chat') {
      console.log('NoteChat: run cell with chatting, id: ', cell.id)
      panel.content.activeCellIndex = cell.id
      await NotebookActions.run(panel.content, panel.sessionContext)
      await button.chatCellData()
    } else {
      console.log('NoteChat: run cell normally, id: ', cell.id)
      panel.content.activeCellIndex = cell.id
      await NotebookActions.run(panel.content, panel.sessionContext)
    }
  }

  console.log('NoteChat: End run cells with chatting')
}

// 刷新后要重新初始化panel，将notebook设定为非chatting状态，将所有markdown的信息放入kernel中
const initializePanel = async (panel: NotebookPanel | null): Promise<void> => {
  // console.log('NoteChat: initialize panel id: ', panel.id)
  // 如果刷新后，还有chatting状态，则解锁
  if (panel?.model?.getMetadata('is_chatting')) {
    panel?.model?.setMetadata('is_chatting', false)
  }

  // 如果panel中没有单元格，则不需要初始化
  if (!panel || panel.content.widgets.length === 0) {
    return
  }

  // 初始化_refs作为一个空的dict变量
  const codes = [`${SETTINGS.REF_NAME}s = {}`]
  let lastRef = ''
  for (let i = 0; i < panel.content.widgets.length; i++) {
    const cell = panel.content.widgets[i]
    // console.log('NoteChat: initialize panel, cell id: ', cell.model.toJSON().id)

    // 读取所有markdown的信息至kernel中
    // if (cell.model.type === 'markdown') {
    const source = cell.model.toJSON().source?.toString() ?? ''
    const processedSource = await processCellSourceString(
      source, [SETTINGS.AI_NAME, SETTINGS.USER_NAME], [`${SETTINGS.REF_NAME} || ${SETTINGS.REF_NAME}s`]
    )
    codes.push(
      `${SETTINGS.REF_NAME}s["${cell.model.toJSON().id}"] = """${processedSource}"""`
    )
    lastRef = `${SETTINGS.REF_NAME} = """${processedSource}"""`
    // }
  }
  //如果lastRef不为空字符串，则加入codes中
  if (lastRef) {
    codes.push(lastRef)
  }

  // 执行代码
  panel.sessionContext.session?.kernel?.requestExecute({
    code: codes.join('\n')
  })
  // console.log('NoteChat: initialize panel, codes: ', codes.join('\n'))
  // console.log('NoteChat: initialize panel, length: ', panel.content.widgets.length)
}

/** Add command: 展示cell的序号和唯一编号 */
function addShowCellRefCommand(
  app: JupyterFrontEnd,
  palette: ICommandPalette,
  notebookTracker: INotebookTracker,
  settings: ISettingRegistry.ISettings) {
    const command = 'jupyterlab-notechat:show-cell-ref'
    app.commands.addCommand(command, {
      label: 'Show & Copy Cell ID for Ref',
      icon: infoIconNoteChat,
      iconClass: 'show-cell-ref',
      execute: () => {
        const currentPanel = notebookTracker.currentWidget
        if (!currentPanel) {
          return
        }
        return showCellRef(currentPanel)
      }
    })
    // Add command to the palette
    palette.addItem({ command, category: 'notechat' })
    // Add hotkeys: Alt + C
    app.commands.addKeyBinding({
      command,
      keys: ['Alt Q'],
      selector: '.jp-Notebook'
    })
}

// 显示当前活动单元格的序号和唯一id
const showCellRef = async (
  panel: NotebookPanel | null
): Promise<void> => {
  if (!panel) {
    return
  }
  const UniqueId = panel.content.activeCell?.model.toJSON().id
  const SequetialId = panel.content.activeCellIndex
  
  showCustomNotification(
    `Copied to Clipboard: Unique ID: ${UniqueId} || Sequetial ID: ${SequetialId}`,
    panel, 2000
  )

  if (navigator.clipboard) {
    navigator.clipboard.writeText(`_ref || _refs["${UniqueId}"] || ${SequetialId}`)
  }

}

async function sendOutputToKernel(
  notebookTracker: INotebookTracker,
  sender: NotebookActions,
  args: { notebook: Notebook; cell: Cell }) {

  const { notebook, cell } = args
  console.log(
    'NoteChat: executed cell & id: ',
    cell.model.toJSON().source?.toString(),
    '\nid: ',
    cell.model.toJSON().id
  )

  // 查找与 executedNotebook 匹配的 NotebookPanel
  const panel = notebookTracker.find(notebookPanel => {
    return notebookPanel.content === notebook
  })

  if (panel) {
    // 去掉含有AI_NAME或USER_NAME一整行的内容，因为包括了一些不必要的参数的信息
    const source = cell.model.toJSON().source?.toString() ?? ''
    const processedSource = await processCellSourceString(
      source, [SETTINGS.AI_NAME, SETTINGS.USER_NAME], [`${SETTINGS.REF_NAME} || ${SETTINGS.REF_NAME}s`]
    )
    panel.sessionContext.session?.kernel?.requestExecute({
      code: `${SETTINGS.REF_NAME} = """${processedSource}"""\n${SETTINGS.REF_NAME}s["${cell.model.toJSON().id}"] = """${processedSource}"""`
    })
  }
}


export default plugin
