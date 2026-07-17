# LLM 适配

项目将不同厂商、不同协议的模型调用统一收口到一层适配器里，上层 Agent 不需要关心底层用的是哪个 provider。适配器代码位于 `llms/`，统一接口定义在 `src/base_llm.py`。

## 整体结构

```
BaseLLM（src/base_llm.py）
  │  基于 LiteLLM 的默认实现
  │  → completion() 调用 litellm.completion()
  │  → _parse_response() 归一化为统一结构
  │
  ├─ ClaudeLLM（llms/claude_llm.py）
  │    → 重写 completion()
  │    → 使用 httpx.post 直接发送 OpenAI 兼容格式请求
  │    → 支持 thinking_kwargs 扩展思考
  │
  └─ DSVPTULLM（llms/dsv_ptu_llm.py）
       → 重写 completion()
       → 使用 openai_proxy.GptProxy 发送请求
       → 不通过 LiteLLM，支持 transaction_id / channel_code
```

## BaseLLM 核心逻辑

### 构造参数

```python
BaseLLM(
    model: str,
    api_key: Optional[str] = None,
    base_url: Optional[str] = None,
    provider: str = "openai",
    temperature: float = 0.7,
    max_tokens: int = 4096,
    **kwargs,
)
```

`BaseLLM` 是一个可直接使用的具体类（不是抽象接口），内部包装 LiteLLM：它把 `model / api_key / base_url / provider` 等参数组装为调用字典 `_call_kwargs`，后续每次 `completion()` 直接展开使用。

### completion() 签名

```python
def completion(
    self,
    messages: List[Dict[str, Any]],
    tools: Optional[List[Dict[str, Any]]] = None,
    tool_choice: Optional[Any] = None,
) -> Dict[str, Any]
```

核心流程：

```
输入 messages + tools + tool_choice
  → _clean_messages()    只保留 LLM API 标准字段（role, content, tool_calls, tool_call_id, name）
  →                      处理 Google Gemini 的 thought signature 兼容
  → litellm.completion() 发起调用
  → _parse_response()    归一化返回值
  → 返回统一结构
```

### 归一化输出结构

`_parse_response()` 返回的字典包含以下字段：

| 字段 | 说明 |
|------|------|
| `role` | 固定为 `"assistant"` |
| `content` | 模型文本回复 |
| `thinking_content` | 扩展思考内容（Claude extended thinking / DeepSeek reasoning 等），可选 |
| `tool_calls` | 工具调用列表，可选 |
| `provider_specific_fields` | provider 特有字段（如 Gemini reasoning_details），可选 |
| `total_usage` | 本次调用的 token 总用量，可选 |

上层 `BaseNode` 主要消费 `content` 和 `tool_calls`；`thinking_content` 用于调试和记录；`total_usage` 用于预算跟踪。

## 适配器实现方式

两个已有适配器（`ClaudeLLM`、`DSVPTULLM`）都继承 `BaseLLM`，但各自完全重写了 `completion()` 方法——它们绕过 LiteLLM，直接使用各自的 HTTP 客户端发起请求，然后自行解析响应为上面同样的归一化结构。

如果接入新模型，一般做法是：

1. 新建 `llms/xxx_llm.py`，继承 `BaseLLM`
2. 重写 `completion()`，用目标 provider 的 SDK 或 HTTP 客户端发起请求
3. 确保返回值包含 `role / content / tool_calls / total_usage` 等标准字段
4. 在配置的 `llm` / `vlm` / `audio_basellm` 段落里指定对应的类和参数

## 在 agentv3 里的加载方式

```
build_agent_components()（runtime_components.py）
  → 读取 conf.llm / conf.vlm / conf.audio_basellm 配置
  → 分别构造 BaseLLM 实例
  → 返回 components dict（包含 "llm", "vlm", "audio_basellm"）
  ↓
prepare_session()（session_setup.py）
  → 调用 init_ctx()（agent_v3.py）
  → 注入全局上下文 ctx：
       ctx.llm          = components["llm"]
       ctx.vqa_basellm  = components["vlm"]
       ctx.audio_basellm = components["audio_basellm"]
  ↓
BaseNode / 工具函数
  → 通过 ctx.llm / ctx.vqa_basellm / ctx.audio_basellm 访问模型实例
```

注意：`build_agent_components()` 返回的 key 是 `"vlm"`，但 `init_ctx()` 接收参数名为 `vqa_basellm`，存入 `ctx.vqa_basellm`。上层代码通过 `ctx.vqa_basellm` 访问视觉模型实例。
