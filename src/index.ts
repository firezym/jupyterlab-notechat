import { JupyterFrontEnd, JupyterFrontEndPlugin } from '@jupyterlab/application'

import { ISettingRegistry } from '@jupyterlab/settingregistry'

import { ICommandPalette, ToolbarButton } from '@jupyterlab/apputils'
import { URLExt } from '@jupyterlab/coreutils'
import { INotebookTracker, NotebookPanel, NotebookActions, Notebook } from '@jupyterlab/notebook'
import { Cell } from '@jupyterlab/cells'
import { ServerConnection } from '@jupyterlab/services'

import { SETTINGS, CHAT_PARAMS, HELP } from './globals'
import { showCustomNotification } from './notification'
import { processCellSourceString, parseChatParams, parseCellReferences, utf8ToBase64 } from './utils'
import { atomIconNoteChat, infoIconNoteChat, runAllIconNoteChat, runAboveIconNoteChat, runBelowIconNoteChat, runSelectedIconNoteChat, helpIconNoteChat, addUserCellIconNoteChat } from './icon'

/**
 * Initialization data for the jupyterlab-notechat extension.
 */

// 用于存储每个NotebookPanel对应的按钮，暂时这么解决
const BUTTON_MAP = new Map()

// 插件定义
const plugin: JupyterFrontEndPlugin<void> = {
  id: SETTINGS.plugin_id,
  description: 'Chat with an AI Assistant in the Notebook using OpenAI API',
  autoStart: true,
  requires: [ICommandPalette, INotebookTracker, ISettingRegistry],
  activate: (app: JupyterFrontEnd, palette: ICommandPalette, notebookTracker: INotebookTracker, settingRegistry: ISettingRegistry | null) => {
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
              console.log(`NoteChat: frontend refresh, session ready, initialize panel, panel id: ${panel.id}`)
              initializePanel(panel)
            })

            // 监听内核状态的变化，如果有restart，要重新initialize一下panel中参数的状态
            // 目前就restart的时候restarting有用，其他两个状态暂时没用 || status==='starting' || status==='autorestarting'
            panel.sessionContext.statusChanged.connect((_, status) => {
              if (status === 'restarting') {
                console.log(`NoteChat: kernel ${status}, re-initialize panel, panel id: ${panel.id}`)
                initializePanel(panel)
              }
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

          /** 绑定函数：将最新执行的cell的代码，放入kernel中的refs，方便notebook代码使用 */
          NotebookActions.executed.connect((sender, args) => {
            sendSourceToKernel(notebookTracker, sender, args)
          })
        })
        .catch(reason => {
          console.error('NoteChat: failed to load settings for jupyterlab-notechat.', reason)
        })
    }
  }
}

/** Add command: chat cell with AI Assistant */
function addChatCellDataCommand(app: JupyterFrontEnd, palette: ICommandPalette, notebookTracker: INotebookTracker, settings: ISettingRegistry.ISettings) {
  const command = 'jupyterlab-notechat:chat-cell-data'
  app.commands.addCommand(command, {
    label: 'Chat with AI Assistant',
    icon: atomIconNoteChat,
    execute: () => {
      const currentPanel = notebookTracker.currentWidget
      if (!currentPanel) {
        return
      }
      // console.log('NoteChat: command triggered settings: ', settings.composite)
      // 通过标识符获取按钮，使用类型断言
      const button = BUTTON_MAP.get(currentPanel)
      if (button && button.chatCellData) {
        console.log('NoteChat: command triggered chatButton id: ', button.creationTimestamp)
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
function addChatCellDataAllCommand(app: JupyterFrontEnd, palette: ICommandPalette, notebookTracker: INotebookTracker, settings: ISettingRegistry.ISettings) {
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
function addChatCellDataAboveCommand(app: JupyterFrontEnd, palette: ICommandPalette, notebookTracker: INotebookTracker, settings: ISettingRegistry.ISettings) {
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
function addChatCellDataBelowCommand(app: JupyterFrontEnd, palette: ICommandPalette, notebookTracker: INotebookTracker, settings: ISettingRegistry.ISettings) {
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
function addChatCellDataSelectedCommand(app: JupyterFrontEnd, palette: ICommandPalette, notebookTracker: INotebookTracker, settings: ISettingRegistry.ISettings) {
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
function addHelpCommand(app: JupyterFrontEnd, palette: ICommandPalette, notebookTracker: INotebookTracker, settings: ISettingRegistry.ISettings) {
  const command = 'jupyterlab-notechat:help'
  app.commands.addCommand(command, {
    label: 'Help: How to Use NoteChat',
    icon: helpIconNoteChat,
    execute: async () => {
      const currentPanel = notebookTracker.currentWidget
      if (!currentPanel) {
        return
      }

      const displayString = HELP + (await getCellParamInfo(currentPanel, settings))

      showCustomNotification(displayString, currentPanel, 2000)
      // showCustomNotification(HELP, currentPanel, 2000)
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
function addUserCellCommand(app: JupyterFrontEnd, palette: ICommandPalette, notebookTracker: INotebookTracker, settings: ISettingRegistry.ISettings) {
  const command = 'jupyterlab-notechat:add-user-cell'
  app.commands.addCommand(command, {
    label: 'Add a User Chat Cell Below',
    icon: addUserCellIconNoteChat,
    execute: () => {
      const currentPanel = notebookTracker.currentWidget
      if (!currentPanel) {
        return
      }
      insertNewMdCellBelow(currentPanel, '', `${SETTINGS.user_name}\n\n`, false, false)
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
    console.log('NoteChat: chatButton already on toolbar, id: ', button.creationTimestamp)
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
    console.log('NoteChat: panel and chatButton binding BUTTON_MAP size: ', BUTTON_MAP.size)
  })
}

// 按钮定义，按钮维护转动和非转动状态，所以一般chatCellData都从按钮组件入口调用
class RotatingToolbarButton extends ToolbarButton {
  public readonly creationTimestamp: number
  private panel: NotebookPanel | null
  private settings: ISettingRegistry.ISettings | null

  constructor(panel: NotebookPanel, settings: ISettingRegistry.ISettings, ...args: any[]) {
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
      showCustomNotification('Please wait a moment, the AI Assistant is responding...', this.panel, 2000)
      return
    }

    // 开始和AI对话
    this.startRotation()
    await chatCellData(this.panel, this.settings)
    this.stopRotation()
  }
}

// 和AI对话的主逻辑，这里除了在notebook中插入生成的单元格外，较少进行button等UI界面逻辑的处理
const chatCellData = async (panel: NotebookPanel | null, userSettings: ISettingRegistry.ISettings | null): Promise<void> => {
  if (!panel || !userSettings) {
    return
  }

  // 设置is_chatting状态，可以防止用户重复点击或重复执行命令
  panel?.model?.setMetadata('is_chatting', true)
  console.log('NoteChat: START chatting, notebook is_chatting status: ', panel?.model?.getMetadata('is_chatting'))

  // 初始化一个空对象来存储解析出的参数
  const userSettingParams: { [key: string]: any } = { ...SETTINGS, ...CHAT_PARAMS }
  // 获取用户设置: ??在需要0、false、""是一个要被识别有效值，所以bool值一定要用??，而prompt可以为空，所以用??
  const numPrevCells = (userSettings.get('num_prev_cells').composite as number) ?? SETTINGS.num_prev_cells
  userSettingParams['num_prev_cells'] = numPrevCells
  userSettingParams['prompt'] = (userSettings.get('prompt').composite as string) ?? CHAT_PARAMS.prompt
  userSettingParams['model'] = (userSettings.get('model').composite as string) || CHAT_PARAMS.model
  userSettingParams['vision_model'] = (userSettings.get('vision_model').composite as string) || CHAT_PARAMS.vision_model
  userSettingParams['use_vision'] = (userSettings.get('use_vision').composite as boolean) ?? CHAT_PARAMS.use_vision
  userSettingParams['max_input'] = (userSettings.get('max_input').composite as number) || CHAT_PARAMS.max_input
  userSettingParams['max_output'] = (userSettings.get('max_output').composite as number) || CHAT_PARAMS.max_output
  userSettingParams['temperature'] = (userSettings.get('temperature').composite as number) ?? CHAT_PARAMS.temperature
  userSettingParams['openai_api_key'] = (userSettings.get('openai_api_key').composite as string) || CHAT_PARAMS.openai_api_key

  const notebookParams = panel?.model?.getMetadata('notechat') ?? {}

  // 获取提问单元格的id
  // 默认为当前活动单元格的id
  let activeCellIndex = panel.content.activeCellIndex
  const maxIndex = panel.content.widgets.length - 1
  let first_line = panel.content.activeCell?.model.toJSON().source?.toString().trim().split('\n')[0] ?? ''
  let aiParamString = ''
  let userParamString = ''
  // 向上寻找直到找到一个不是AI回复的单元格
  while (first_line.startsWith(SETTINGS.ai_name)) {
    // 解析AI单元格所设定的@param
    aiParamString = first_line.trim()
    activeCellIndex = activeCellIndex - 1
    console.log('NoteChat: this is an AI Assistant reply, jump to previous cell for question, previous id : ', activeCellIndex)
    panel.content.activeCellIndex = activeCellIndex
    first_line = panel.content.activeCell?.model.toJSON().source?.toString().trim().split('\n')[0] ?? ''
  }

  // 循环判定结束后，first_line肯定不是AI的回复了，判断下是不是user的回复
  // if (first_line.startsWith(SETTINGS.user_name)) {
  userParamString = first_line.trim()
  const aiCellParams = await parseChatParams(aiParamString)
  const userCellParams = await parseChatParams(userParamString)

  // 将userParams中的参数覆盖到aiParams，再覆盖到userSettingParams
  const cellParams = { ...userSettingParams, ...notebookParams, ...aiCellParams, ...userCellParams }
  cellParams['active_cell_index'] = activeCellIndex

  // 获取参数指定的上下文id列表
  const refs = await parseCellReferences(cellParams[SETTINGS.cell_param_name_refs], activeCellIndex, maxIndex, cellParams['num_prev_cells'])

  // 获取id相应的cell json列表
  const cellJsonArr = await getCellJsonArrById(panel, refs)

  /** TO DO: 用户添加/删除了单元格，index改变错位，需要额外的监听处理，比较复杂，对于常见用户不一定重要，暂时不处理 */

  // 访问服务端
  const responseText = await getChatCompletions(cellJsonArr, cellParams)

  // 激活activeCellIndex所在的单元格：因为用户可能在等待过程中，切换到了其他单元格
  panel.content.activeCellIndex = activeCellIndex

  // 如果下方单元格中如果是AI回复内容，则替换原内容，否则插入新单元格
  if (panel.content.widgets[activeCellIndex + 1]?.model.toJSON().source?.toString().startsWith(SETTINGS.ai_name)) {
    // 下方单元格中含有AI_NAME，则替换原内容
    console.log(`NoteChat: replace below md cell content containing ${SETTINGS.ai_name}`)
    // 如果ai param有过定义不为空，则还原，如果未定义则不带任何参数
    if (aiParamString) {
      await replaceMdCellContentBelow(panel, responseText, `${aiParamString}\n\n`, true, true)
    } else {
      await replaceMdCellContentBelow(panel, responseText, `${SETTINGS.ai_name}\n\n`, true, true)
    }
  } else {
    // 如果下方没有单元格或不含有AI回复标记，则插入新单元格
    await insertNewMdCellBelow(panel, responseText, `${SETTINGS.ai_name}\n\n`, true, true)
  }

  // 解锁is_chatting状态，用户可以继续提问
  panel?.model?.setMetadata('is_chatting', false)
  console.log('NoteChat: END chatting, notebook is_chatting status: ', panel?.model?.getMetadata('is_chatting'))
}

// 获取指定范围数值id的单元格的json数据
const getCellJsonArrById = async (panel: NotebookPanel | null, cellRefs: any[] | null = null): Promise<any[]> => {
  if (!panel) {
    return []
  }
  const cellJsonArr = []
  for (let i = 0; i < panel.content.widgets.length; i++) {
    const cellJson = panel.content.widgets[i]?.model.toJSON()
    // 选择模式，只运行范围中选中的单元格，所以selectedArray不为空，且该id不在选择范围内，则跳过
    if (cellRefs && !cellRefs.includes(i) && !cellRefs.includes(cellJson.id)) {
      continue
    }
    cellJson['num_id'] = i
    /** 遍历每个 cellJson?.outputs?里的output，如果output中有data字段，且该data字段有"text/html"，则置为[] */
    if (Array.isArray(cellJson.outputs)) {
      for (const output of cellJson.outputs) {
        // 使用类型断言强制将 output 视为包含 data 属性的类型
        const outputWithData = output as { data: { [key: string]: any } }

        if (outputWithData.data) {
          // 获取所有键名
          const dataKeys = Object.keys(outputWithData.data)

          // 遍历每个键，删除不是 image/png、text/plain 或 image/jpeg 的键
          for (const key of dataKeys) {
            if (!SETTINGS.data_types.includes(key)) {
              delete outputWithData.data[key]
            }
          }
        }
      }
    }
    cellJsonArr.push(cellJson)
  }
  // console.log('NoteChat: cellJsonArr: ', cellJsonArr)
  return cellJsonArr
}

// 访问服务器获取AI回复
const getChatCompletions = async (cellJsonArr: any[], cellParams: any): Promise<string> => {
  // 如果cellContext为null、undefined、空字符串''、数字0、或布尔值false时，不访问服务器，直接返回
  if (!cellJsonArr) {
    return 'No context is provided to the assistant...'
  }

  try {
    // 构建请求体
    const requestBody = {
      cell_json_arr: cellJsonArr,
      ...cellParams
    }

    // console.log('NoteChat: request body: ', JSON.stringify(requestBody))

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
      console.error('NoteChat: ERROR in sending data to the server: ', serverResponse.statusText)
      return 'Error in sending data to the server...'
    }
    const res = await serverResponse.json()
    console.log('NoteChat: get server response:', res)

    // 正常结果
    try {
      return res.choices[0].message.content
    } catch (error) {
      // 非正常结果
      return JSON.stringify(res)
    }
  } catch (error) {
    console.error('NoteChat: ERROR in function getChatCompletions: ', error)
    return 'Error in function getChatCompletions...'
  }
}

// 在当前活动单元格下方插入新的Markdown单元格，并执行，这样AI回复界面更美观
const insertNewMdCellBelow = async (panel: NotebookPanel, newText: string, heading: string = '', ref: boolean = true, needRun: boolean = true): Promise<void> => {
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
    const tailing = ref ? `\n\n<div style="text-align: right; color: lightgray; font-style: italic; font-size: x-small;">${SETTINGS.ref_name} || ${SETTINGS.ref_name}s["${changedNewCell?.model.toJSON().id}"]</div>` : ''
    // 将单元格的source设置为指定的内容
    changedNewCell.model.sharedModel.setSource(heading + newText + tailing)
    // 运行单元格
    if (needRun) {
      await NotebookActions.run(panel.content, panel.sessionContext)
    }
  }
}

// 置换下方Markdown单元格，并执行，这样AI回复界面更美观
const replaceMdCellContentBelow = async (panel: NotebookPanel, newText: string, heading: string = '', ref: boolean = true, needRun: boolean = true): Promise<void> => {
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
    const tailing = ref ? `\n\n<div style="text-align: right; color: lightgray; font-style: italic; font-size: x-small;">${SETTINGS.ref_name} || ${SETTINGS.ref_name}s["${changedBelowCell?.model.toJSON().id}"]</div>` : ''
    // 将单元格的source设置为指定的内容
    changedBelowCell.model.sharedModel.setSource(heading + newText + tailing)
    // 运行单元格
    if (needRun) {
      await NotebookActions.run(panel.content, panel.sessionContext)
    }
  }
}

// 按照用户指定的cell id范围，运行之间所有的cell，自动识别需要AI Assistant的回复
const chatCellDataRange = async (panel: NotebookPanel | null, userSettings: ISettingRegistry.ISettings | null, startIndex: number | null, endIndex: number | null, selectedCellIdArr: number[] | null = null): Promise<void> => {
  if (!panel || !userSettings) {
    return
  }

  showCustomNotification('Start running cells with AI Assistant, please do not add or delete any cells during running...', panel, 2000)

  console.log('NoteChat: START run cells with chatting')
  const maxIndex = panel.content.widgets.length - 1
  startIndex = startIndex ?? 0
  // 如果所选的范围中，第一个单元格正好为AI回复，则向前移动一个
  const startCellSource = panel.content.widgets[startIndex]?.model.toJSON().source?.toString() ?? ''
  if (startCellSource.startsWith(SETTINGS.ai_name)) {
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
    if (currentCellSource.startsWith(SETTINGS.ai_name)) {
      continue
    } else {
      const nextCellSource = panel.content.widgets[i + 1]?.model.toJSON().source?.toString() ?? ''
      if (currentCellSource.startsWith(SETTINGS.user_name) || nextCellSource.startsWith(SETTINGS.ai_name)) {
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
  console.log('NoteChat: run all cells triggered chatButton id: ', button.creationTimestamp)

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
  const codes = ['import base64', `${SETTINGS.ref_name}s = {}`]
  let lastRef = ''
  for (let i = 0; i < panel.content.widgets.length; i++) {
    const cell = panel.content.widgets[i]
    // console.log('NoteChat: initialize panel, cell id: ', cell.model.toJSON().id)

    // 读取所有markdown的信息至kernel中
    // if (cell.model.type === 'markdown') {
    const source = cell.model.toJSON().source?.toString() ?? ''
    const processedSource = await processCellSourceString(source, [SETTINGS.ai_name, SETTINGS.user_name], [`${SETTINGS.ref_name} || ${SETTINGS.ref_name}s`])
    const encodedSource = utf8ToBase64(processedSource)
    codes.push(`${SETTINGS.ref_name}s["${cell.model.toJSON().id}"] = base64.b64decode("${encodedSource}").decode('utf-8')`)
    lastRef = `${SETTINGS.ref_name} = base64.b64decode("${encodedSource}").decode('utf-8')`
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
function addShowCellRefCommand(app: JupyterFrontEnd, palette: ICommandPalette, notebookTracker: INotebookTracker, settings: ISettingRegistry.ISettings) {
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
      return showCellRef(currentPanel, settings)
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

// 获得活动单元格的参数和引用id的文字描述
const getCellParamInfo = async (panel: NotebookPanel | null, userSettings: ISettingRegistry.ISettings | null): Promise<string> => {
  if (!panel || !userSettings) {
    return ''
  }

  // 初始化一个空对象来存储解析出的参数
  const userSettingParams: { [key: string]: any } = { ...SETTINGS, ...CHAT_PARAMS }
  // 获取用户设置
  const numPrevCells = (userSettings.get('num_prev_cells').composite as number) || SETTINGS.num_prev_cells
  userSettingParams['num_prev_cells'] = numPrevCells

  let displayString = '--------<br>参数解析：'

  const cellString = panel.content.activeCell?.model.toJSON().source?.toString() ?? ''
  const lines = cellString.trim().split('\n')
  const parsedParams = await parseChatParams(lines[0] ?? '')

  const notebookParams = panel?.model?.getMetadata('notechat') ?? {}

  const cellParams = { ...userSettingParams, ...notebookParams, ...parsedParams }

  let counts = 0
  let paramString = ''

  for (const key in parsedParams) {
    paramString += `${key}: ${parsedParams[key]} || `
    counts++
  }

  displayString = displayString + `一共${counts}个参数：|| `
  displayString = displayString + paramString + `<br>--------<br>ID引用解析：当前id ${panel.content.activeCellIndex}，`

  const refs = await parseCellReferences(cellParams[SETTINGS.cell_param_name_refs], panel.content.activeCellIndex, panel.content.widgets.length - 1, cellParams['num_prev_cells'])
  displayString = displayString + `一共${refs.length}个id：|| `
  displayString = displayString + refs.join(', ') + ' ||'

  return displayString
}

// 显示当前活动单元格的序号和唯一id
const showCellRef = async (panel: NotebookPanel | null, userSettings: ISettingRegistry.ISettings | null): Promise<void> => {
  if (!panel || !userSettings) {
    return
  }
  const UniqueId = panel.content.activeCell?.model.toJSON().id
  const SequetialId = panel.content.activeCellIndex

  const dispalyString = `Copied to Clipboard: Unique ID: ${UniqueId} || Sequetial ID: ${SequetialId} <br>` + (await getCellParamInfo(panel, userSettings))

  showCustomNotification(dispalyString, panel, 2000)

  // console.log('NoteChat: notebook metadata: ', panel?.model?.getMetadata('notechat'))

  if (navigator.clipboard) {
    navigator.clipboard.writeText(`_ref || _refs["${UniqueId}"] || ${SequetialId}`)
  }
}

async function sendSourceToKernel(notebookTracker: INotebookTracker, sender: NotebookActions, args: { notebook: Notebook; cell: Cell }) {
  const { notebook, cell } = args
  console.log('NoteChat: executed cell & id: ', cell.model.toJSON().source?.toString(), '\nid: ', cell.model.toJSON().id)

  // 查找与 executedNotebook 匹配的 NotebookPanel
  const panel = notebookTracker.find(notebookPanel => {
    return notebookPanel.content === notebook
  })

  const codes = []
  if (panel) {
    // 去掉含有AI_NAME或USER_NAME一整行的内容，因为包括了一些不必要的参数的信息
    const source = cell.model.toJSON().source?.toString() ?? ''
    const processedSource = await processCellSourceString(source, [SETTINGS.ai_name, SETTINGS.user_name], [`${SETTINGS.ref_name} || ${SETTINGS.ref_name}s`])
    const encodedSource = utf8ToBase64(processedSource)
    codes.push(`${SETTINGS.ref_name}s["${cell.model.toJSON().id}"] = base64.b64decode("${encodedSource}").decode('utf-8')`)
    codes.push(`${SETTINGS.ref_name} = base64.b64decode("${encodedSource}").decode('utf-8')`)
    panel.sessionContext.session?.kernel?.requestExecute({
      code: codes.join('\n')
    })
  }
}

export default plugin
