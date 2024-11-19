// 定义全局变量
// Define global variables

// 该参数主要和JupyterLab设置有关
// This parameter is mainly related to JupyterLab settings
export const SETTINGS = {
  plugin_id: 'jupyterlab-notechat:plugin',
  ai_name: '**assistant**',
  user_name: '**user**',
  cell_param_name_refs: 'refs',
  ref_name: '_ref',
  num_prev_cells: 20,
  data_types: ['text/plain', 'image/png', 'image/jpeg', 'image/gif', 'image/webp']
}

// 该参数主要和AI模型有关
// This parameter is mainly related to the AI model
export const CHAT_PARAMS = {
  prompt: 'You are a helpful and warm-hearted assistant:) You have a good background knowledge in AI, STEM, finance, economics, statistics and related fields. Now you are helping the user to develop code, analyze data or write a report under a JupyterLab notebook environment (format: *.ipynb). If the user does not provide explicit questions, you can try to solve problems presented in the context and elaborate further on relevant topics.',
  model: 'gpt-4o',
  vision_model: 'gpt-4o',
  use_vision: true,
  max_input: 80000,
  max_output: 0,
  temperature: 0.6,
  response_format: 'text',
  timeout: 200,
  retries: 2,
  delay: 0.5,
  openai_api_key: 'None',
  moonshot_api_key: 'None'
}

// 动态加载说明配置文件
// Load help configuration file dynamically
let help_intro = ''
let help_usage = ''
let help_param = ''
let help_refs = ''
let help_files = ''
let help_cell_span = ''
let help_prompt = ''
let help_model = ''
let help_nb_param = ''
let help_tabulate = ''
let help_run = ''
let help_source = ''
let help_info = ''

// 检测浏览器或JupyterLab的语言环境
// Detect the language environment of the browser or JupyterLab
const language = navigator.language || 'en'

if (language.startsWith('zh')) {
  // 加载中文说明配置文件
  // Load the Chinese help configuration file
  help_intro = '<a href="https://github.com/firezym/jupyterlab-notechat" target="_blank" style="background-color: yellow; font-weight: bold; font-size: 16px; color: blue; text-decoration: underline;"> NoteChat 帮助 || 点击前往GitHub项目页面（更易读）</a> <br><br> Notechat工具初衷是让用户有更精准可控的对话，包括不仅局限于精确指定上下文引用、修改AI生成的文本作为上下文、在程序中直接引用用户和AI生成的文本等等，使得用户更好利用LLM的长处，所以除了常见的对话外（虽然使用体验不及对话流），还可以辅助书写结构化的中长篇报告、文本对比分析、获取和沉淀知识、辅助编程创建分析模型等任务。 <br><br>'
  help_usage = '1. 创建用户消息：直接新建单元格输入你的问题，或使用`Add a User Chat Cell`指令或点击对应的菜单或单元格按钮添加一个以**user**形式开头的markdown单元格，能够更明确这是用户创建的一个对话消息 <br><br>'
  help_param = '2. 参数设定：在cell的第一行中添加以`@参数 xxx`形式的自定义参数赋值，但请勿在其中使用转义换行符，主要参数及示例如下： <br>'
  help_refs = '【@refs】 指定当前单元格和AI对话所引用的其他单元格，使得上下文更加精准，比如书写长报告过程中，每个章节只需要看到一开始拟定的提纲，而无需看到其他小节的内容，以下示例的除指定范围引用和alone模式外，引用的赋值一般以并集形式叠加，举例： <br> @refs -8, +2，2 be73e0fc-6e1c-4d49-a288-94e3f7ec8215 # 将引用当前消息之前的第8个、之后的第2个、从0开始正数第2个以及唯一id为“be...15”的单元格，分隔符可以是,，|；; ，如果指定的id中没有含有中英文冒号:：及~类型的范围引用，则还会附加默认参数中指定数量的上下文，可在settings中更改 # <br> @refs alone -8, +2 # 如果指定了alone、single、和sole的字样，则代表忽略默认附加的范围引用，仅使用当前单元格中指定的单个或范围引用，如果仅有alone则代表只看当前单元格 # <br> @refs -10:0 # 引用当前消息之前的8个单元格内容，[]中英文方括号可加可不加 # <br> @refs :+2 ‘xxxxxx’ # 引用文档起始至当前单元格下方第2个单元格之前的所有内容以及唯一id为xxxxxx的单元格 # <br> @refs 【2:8】 # 如果范围未带任何+-号，则代表是文档的绝对id顺序中的第2个到第8个 #  <br>'
  help_files = '【@files file_path/file_name】 可以进行跨多个文件全文引用，请避免包含空格等容易产生混淆的字符，`@`字符已经过特殊处理路径中可包含，目前支持的类型包括文本类txt/md/py/js/ts/sh/bat/json/xml/log/config/ini/yaml/yml、表格类csv/xlsx/xls、文档类pdf/docx/pptx/html/htm，其中出了ipynb文件可以包含图片，其他文件解析尚未包含图片 <br>'
  help_cell_span = '【@num_prev_cells 8】 在当前单元格对话中覆盖系统设定的向前引用范围至8 <br>'
  help_prompt = '【@prompt xyz】 用xyz替换系统默认的prompt提示词，请勿使用换行符 <br> 【@add_prompt xyz】 将xyz添加到系统默认的prompt后组合成为新的提示词 <br>'
  help_model = '【@model o1-preview】 指定的LLM模型为gpt-4o-mini方便低价测试初步想法，请查看openai官网获取模型信息，默认@model gpt-4o，也支持@model moonshot-v1-32k （也支持8k、128k） <br> 【@use_vison false】 不使用图片视觉模型，默认使用true，可以在markdown单元格中直接粘贴截图或图片，但图片地址目前不支持 <br>【@max_input/@max_output 888】 设定input和output最大的token数量，这里超过max_input就会按照绝对id的原始顺序截断，但prompt和当前单元格优先保留，但图片tokens数量目前未支持计入 <br> 【@temperature 0.5】 0~1直接设定LLM模型生成的随机性 <br> 【@timeout 600】 设定模型最长响应时间 <br>'
  help_nb_param = '【单个notebook级别参数设定】 如果要保证可复现性，可以在notebook右上角的Property Inspector（齿轮图标）-> ADVANCED TOOLS -> Notebook metadata 中，加入`"notechat":{"param":value}`来覆盖参数，比如设定notebook级别的prompt，注意这里的param不用加@，覆盖优先级为user>assistant>notebook>settings <br><br>'
  help_tabulate = '3. 表格识别：目前没有很好的处理html的工具，推荐使用pandas处理数据，并尽量用df.to_markdown()转化成为markdown表格格式，LLM能更好处理识别 <br><br>'
  help_run = '4. 支持从上到下顺序运行python code cell和LLM支持的user及assistant的对话流：方便长流程工作，比如自动化更新带数据带LLM总结分析的报告 <br><br>'
  help_source = '5. 程序文本和LLM文本交互：markdown单元格和code单元格的source文本，都可以在当前kernel程序中直接按照_refs["唯一id"]形式引用，方便用户利用python和LLM之间做文本交互输入输出 <br><br>'
  help_info = '6. Info、Help按键和指令：获得当前单元格xxxxxx字符串形式的唯一id以及从0开始计数的绝对id，当前单元格所要引用的id，@param的个性化参数等信息，其中点击时，当前单元格的唯一id引用将会拷贝到粘贴板中方便用户引用，跨notebook的请直接用python程序按照json数据读取.ipynb文件，从中找到唯一id所对应的单元格信息 <br><br>'
} else {
  // 加载英文说明配置文件
  // Load the English help configuration file
  help_intro = '<a href="https://github.com/firezym/jupyterlab-notechat" target="_blank" style="background-color: yellow; font-weight: bold; font-size: 16px; color: blue; text-decoration: underline;"> NoteChat Help || Go to GitHub Repo (Easier to Read) </a> <br><br> The original intention of the NoteChat tool is to allow users to have more precise and controllable conversations, including but not limited to precisely specifying context references, modifying AI-generated text as context, directly referencing python cell code/outputs and AI-generated texts in the program reciprocally, etc., so that users can better utilize the strengths of LLMs. Therefore, besides common conversations (although the user experience is not as good as dialogue flow), it can also assist in text manipulation of LLM dialogue flow within markdown or code cells, writing structured essay or long reports, data and text analysis with LLM models, assisting programming, acquiring LLM knowledge to notebookand, and other tasks. <br><br>'
  help_usage = '1. Create a user message: Directly create a new cell to input your question, or use the `Add a User Chat Cell` command, or click the corresponding menu or cell button to add a markdown cell starting with **user**, which can more clearly indicate that this is a dialogue message created by the user. <br><br>'
  help_param = '2. Parameter settings: Add custom parameter assignments in the form of `@parameter xxx` on the first line of the cell, but do not use escaped newline characters in it. The main parameters and examples are as follows: <br>'
  help_refs = '【@refs】 Specify other cells that the current cell and AI conversation refer to, making the context more precise. For example, during the writing of a long report, each chapter only needs to see the initial outline, without needing to see the content of other sections. In the following examples, except for specified range references and the "alone" mode, the references are generally overlaid in a union. For example: <br> @refs -8, +2, 2 be73e0fc-6e1c-4d49-a288-94e3f7ec8215 # Will reference the 8th cell before the current message, the 2nd cell after it, the 2nd cell counting from zero, and the cell with unique ID "be...15". The separators can be ,, | ; ;. If the specified IDs do not contain range references of colon : or ~ type, the default number of context specified in settings will also be added. # <br> @refs alone -8, +2 # If words like alone, single, and sole are specified, it means ignoring the default additional range references and only using the single or range references specified in the current cell. If only "alone" is present, it means only looking at the current cell. # <br> @refs -10:0 # Reference the contents of the 8 cells before the current message. Reference the contents of the 8 cells before the current message. [] brackets around the range can be added optionally such as @refs [-10:0] for better readability. # <br> @refs :+2 \'xxxxxx\' # Reference all content from the beginning of the document up to the second cell below the current cell, as well as the cell with unique ID \'xxxxxx\'. # <br> @refs 【2:8】 # If the range does not have any + or -, it represents the 2nd to the 8th cells in the absolute ID order of the document. # <br>'
  help_files = '【@files file_path/file_name】 Can perform full-text references across multiple files. Please avoid characters like spaces that can easily cause confusion. The `@` character has been specially processed and can be included in the path. Currently supported types include text types like txt/md/py/js/ts/sh/bat/json/xml/log/config/ini/yaml/yml, spreadsheet types like csv/xlsx/xls, document types like pdf/docx/pptx/html/htm. Among these, except for ipynb files which can include images, other file parsing does not yet include images. <br>'
  help_cell_span = "【@num_prev_cells 8】 In the current cell's conversation, override the system's default forward reference range to 8. <br>"
  help_prompt = "【@prompt xyz】 Use xyz to replace the system's default prompt; please do not use newline characters. <br> 【@add_prompt xyz】 Add xyz to the system's default prompt to form a new prompt. <br>"
  help_model = '【@model o1-preview】 Specify the LLM model as gpt-4o-mini to conveniently test initial ideas at low cost. Please check the OpenAI official website for model information. The default is @model gpt-4o, and also supports @model moonshot-v1-32k (also supports 8k, 128k). <br> 【@use_vison false】 Do not use the image vision model; the default is true. You can directly paste screenshots or images into markdown cells, but image URLs are not currently supported. <br>【@max_input/@max_output 888】 Set the maximum token number of input and output. If it exceeds max_input here, it will be truncated according to the original order of absolute IDs, but the prompt and current cell are preferentially retained. Currently, the token count of images is not yet supported. <br> 【@temperature 0.5】 Set the randomness of the LLM model directly between 0~1. <br> 【@timeout 600】 Set the maximum response time of the model. <br>'
  help_nb_param = '【Single notebook-level parameter settings】 To ensure reproducibility, you can add `"notechat":{"param":value}` in the Notebook metadata via the Property Inspector (gear icon) in the top right corner of the notebook under ADVANCED TOOLS to override parameters, such as setting the notebook-level prompt. Note that the param here does not need to add @. The override priority is user > assistant > notebook > settings. <br><br>'
  help_tabulate = '3. Table recognition: Currently, there are no good tools to handle HTML. It is recommended to use pandas to process data and try to convert it into markdown table format using df.to_markdown(), which LLM can better recognize and process. <br><br>'
  help_run = '4. Supports running python code cells and LLM-supported user and assistant dialogue flows in sequence from top to bottom: Convenient for long-process work, such as automatically updating reports with data and LLM summary analysis. <br><br>'
  help_source = '5. Interaction between python kernel and LLM messages: The source text of markdown cells and code cells can be directly referenced in the current kernel program in the form of _refs["unique id"], facilitating users to perform text input and output interactions between python kernel and LLM messages. <br><br>'
  help_info = '6. Info, help buttons and commands: Obtain the unique id of the current cell in the form of a string xxxxxx and the absolute id counting from 0, the ids that the current cell wants to reference, personalized parameters of @param, and other information. When clicked, the unique id reference of the current cell will be copied to the clipboard for user reference. For cross-notebook use, please directly use a Python program to read the .ipynb file as JSON data to find the cell information corresponding to the unique id. <br><br>'
}

// 拼接所有帮助内容
// Concatenate all help content
export const HELP = `${help_intro}${help_usage}${help_param}${help_refs}${help_files}${help_cell_span}${help_prompt}${help_model}${help_nb_param}${help_tabulate}${help_run}${help_source}${help_info}`
