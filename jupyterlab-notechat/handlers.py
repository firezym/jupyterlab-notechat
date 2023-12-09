import json, os, logging
import httpx, asyncio

from jupyter_server.base.handlers import APIHandler
from jupyter_server.utils import url_path_join
import tornado


class RouteHandler(APIHandler):
    # The following decorator should be present on all verb methods (head, get, post,
    # patch, put, delete, options) to ensure only authorized user can request the
    # Jupyter server
    @tornado.web.authenticated
    def get(self):
        self.finish(json.dumps({
            "data": "This is /jupyterlab-notechat/get-example endpoint!"
        }))


class ChatHandler(APIHandler):
    @tornado.web.authenticated
    async def post(self):
        try:
            # 从请求体中获取messages
            data = json.loads(self.request.body)
            messages = data.get('messages', [])
            model = data.get('model', "gpt-4-1106-preview")
            response_format = data.get('response_format', "text")
            temperature = data.get('temperature', 0.3)
            timeout = data.get('timeout', 300)
            retries = data.get('retries', 3)
            delay = data.get('delay', 1)

            # 调用openai_chat函数
            response = await self.openai_chat(messages, model, response_format, temperature, timeout, retries, delay)
            self.finish(json.dumps(response))

        except Exception as e:
            # 设置HTTP状态码为500（内部服务器错误）
            self.set_status(500)
            self.finish(json.dumps({"error": "API请求处理出错: " + str(e)}))

    async def openai_chat(self, messages, model="gpt-4-1106-preview", response_format="text", temperature=0.3, timeout=300, retries=3, delay=1):
        """
        使用OpenAI API进行对话生成

        Args:
            messages: 对话消息列表

            model: 模型名称，gpt-4-1106-preview，gpt-3.5-turbo-1106, gpt-3.5-turbo

            response_format: 响应格式，值为`text`或`json_object`

            temperature: 温度参数

            timeout: 超时秒数

            retries: 重试次数

            delay: 重试延迟秒数
        """
        url = "https://api.openai.com/v1/chat/completions"
        headers = {
            "Content-Type": "application/json",
            "Authorization": "Bearer " + os.environ["OPENAI_API_KEY"],
        }
        data = {
            "model": model,
            "messages": messages,
            "temperature": temperature,
            "response_format": {"type": response_format},
        }
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
