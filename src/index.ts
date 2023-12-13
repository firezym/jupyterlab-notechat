import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { ICommandPalette, ToolbarButton } from '@jupyterlab/apputils';
import { URLExt } from '@jupyterlab/coreutils';
import {
  INotebookTracker,
  NotebookPanel,
  NotebookActions
} from '@jupyterlab/notebook';
import { IOutput, IExecuteResult } from '@jupyterlab/nbformat';
import { ServerConnection } from '@jupyterlab/services';
import { reactIcon } from '@jupyterlab/ui-components'

/**
 * Initialization data for the jupyterlab-notechat extension.
 */

const DEFAULT_PROMPT = "You are a helpful assistant, especially good at coding and quantitative analysis. You have a good background knowledge in AI, technology, finance, economics, statistics and related fields. Now you are helping the user under a JupyterLab notebook coding environment (format: *.ipynb). You will receive the source codes and outputs of the currently active cell and several preceding cells as your context. Please try to answer the user's questions or solve problems presented in the active cell. Please use simplified Chinese as your primary language to respond :) Switch to English at anytime when it's necessary, or more helpful for understanding and analysis, or instructed to do so.";

const PLUGIN_ID = 'jupyterlab-notechat:plugin';

// 用于存储每个NotebookPanel对应的按钮，暂时这么解决
const BUTTON_MAP = new Map();


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
    console.log('JupyterLab extension jupyterlab-notechat is activated!');

    if (settingRegistry) {
      settingRegistry
        .load(plugin.id)
        .then(settings => {
          console.log('jupyterlab-notechat settings loaded:', settings.composite);

          // Add an application command
          const command: string = 'jupyterlab-notechat:chat-cell-data';
          app.commands.addCommand(command, {
            label: 'Chat with AI Assistant',
            icon: reactIcon,
            execute: () => {
              const currentPanel = notebookTracker.currentWidget;
              if (!currentPanel) {
                return;
              }
              console.log('Command Triggered ChatCellData: settings:', settings.composite);
              // 通过标识符获取按钮，使用类型断言
              const button = BUTTON_MAP.get(currentPanel);
              if (button && button.chatCellData) {
                console.log('Command Triggered Button: ', button);
                return button.chatCellData();
              }
            }
          });
          // Add command to the palette
          palette.addItem({ command, category: 'notechat' });
          // Add hotkeys: Alt + C
          app.commands.addKeyBinding({
            command,
            keys: [`Alt C`],
            selector: '.jp-Notebook'
          })

          // Add a toolbar button
          notebookTracker.widgetAdded.connect((tracker, panel) => {
            let button: RotatingToolbarButton | undefined;
            const toolbar = panel.toolbar;
            if (button) {
              console.log('notechat: chatbutton already on toolbar')
              return
            }
            console.log('notechat: adding chatbutton')
            button = new RotatingToolbarButton(
              panel,
              settings,
              {
                label: 'ChatAI',
                icon: reactIcon,
              }
            )
            toolbar.insertItem(11, 'chatButton', button)
            // 将 panel 与按钮关联
            BUTTON_MAP.set(panel, button);

            console.log('BUTTON_MAP:', BUTTON_MAP);

            // 监听 panel 的关闭或销毁事件，防止内存泄露
            panel.disposed.connect(() => {
              // 当 panel 被销毁时，从 Map 中移除它的引用
              BUTTON_MAP.delete(panel);
              console.log('BUTTON_MAP:', BUTTON_MAP);
            });
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

        })
        .catch(reason => {
          console.error(
            'Failed to load settings for jupyterlab-notechat.',
            reason
          );
        });
    }

  }
};


// 按钮定义，按钮维护转动和非转动状态，所以一般chatCellData都从按钮组件入口调用
class RotatingToolbarButton extends ToolbarButton {

  public readonly creationTimestamp: number;
  private panel: NotebookPanel | null;
  private settings: ISettingRegistry.ISettings | null;

  constructor(
    panel: NotebookPanel, 
    settings: ISettingRegistry.ISettings,
    ...args: any[]) {
      super(...args);
      this.creationTimestamp = Date.now();
      this.panel = panel;
      this.settings = settings;
      this.node.addEventListener('click', this.handleClick);
  }

  // 点击事件
  handleClick = () => {
    console.log('RotatingToolbarButton onClick Event, Creation ID:', this.creationTimestamp);
    this.chatCellData();
  }

  // 开始旋转
  startRotation() {
    console.log('Inner Chat Button Start Rotation:', this.creationTimestamp);
    const iconElement = this.node.querySelector('[class*="icon"]');
    if (iconElement) {
      iconElement.classList.add('rotate');
    }
  }

  // 停止旋转
  stopRotation() {
    console.log('Inner Chat Button Stop Rotation:', this.creationTimestamp);
    const iconElement = this.node.querySelector('[class*="icon"]');
    if (iconElement) {
      iconElement.classList.remove('rotate');
    }
  }

  // 封装chatCellData函数，加入一些设计UI前端界面的操作
  public chatCellData = async (): Promise<void> => {

    // 如果AI正忙，则弹框提示
    if (this.panel?.model?.getMetadata('is_chatting')) {
      showCustomNotification('Please wait a moment, the AI Assistant is responding...', this.panel);
      return;
    }

    // 开始和AI对话
    this.startRotation();
    chatCellData(this.panel, this.settings).then(() => {
      this.stopRotation();
    });

  }
}

// 和AI对话的主逻辑，这里除了在notebook中插入生成的单元格外，较少进行button等UI界面逻辑的处理
const chatCellData = async (
  panel: NotebookPanel | null,
  userSettings: ISettingRegistry.ISettings | null
  ): Promise<void> => {

    if (!panel || !userSettings) {
      return;
    }

    // 设置is_chatting状态，可以防止用户重复点击或重复执行命令
    panel?.model?.setMetadata('is_chatting', true);
    console.log('Start ChatCellData Function, metadata is_chatting: ', panel?.model?.getMetadata('is_chatting'));

    // 获取用户设置
    const numPrevCells = userSettings.get('num_prev_cells').composite as number || 2;
    const userSettingsData = {
      prompt: userSettings.get('prompt').composite as string || DEFAULT_PROMPT
    };

    // 获取提问单元格的id
    const activeCellIndex = panel.content.activeCellIndex;
    // TODO: 用户添加/删除了单元格，activeCellIndex错位，则需要额外的监听处理
    
    // 首先获取上下文
    const cellContext = await getOrganizedCellContext(panel, numPrevCells);

    // 访问服务端
    const responseText = await getChatCompletions(cellContext, userSettingsData);

    // 激活activeCellIndex所在的单元格：因为用户可能在等待过程中，切换到了其他单元格
    panel.content.activeCellIndex = activeCellIndex;
    
    // 在激活单元格下方插入新单元格
    await insertNewMdCellBelow(panel, responseText, '**AI Assistant:**\n\n', true);
    
    // 解锁is_chatting状态，用户可以继续提问
    panel?.model?.setMetadata('is_chatting', false);
    console.log('End ChatCellData Function, metadata is_chatting: ', panel?.model?.getMetadata('is_chatting'));
}



// 获取和整理单元格上下文
const getOrganizedCellContext = async (panel: NotebookPanel, numPrevCells: number): Promise<string> => {

  let combinedOutput = '';
  const activeCellIndex = panel.content.activeCellIndex;
  const startIndex = Math.max(0, activeCellIndex - numPrevCells);

  // 遍历每个单元格
  for (let i = startIndex; i <= activeCellIndex; i++) {
    // 单元格模型
    const cellModel = panel.content.widgets[i].model.toJSON();

    // 添加单元格头
    combinedOutput += `##########\nCell: ${i}`;
    if (i === activeCellIndex) {
      combinedOutput += ' (Current Active Cell)';
    }
    combinedOutput += '\n##########\n\n';

    // 单元格Input文本
    const cellSourceText = cellModel.source?.toString() ?? '';

    // 处理Markdown类型的单元格
    if (cellModel.cell_type === 'markdown') {
      combinedOutput += `Markdown:\n----------\n${cellSourceText.trim()}\n----------\n\n`;
    }

    // 处理Raw类型的单元格
    if (cellModel.cell_type === 'raw') {
      combinedOutput += `Raw:\n----------\n${cellSourceText.trim()}\n----------\n\n`;
    }

    // 处理Code类型的单元格
    if (cellModel.cell_type === 'code') {
      combinedOutput += `Code:\n\`\`\`python\n${cellSourceText.trim()}\n\`\`\`\n\n`;

      // 处理输出
      const cellOutputs = cellModel.outputs; // 获取单元格的outputs
      if (Array.isArray(cellOutputs) && cellOutputs.length > 0) {
        combinedOutput += 'Outputs:\n----------\n';

        for (const output of cellOutputs) {
          const typedOutput = output as IOutput; // 使用类型断言
          switch (typedOutput.output_type) {
            case 'stream':
              {
                combinedOutput += `${
                  typedOutput.text?.toString().trim() ?? ''
                }\n----------\n`;
              }
              break;
            case 'execute_result':
              {
                const typedOutputData =
                  typedOutput.data as IExecuteResult['data'];

                if (typedOutputData['text/html']) {
                  combinedOutput += `${
                    typedOutputData['text/html']?.toString().trim() ?? ''
                  }\n----------\n`;
                } else {
                  combinedOutput += `${
                    typedOutputData['text/plain']?.toString().trim() ?? ''
                  }\n----------\n`;
                }
              }
              break;
            case 'error':
              {
                const cellErrorText = typedOutput.traceback?.toString() ?? '';
                combinedOutput += `Error: ${
                  typedOutput.ename
                } --- Error Value: ${
                  typedOutput.evalue
                }\n${removeANSISequences(cellErrorText)}\n----------\n`;
              }
              break;
            // display_data 跳过
          }
        }
        combinedOutput += '\n';
      }
    }
    combinedOutput += '\n';
  }

  console.log(combinedOutput);
  console.log('Middle ChatCellData getOrganizedCellContext Function, metadata is_chatting: ', panel?.model?.getMetadata('is_chatting'));
  return combinedOutput;
}


// 访问服务器获取AI回复
const getChatCompletions = async (
  cellContext: string,
  userSettingsData: any
  ): Promise<string> => {

    const defaultSettings = {
      prompt: DEFAULT_PROMPT,
      model: 'gpt-3.5-turbo',
      response_format: 'text',
      temperature: 0.5,
      timeout: 200,
      retries: 2,
      delay: 0.5,
      // 其他可能的默认值...
    };
    // 现在 combinedSettings 包含了所有的设置，缺失的部分使用了默认值
    // 你可以在这里使用 combinedSettings
    const combinedSettings = { ...defaultSettings, ...userSettingsData };

    // 如果cellContext为null、undefined、空字符串''、数字0、或布尔值false时，不访问服务器，直接返回
    if (!cellContext){
      return 'No context is provided to the assistant...';
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
      };
  
      // 服务端交互
      const serverSettings = ServerConnection.makeSettings({});
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
      );

      //服务端异常处理
      if (!serverResponse.ok) {
        console.error('Error in sending data to the server:', serverResponse.statusText);
        return 'Error in sending data to the server...';
      }
      const res = await serverResponse.json();
      console.log('Server response:', res);
      return res.choices[0].message.content;
  
    } catch (error) {
      console.error('Error in chatCellData:', error);
      return 'Error in chatCellData...';
    }

}


// 在当前活动单元格下方插入新的Markdown单元格，并执行，这样AI回复界面更美观
const insertNewMdCellBelow = async (
  panel: NotebookPanel,
  newText: string,
  heading: string = '',
  needRun: boolean = true
  ): Promise<void> => {
  NotebookActions.insertBelow(panel.content);
  // 如果需要，可以进一步自定义新插入的单元格
  const newCell = panel.content.activeCell;
  if (newCell) {
    newCell.model.sharedModel.setSource(heading + newText); // 将单元格的source设置为指定的内容
    NotebookActions.changeCellType(panel.content, 'markdown'); // 将单元格类型更改为 Markdown
    if (needRun) NotebookActions.run(panel.content, panel.sessionContext); // 运行单元格
  }
}


// 移除ANSI转义序列
const removeANSISequences = (str: string): string => {
  // eslint-disable-next-line no-control-regex
  const ansiEscapeRegex = /\u001b\[[0-9;]*m/g;
  return str.replace(ansiEscapeRegex, '');
}


// 自定义弹出通知界面，在toolbar的下方弹出
const showCustomNotification = async (
  message: string,
  panel: NotebookPanel
  ): Promise<void> => {
  
  // 假设 `panel` 是当前的 NotebookPanel 实例
  const toolbar = panel.toolbar.node; 
  const toolbarRect = toolbar.getBoundingClientRect();

  const notification = document.createElement('div');
  notification.className = 'notification';
  notification.textContent = message;
  // 设置在工具栏底部
  notification.style.top = `${toolbarRect.bottom}px`;

  document.body.appendChild(notification);

  // 设置点击通知本身，通知即消失
  notification.onclick = () => {
    if (document.body.contains(notification)) {
      document.body.removeChild(notification);
    }
  };

  setTimeout(() => {
    if (document.body.contains(notification)) {
      document.body.removeChild(notification);
    }
  }, 2000); // 2秒后自动关闭
}


export default plugin;
