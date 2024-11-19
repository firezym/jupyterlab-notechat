import { URLExt } from '@jupyterlab/coreutils'
import { ServerConnection } from '@jupyterlab/services'
import { NotebookPanel } from '@jupyterlab/notebook'
import { IOutput, IExecuteResult } from '@jupyterlab/nbformat'

import { SETTINGS, CHAT_PARAMS } from './globals'
import { removeANSISequences, processCellSourceString } from './utils'

/**
 * Call the API extension
 *
 * @param endPoint API REST end point for the extension
 * @param init Initial values for the request
 * @returns The response body interpreted as JSON
 */
export async function requestAPI<T>(endPoint = '', init: RequestInit = {}): Promise<T> {
  // Make request to Jupyter API
  const settings = ServerConnection.makeSettings()
  const requestUrl = URLExt.join(
    settings.baseUrl,
    'jupyterlab-notechat', // API Namespace
    endPoint
  )

  let response: Response
  try {
    response = await ServerConnection.makeRequest(requestUrl, init, settings)
  } catch (error) {
    throw new ServerConnection.NetworkError(error as any)
  }

  let data: any = await response.text()

  if (data.length > 0) {
    try {
      data = JSON.parse(data)
    } catch (error) {
      console.log('Not a JSON response body.', response)
    }
  }

  if (!response.ok) {
    throw new ServerConnection.ResponseError(response, data.message || data)
  }

  return data
}

// 访问服务器获取AI回复
// Access the server to get AI response
export const getChatCompletions = async (cellContext: string, userSettingsData: any): Promise<string> => {
  const defaultSettings = {
    prompt: CHAT_PARAMS.prompt,
    model: 'gpt-4o-mini',
    response_format: 'text',
    temperature: 0.6,
    timeout: 200,
    retries: 2,
    delay: 0.5
    // 其他可能的默认值...
    // other possible default values...
  }
  // 现在 combinedSettings 包含了所有的设置，缺失的部分使用了默认值
  // Now combinedSettings contains all settings, with missing parts using default values
  const combinedSettings = { ...defaultSettings, ...userSettingsData }

  // 如果cellContext为null、undefined、空字符串''、数字0、或布尔值false时，不访问服务器，直接返回
  // If cellContext is null, undefined, empty string '', number 0, or boolean false, do not access the server, return directly
  if (!cellContext) {
    return 'No context is provided to the assistant...'
  }

  try {
    // 构建请求体
    // Build the request body
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
    // Server interaction
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

    // 服务端异常处理
    // Server exception handling
    if (!serverResponse.ok) {
      console.error('NoteChat: ERROR in sending data to the server: ', serverResponse.statusText)
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

// 获取和整理单元格上下文
// Get and organize cell context
export const getOrganizedCellContext = async (panel: NotebookPanel, numPrevCells: number): Promise<string> => {
  let combinedOutput = ''
  const activeCellIndex = panel.content.activeCellIndex
  const startIndex = Math.max(0, activeCellIndex - numPrevCells)

  // 遍历每个单元格
  // Go through each cell
  for (let i = startIndex; i <= activeCellIndex; i++) {
    // 单元格模型
    // Cell model
    const cellModel = panel.content.widgets[i].model.toJSON()
    console.log('cell info: ', panel.content.widgets[i].model.toJSON())
    // 添加单元格头
    // Add cell header
    combinedOutput += `##########\nCell: ${i}`
    if (i === activeCellIndex) {
      combinedOutput += ' (Current Active Cell)'
    }
    combinedOutput += '\n##########\n\n'

    // 单元格Input文本
    // Cell Input text
    let cellSourceText = cellModel.source?.toString() ?? ''
    cellSourceText = await processCellSourceString(cellSourceText, [], [`${SETTINGS.ref_name} || ${SETTINGS.ref_name}s`])

    // 处理Markdown类型的单元格
    // Process Markdown type cells
    if (cellModel.cell_type === 'markdown') {
      combinedOutput += `Markdown:\n----------\n${cellSourceText.trim()}\n----------\n\n`
    }

    // 处理Raw类型的单元格
    // Process Raw type cells
    if (cellModel.cell_type === 'raw') {
      combinedOutput += `Raw:\n----------\n${cellSourceText.trim()}\n----------\n\n`
    }

    // 处理Code类型的单元格
    // Process Code type cells
    if (cellModel.cell_type === 'code') {
      combinedOutput += `Code:\n\`\`\`python\n${cellSourceText.trim()}\n\`\`\`\n\n`

      // 处理输出
      // Process output
      const cellOutputs = cellModel.outputs // 获取单元格的outputs | Get the outputs of the cell
      if (Array.isArray(cellOutputs) && cellOutputs.length > 0) {
        combinedOutput += 'Outputs:\n----------\n'

        for (const output of cellOutputs) {
          const typedOutput = output as IOutput // 使用类型断言 | Use type assertion
          switch (typedOutput.output_type) {
            case 'stream':
              {
                combinedOutput += `${typedOutput.text?.toString().trim() ?? ''}\n----------\n`
              }
              break
            case 'execute_result':
              {
                const typedOutputData = typedOutput.data as IExecuteResult['data']

                if (typedOutputData['text/html']) {
                  combinedOutput += `${typedOutputData['text/html']?.toString().trim() ?? ''}\n----------\n`
                } else {
                  combinedOutput += `${typedOutputData['text/plain']?.toString().trim() ?? ''}\n----------\n`
                }
              }
              break
            case 'error':
              {
                const cellErrorText = typedOutput.traceback?.toString() ?? ''
                combinedOutput += `Error: ${typedOutput.ename} --- Error Value: ${typedOutput.evalue}\n${removeANSISequences(cellErrorText)}\n----------\n`
              }
              break
            // display_data 跳过 | Skip display_data
          }
        }
        combinedOutput += '\n'
      }
    }
    combinedOutput += '\n'
  }

  console.log(combinedOutput)
  console.log('NoteChat: context processed, notebook is_chatting status: ', panel?.model?.getMetadata('is_chatting'))
  return combinedOutput
}
