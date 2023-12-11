import {
  JupyterFrontEnd,
  JupyterFrontEndPlugin
} from '@jupyterlab/application';

import { ISettingRegistry } from '@jupyterlab/settingregistry';

import { requestAPI } from './handler';

import { ToolbarButton } from '@jupyterlab/apputils';
import { URLExt } from '@jupyterlab/coreutils';
import { DocumentRegistry } from '@jupyterlab/docregistry';
import {
  NotebookPanel,
  INotebookModel,
  NotebookActions
} from '@jupyterlab/notebook';
import { IOutput, IExecuteResult } from '@jupyterlab/nbformat';
import { ServerConnection } from '@jupyterlab/services';
import { IDisposable } from '@lumino/disposable';

/**
 * Initialization data for the jupyterlab-notechat extension.
 */
const plugin: JupyterFrontEndPlugin<void> = {
  id: 'jupyterlab-notechat:plugin',
  description: 'Chat with an AI Assistant in the Notebook using OpenAI API',
  autoStart: true,
  requires: [ISettingRegistry],
  activate: (
    app: JupyterFrontEnd,
    settingRegistry: ISettingRegistry | null
  ) => {
    console.log('JupyterLab extension jupyterlab-notechat is activated!');

    if (settingRegistry) {
      settingRegistry
        .load(plugin.id)
        .then(settings => {
          console.log(
            'jupyterlab-notechat settings loaded:',
            settings.composite
          );
          app.docRegistry.addWidgetExtension(
            'Notebook',
            new ChatButtonExtension(settings)
          );
        })
        .catch(reason => {
          console.error(
            'Failed to load settings for jupyterlab-notechat.',
            reason
          );
        });
    }

    requestAPI<any>('get-example')
      .then(data => {
        console.log(data);
      })
      .catch(reason => {
        console.error(
          `The jupyterlab-notechat server extension appears to be missing.\n${reason}`
        );
      });
  }
};

class ChatButtonExtension
  implements DocumentRegistry.IWidgetExtension<NotebookPanel, INotebookModel>
{
  private settings: ISettingRegistry.ISettings;
  constructor(settings: ISettingRegistry.ISettings) {
    this.settings = settings;
  }
  createNew(
    panel: NotebookPanel,
    context: DocumentRegistry.IContext<INotebookModel>
  ): IDisposable {
    const chatButton = new ToolbarButton({
      label: 'Chat',
      // onClick: () => this.sendActiveCellData(panel)
      // onClick: () => this.sendContextCellData(panel)
      // onClick: () => this.getOrganizedCellContext(panel)
      onClick: () => this.chatCellData(panel)
    });
    panel.toolbar.insertItem(11, 'chatButton', chatButton);
    // panel.toolbar.addItem('chatButton', chatButton);
    // panel.toolbar.insertAfter('mybutton', 'chatButton', chatButton);
    return chatButton;
  }

  async getOrganizedCellContext(panel: NotebookPanel): Promise<string> {
    // const turndownService = new TurndownService();
    let combinedOutput = '';
    const activeCellIndex = panel.content.activeCellIndex;
    const startIndex = Math.max(0, activeCellIndex - 2);

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
                    // combinedOutput += `${turndownService.turndown(typedOutputData['text/html']?.toString() ?? '')}\n`;
                    // combinedOutput += `${this.htmlTableToMarkdown(typedOutputData['text/html']?.toString().trim() ?? '')}\n----------\n`;
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
                  }\n${this.removeANSISequences(cellErrorText)}\n----------\n`;
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
    return combinedOutput;
  }

  // 修改后的 chatCellData 函数
  async chatCellData(panel: NotebookPanel): Promise<void> {
    try {
      // 调用 getOrganizedCellContext 获取单元格上下文
      const cellContext = await this.getOrganizedCellContext(panel);

      // 构建请求体
      const requestBody = {
        messages: [
          {
            role: 'system',
            content: this.settings.get('prompt').composite as string
          },
          {
            role: 'user',
            content: cellContext
          }
        ],
        model: 'gpt-3.5-turbo',
        response_format: 'text',
        temperature: 0.5,
        timeout: 200,
        retries: 2,
        delay: 0.5
      };

      // 服务端交互

      const settings = ServerConnection.makeSettings({});
      const serverResponse = await ServerConnection.makeRequest(
        URLExt.join(settings.baseUrl, '/jupyterlab-notechat/chat'),
        {
          method: 'POST',
          body: JSON.stringify(requestBody),
          headers: {
            'Content-Type': 'application/json'
          }
        },
        settings
      );

      if (!serverResponse.ok) {
        console.error(
          'Error sending data to the server:',
          serverResponse.statusText
        );
        return;
      }

      const res = await serverResponse.json();
      console.log('Server response:', res);

      this.insertNewCellBelow(panel, res.choices[0].message.content);
      // this.insertNewCellBelow(panel, cellContext.substring(0, 100));
    } catch (error) {
      console.error('Error in chatCellData:', error);
    }
  }

  // 新增函数：在当前选中的单元格下方插入一个新的单元格
  private insertNewCellBelow(panel: NotebookPanel, newText: string): void {
    NotebookActions.insertBelow(panel.content);
    // 如果需要，可以进一步自定义新插入的单元格
    const newCell = panel.content.activeCell;
    if (newCell) {
      newCell.model.sharedModel.setSource('**AI Assistant:**\n\n' + newText); // 将单元格的source设置为指定的内容
      NotebookActions.changeCellType(panel.content, 'markdown'); // 将单元格类型更改为 Markdown
      NotebookActions.run(panel.content, panel.sessionContext); // 运行单元格
    }
  }

  // 将获取当前cell之前的2个cell的input和output
  async sendContextCellData(panel: NotebookPanel): Promise<void> {
    const activeCell = panel.content.activeCell;
    const activeCellIndex = panel.content.activeCellIndex;
    const totalCellCount = panel.content.widgets.length;
    // 获取统计信息
    console.log('==========');
    console.log(
      'Cell Counts: ',
      totalCellCount,
      ' ... Current Active Cell:',
      activeCellIndex
    );
    console.log('----------');

    // 获取当前active cell之前的2个cell的source和output，打印出来
    const startIndex = Math.max(0, activeCellIndex - 2);
    // 遍历从开始索引到活动单元格的单元格
    for (let i = startIndex; i < activeCellIndex; i++) {
      const targetCell = panel.content.widgets[i];
      const cellSource = targetCell.model.toJSON().source; // 获取单元格的source
      const cellOutputs = targetCell.model.toJSON().outputs; // 获取单元格的outputs

      console.log(`Cell ${i} Content:\n`, cellSource);
      console.log(`Cell ${i} Output:\n`, cellOutputs);
      console.log('~~~~~~~~~~');
    }

    // 获取当前cell的input和output内容
    const cellSource = activeCell?.model.toJSON().source;
    console.log('Current Cell Content:\n', cellSource);
    const cellOutputs = activeCell?.model.toJSON().outputs;
    console.log('Current Cell Output:\n', cellOutputs);
    console.log('==========');
  }

  //获得当前激活单元格的信息
  async sendActiveCellData(panel: NotebookPanel): Promise<void> {
    const activeCell = panel.content.activeCell;
    const cellContent = activeCell?.model.toJSON().source;
    // 将内容转换为单个字符串（如果它是一个数组）
    const cellText = Array.isArray(cellContent)
      ? cellContent.join('\n')
      : cellContent;

    if (!cellText || !this.isValidJson(cellText)) {
      console.error('No valid JSON content in the active cell');
      return;
    }
    console.log('Server response:', cellText);
    const settings = ServerConnection.makeSettings({});
    const serverResponse = await ServerConnection.makeRequest(
      URLExt.join(settings.baseUrl, '/jupyterlab-notechat/chat'),
      {
        method: 'POST',
        body: cellText,
        headers: {
          'Content-Type': 'application/json'
        }
      },
      settings
    );

    if (!serverResponse.ok) {
      console.error(
        'Error sending data to the server:',
        serverResponse.statusText
      );
      return;
    }

    const res = await serverResponse.json();
    console.log('Server response:', res);
  }

  private isValidJson(str: string): boolean {
    try {
      JSON.parse(str);
      return true;
    } catch (e) {
      return false;
    }
  }

  private removeANSISequences(tracebackText: string): string {
    // eslint-disable-next-line no-control-regex
    const ansiEscapeRegex = /\u001b\[[0-9;]*m/g;
    return tracebackText.replace(ansiEscapeRegex, '');
  }
}

export default plugin;
