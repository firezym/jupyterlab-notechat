import json, os, re, logging, copy
import httpx, asyncio, tiktoken


from jupyter_server.base.handlers import APIHandler
from jupyter_server.utils import url_path_join
import tornado

# 创建一个名为 'notechat_logger' 的专用日志记录器
notechat_logger = logging.getLogger("notechat_logger")
notechat_logger.setLevel(logging.INFO)
notechat_fh = logging.FileHandler("notechat.log", encoding="utf-8")
notechat_fh.setFormatter(logging.Formatter(fmt="%(asctime)s - %(levelname)s - %(message)s", datefmt="%Y-%m-%d %H:%M:%S"))
notechat_logger.addHandler(notechat_fh)
notechat_logger.info(f"###### IT IS A GOOD DAY TODAY, LET'S FIND 42 !! ######")


class RouteHandler(APIHandler):
    # The following decorator should be present on all verb methods (head, get, post,
    # patch, put, delete, options) to ensure only authorized user can request the
    # Jupyter server
    @tornado.web.authenticated
    def get(self):
        notechat_logger.info(f"###### TEST ENDPOINT: /jupyterlab-notechat/get-example ######")
        self.finish(json.dumps({
            "data": "This is /jupyterlab-notechat/get-example endpoint! You are authenticated!"
        }))


class ChatHandler(APIHandler):
    @tornado.web.authenticated
    async def post(self):       
        try:
            # 从请求体中获取messages
            data = json.loads(self.request.body)
            cell_json_arr = data.get("cell_json_arr", [])
            active_cell_index = data.get("active_cell_index", 0)
            ai_name = data.get("ai_name", "**assistant**")
            user_name = data.get("user_name", "**user**")
            ref_name = data.get("ref_name", "_ref")
            prompt = (str(data.get("prompt", "You are a helpful and warm-hearted assistant:)")) + " " + data.get("add_prompt", "")).strip()
            model = data.get("model", "gpt-4-1106-preview")
            vision_model = data.get("vision_model", "gpt-4-vision-preview")
            use_vision = parse_param(data, "use_vision", bool, True)
            max_input = parse_param(data, "max_input", int, 80000) # data.get("max_input", 80000)
            max_output = parse_param(data, "max_output", int, 4096) # data.get("max_output", 4096)
            temperature = parse_param(data, "temperature", float, 0.3) # data.get("temperature", 0.5)
            response_format = data.get("response_format", "text")
            timeout = parse_param(data, "timeout", int, 600) # timeout = data.get("timeout", 600)
            retries = parse_param(data, "retries", int, 3) # retries = data.get("retries", 3)
            delay = parse_param(data, "delay", int, 1) # delay = data.get("delay", 1)
            api_key = data.get("openai_api_key", "None")

            # 处理cell_json_arr
            messages, has_image, total_input, input_tokens = await self.cell_json_to_message(cell_json_arr, active_cell_index, ai_name, user_name, ref_name, model, use_vision, max_input, prompt)

            # 调用openai_chat函数
            if has_image and use_vision:
                notechat_logger.info(f"### PARAMS ### model: {vision_model} || use_vision: {use_vision} || has_image: {has_image} || max_input: {max_input} || total_input: {total_input} || input_tokens: {input_tokens} || max_output: {max_output}  || temperature: {temperature}")
                logging_messages = copy.deepcopy(messages)
                for message in logging_messages:
                    if isinstance(message["content"], list):
                        for content in message["content"]:
                            if content["type"] == "image_url":
                                content["image_url"] = content["image_url"][0:30] + "..." + content["image_url"][-30:]
                notechat_logger.info(f"### INPUT MESSAGES ### {logging_messages}")
                response = await self.openai_chat(messages, vision_model, max_output, None, temperature, timeout, retries, delay, api_key)
            else:
                notechat_logger.info(f"### PARAMS ### model: {model} || use_vision: {use_vision} || has_image: {has_image} || max_input: {max_input} || total_input: {total_input} || input_tokens: {input_tokens} || max_output: {max_output}  || temperature: {temperature}")
                notechat_logger.info(f"### INPUT MESSAGES ### {messages}")
                response = await self.openai_chat(messages, model, max_output, response_format, temperature, timeout, retries, delay, api_key)

            notechat_logger.info(f"### OUTPUT RESPONSE ### {response}")

            self.finish(json.dumps(response))

        except Exception as e:
            # 设置HTTP状态码为500（内部服务器错误）
            self.set_status(500)
            self.finish(json.dumps({"error": "API请求处理出错: " + str(e)}))

    async def openai_chat(self, messages, model="gpt-4-1106-preview", max_tokens=None, response_format="text", temperature=0.3, timeout=300, retries=3, delay=1, api_key=None):
        """
        使用OpenAI API进行对话生成

        Args:
            messages: 对话消息列表

            model: 模型名称，gpt-4-1106-preview，gpt-3.5-turbo-1106, gpt-3.5-turbo

            max_tokens: 最大生成长度

            response_format: 响应格式，值为`text`、`json_object`、None

            temperature: 温度参数

            timeout: 超时秒数

            retries: 重试次数

            delay: 重试延迟秒数
        """
        # 首先检查环境变量中的 OPENAI_API_KEY
        env_api_key = os.environ.get("OPENAI_API_KEY")
        if env_api_key:
            # 如果环境变量中的 OPENAI_API_KEY 存在且非空，优先使用环境变量中的值
            api_key = env_api_key
        elif api_key is None or api_key.lower() == "none":
            # 如果传入的 api_key 不存在或其值为 "none"（不区分大小写）
            return {"error": "OpenAI API Key未设置"}
        
        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + api_key,
        }
        data = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
        }
        if max_tokens is not None:
            data["max_tokens"] = max_tokens
        if response_format is not None:
            data["response_format"] = {"type": response_format}
        # proxy = os.environ["http_proxy"]
        # async with httpx.AsyncClient(proxies={"http://": "http://"+proxy, "https://": "https://"+proxy}) as client:
        async with httpx.AsyncClient() as client:
            attempt = 0
            while attempt < retries:
                try:
                    response = await client.post(url, headers=headers, json=data, timeout=timeout)
                    return response.json()
                except Exception as e:
                    logging.error(f"尝试 {attempt+1} / {retries}: 错误 - {str(e)}")
                    await asyncio.sleep(delay)
                    attempt += 1

        # 在达到最大重试次数后，返回错误信息，而不是抛出异常
        return {"error": f"API请求失败，已重试{retries}次，无法获取响应"}
    
    async def cell_json_to_message(self, cell_json_arr, active_cell_index, ai_name, user_name, ref_name, model, use_vision, max_input, prompt):
        # 打印use vision，顺便判断是不是bool值
        messages = []
        tokens = []
        has_image = False
        is_active_cell_last = True
        active_cell_tokens = 0

         # 构建用于 ai_name 的正则表达式
        ai_name_regex = re.compile(r'^{}.*\n?'.format(re.escape(ai_name)), re.IGNORECASE)

        # 构建用于 user_name 的正则表达式
        user_name_regex = re.compile(r'^{}.*\n?'.format(re.escape(user_name)), re.IGNORECASE)

        # 构建用于 div 标签的正则表达式
        ref_name_regex = re.compile(r'<div.*?>{}.*?{}.*?</div>$'.format(re.escape(ref_name), re.escape(ref_name)), re.IGNORECASE)

        for id, cell in enumerate(cell_json_arr):
            message = { 
                "role": "user",
                "name": "context"
            }
            source_text = ""
            output_text = []
            content_image = []

            # 如果source首行含有ai_name或user_name，则更换角色
            # 检查 ai_name 的匹配，如果匹配移除第一行
            if ai_name_regex.search(cell["source"]):
                cell["source"] = ai_name_regex.sub("", cell["source"])
                message["role"] = "assistant"
                message["name"] = "assistant"
            # 检查 user_name 的匹配，如果匹配移除第一行
            if user_name_regex.search(cell["source"]):
                cell["source"] = user_name_regex.sub("", cell["source"])
                message["role"] = "user"
                message["name"] = "user"

            # 如果是活动单元格，强行标注为user角色
            if cell["num_id"] == active_cell_index:
                message["role"] = "user"
                message["name"] = "user"

            # 如果source尾行含有ref_name，则去除尾行
            if ref_name_regex.search(cell["source"]):
                cell["source"] = ref_name_regex.sub("", cell["source"])

            # 处理source文本
            if len(cell["source"].strip())>0:
                source_text += cell["source"].strip()

            # 如果是markdown单元格，目前需要单独处理附件中的图片
            if cell["cell_type"] == "markdown":
                # 处理markdown附件                
                if "attachments" in cell:
                    for _, data in cell["attachments"].items():
                        # 处理图片类型附件
                        if use_vision and "image/png" in data and len(data["image/png"])>0:
                            content_image.append({"type": "image_url", "image_url": f"data:image/png;base64," + data["image/png"]})
                        elif use_vision and "image/jpeg" in data and len(data["image/jpeg"])>0:
                            content_image.append({"type": "image_url", "image_url": f"data:image/jpeg;base64," + data["image/jpeg"]})
                        elif use_vision and "image/gif" in data and len(data["image/gif"])>0:
                            content_image.append({"type": "image_url", "image_url": f"data:image/gif;base64," + data["image/gif"]})
                        elif use_vision and "image/webp" in data and len(data["image/webp"])>0:
                            content_image.append({"type": "image_url", "image_url": f"data:image/webp;base64," + data["image/webp"]})
                        # 目前openai vision不支持bmp格式
                        # elif "image/bmp" in data and len(data["image/bmp"])>0:
                        #     content_image.append({"type": "image_url", "image_url": f"data:image/bmp;base64," + data["image/bmp"]})
            
            # 如果是raw单元格，目前暂时没有特殊处理
            if cell["cell_type"] == "raw":
                pass
            
            # 如果是code单元格，目前要处理outputs中的内容
            if cell["cell_type"] == "code":
                if "outputs" in cell and len(cell["outputs"])>0:
                    
                    for output in cell["outputs"]:
                        # 一般是打印出来的内容
                        if output["output_type"] == "stream":
                            clean_stream = remove_ansi_codes(output["text"])
                            output_text.append(clean_stream.strip())
                        # 单元格输出的错误内容
                        elif output["output_type"] == "error":
                            # 去掉traceback中的颜色类的ansi符号
                            clean_traceback = [remove_ansi_codes(text) for text in output["traceback"]]
                            clean_traceback_text = "\n".join(clean_traceback).strip()
                            output_text.append(f'''Error Name:{output["ename"]}\nError Value:{output["evalue"]}\nError Traceback:{clean_traceback_text}''')
                        elif output["output_type"] == "execute_result" or output["output_type"] == "display_data":
                            if "data" in output and len(output["data"])>0:
                                # 一般是变量输出的值
                                if "text/plain" in output["data"] and len(output["data"]["text/plain"])>0:
                                    output_text.append(output["data"]["text/plain"].strip())
                                # 一般是plotly的微缩图片
                                if use_vision and "image/png" in output["data"] and len(output["data"]["image/png"])>0:
                                    content_image.append({"type": "image_url", "image_url": f"data:image/png;base64," + output["data"]["image/png"]})
                                elif use_vision and "image/jpeg" in output["data"] and len(output["data"]["image/jpeg"])>0:
                                    content_image.append({"type": "image_url", "image_url": f"data:image/jpeg;base64," + output["data"]["image/jpeg"]})
                                elif use_vision and "image/gif" in output["data"] and len(output["data"]["image/gif"])>0:
                                    content_image.append({"type": "image_url", "image_url": f"data:image/gif;base64," + output["data"]["image/gif"]})
                                elif use_vision and "image/webp" in output["data"] and len(output["data"]["image/webp"])>0:
                                    content_image.append({"type": "image_url", "image_url": f"data:image/webp;base64," + output["data"]["image/webp"]})

            # 如果有图片，则标记为有图片
            if len(content_image) > 0:
                has_image = True
            
            # 准备该条信息的结构数据
            content_text = ""
            if len(source_text) > 0:
                content_text += source_text + "\n"
            if len(output_text) > 0:
                content_text += "\nexecuted outputs:\n" + "\n----------\n".join(output_text) + "\n----------"

            content_text = content_text.strip()

            if len(content_image) > 0 and len(content_text) > 0:
                message["content"] = [{"type": "text", "text": content_text}]
                message["content"].extend(content_image)
            elif len(content_image) > 0 and len(content_text) <= 0:
                message["content"] = content_image
            elif len(content_image) <= 0 and len(content_text) > 0:
                message["content"] = content_text
            else:
                continue

            messages.append(message)
            # 这里只计算文本的token数量，不计算图片的token数量
            tokens.append(get_num_tokens(content_text, model))
            
            # 如果是当前活动单元格，则特别标记，因为有的时候，用户可能会放入下文，如果含有下文，则用户当前活动单元格再重复一次
            if cell["num_id"] == active_cell_index and id < len(cell_json_arr)-1:
                is_active_cell_last = False
                last_message = message.copy()
                active_cell_tokens = tokens[-1]
        
        # 最后检查下活动单元格是不是最后一个，如果不是，则再重复一次
        if not is_active_cell_last:
            messages.append(last_message)
            tokens.append(active_cell_tokens)

        # 加入system message token量作为起始点，prompt肯定不为None
        prompt_token = get_num_tokens(prompt, model)
        total_input = prompt_token
        # 计算总token数量，从后向前数，如果超过则截断
        # 要注意，这里system message是tokens中的第一个id，len(messages)比len(tokens)少1
        i = len(tokens) - 1
        while i >= 0:
            total_input += tokens[i]
            if total_input > max_input:
                break
            i -= 1
        # 即便active cell是最后一个超过了字符数量，也要保证至少有一个message
        final_messages = messages[min(i + 1, len(messages)-1):]
        final_tokens = tokens[min(i + 1, len(tokens)-1):]
        # 将system message放在第一个message
        if len(prompt)>0:
            final_messages.insert(0, {"role": "system", "content": prompt})

        input_tokens = f"【{','.join(map(str, tokens))}】【{str(prompt_token)}】=>【{str(prompt_token)}】【{','.join(map(str, final_tokens))}】"
        return final_messages, has_image, total_input, input_tokens

# 移除字符串中的ansi颜色代码
def remove_ansi_codes(text):
    ansi_escape = re.compile(r'\x1B[@-_][0-?]*[ -/]*[@-~]')
    return ansi_escape.sub("", text)

# 移除文本中开头和结尾特定文本
def process_source(source, ai_name, user_name, ref_name):
    # 构建正则表达式
    # 匹配以 ai_name 或 user_name 开头的文本
    name_regex = re.compile(r'^(?:{}|{})'.format(re.escape(ai_name), re.escape(user_name)), re.IGNORECASE)

    # 匹配特定格式的 div 标签
    div_pattern = r'<div.*?>{}.*?{}.*?</div>$'.format(re.escape(ref_name), re.escape(ref_name))
    div_regex = re.compile(div_pattern, re.IGNORECASE | re.DOTALL)

    # 移除匹配的文本
    source = name_regex.sub("", source)
    source = div_regex.sub("", source)

    return source

# 计算token数量
def get_num_tokens(text, model):
    encoding = tiktoken.encoding_for_model(model)
    return len(encoding.encode(text))

# 解析参数
def parse_param(data, key, type, default):
    if key in data:
        value = data[key]
        # 如果值已经是目标类型，直接返回
        if isinstance(value, type):
            return value
        # 如果值是字符串，转换为目标类型
        elif isinstance(value, str):
            try:
                # bool类型单独处理，因为可能遇到大小写问题
                if type == bool:
                    value_lower = value.lower()
                    if value_lower == 'true':
                        return True
                    elif value_lower == 'false':
                        return False
                else:
                    return type(value)
            except:
                return default
    # 如果值是其他类型，返回默认值
    return default

def setup_handlers(web_app):
    host_pattern = ".*$"
    base_url = web_app.settings["base_url"]

    # 定义example端点的路由
    get_example_route_pattern = url_path_join(base_url, "jupyterlab-notechat", "get-example")
    get_example_handler = (get_example_route_pattern, RouteHandler)

    # 定义chat端点的路由
    chat_route_pattern = url_path_join(base_url, "jupyterlab-notechat", "chat")
    chat_handler = (chat_route_pattern, ChatHandler)

    # 添加handlers到web应用
    handlers = [get_example_handler, chat_handler]
    web_app.add_handlers(host_pattern, handlers)
