// 定义全局变量

// 该参数主要和JupyterLab设置有关
export const SETTINGS = {
    'plugin_id': 'jupyterlab-notechat:plugin',
    'ai_name': '**assistant**',
    'user_name': '**user**',
    'cell_param_name_refs': 'refs',
    'ref_name': '_ref',
    'num_prev_cells': 2,
    'help': "How to Use NoteChat<br><br>",
    'data_types': ['text/plain', 'image/png', 'image/jpeg']
}

// 该参数主要和AI模型有关
export const CHAT_PARAMS = {
    'prompt': "You are a helpful assistant, especially good at coding and quantitative analysis. You have a good background knowledge in AI, technology, finance, economics, statistics and related fields. Now you are helping the user under a JupyterLab notebook coding environment (format: *.ipynb). You will receive the source codes and outputs of the currently active cell and several preceding cells as your context. Please try to answer the user's questions or solve problems presented in the active cell. Please use simplified Chinese as your primary language to respond :) Switch to English at anytime when it's necessary, or more helpful for understanding and analysis, or instructed to do so.",
    'model': 'gpt-4-1106-preview',
    'vision_model': 'gpt-4-vision-preview',
    'response_format': 'text',
    'temperature': 0.5,
    'timeout': 200,
    'retries': 2,
    'delay': 0.5
}