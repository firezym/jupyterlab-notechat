// 定义全局变量

// 该参数主要和JupyterLab设置有关
export const SETTINGS = {
  plugin_id: 'jupyterlab-notechat:plugin',
  ai_name: '**assistant**',
  user_name: '**user**',
  cell_param_name_refs: 'refs',
  ref_name: '_ref',
  num_prev_cells: 2,
  help: 'How to Use NoteChat<br><br>',
  data_types: ['text/plain', 'image/png', 'image/jpeg', 'image/gif', 'image/webp']
}

// 该参数主要和AI模型有关
export const CHAT_PARAMS = {
  prompt: "You are a helpful and warm-hearted assistant:) You have a good background knowledge in AI, STEM, finance, economics, statistics and related fields. Now you are helping the user to develop code, analyze data or write a report under a JupyterLab notebook environment (format: *.ipynb). If the user does not provide explicit questions, you can try to solve problems presented in the context and elaborate further on relevant topics.",
  model: 'gpt-4-1106-preview',
  vision_model: 'gpt-4-vision-preview',
  use_vision: true,
  max_input: 80000,
  max_output: 4096,
  temperature: 0.5,
  response_format: 'text',
  timeout: 200,
  retries: 2,
  delay: 0.5,
  openai_api_key: 'None'
}
