import { URLExt } from '@jupyterlab/coreutils'
import { ServerConnection } from '@jupyterlab/services'
import { NotebookPanel } from '@jupyterlab/notebook'
import { IOutput, IExecuteResult } from '@jupyterlab/nbformat'

import { SETTINGS } from './globals'
import { removeANSISequences, processCellSourceString } from  './utils'

/**
 * Call the API extension
 *
 * @param endPoint API REST end point for the extension
 * @param init Initial values for the request
 * @returns The response body interpreted as JSON
 */
export async function requestAPI<T>(
  endPoint = '',
  init: RequestInit = {}
): Promise<T> {
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
export const getChatCompletions = async (
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


// 获取和整理单元格上下文
export const getOrganizedCellContext = async (
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