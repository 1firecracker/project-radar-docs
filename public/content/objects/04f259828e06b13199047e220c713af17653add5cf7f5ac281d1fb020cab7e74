# Cloudsway Thought Signature 说明

本文只说明当前项目里 `cloudsway` 的调用方式，以及收到 `thought signature` 后如何把 provider 元数据拼回下一轮消息。

## 1. 一个具体的 cloudsway 调用例子

当前项目的调用入口仍然是 `BaseLLM`，`cloudsway` 只是作为 `base_url` 透传给 LiteLLM：

```python
from src.base_llm import BaseLLM

llm = BaseLLM(
    model="MaaS_Ge_3_flash_pro_20251217",
    api_key="<cloudsway-api-key>",
    base_url="https://genaiapi.cloudsway.net/v1/ai/vEHkTgVnLcrvHENf",
    provider="openai",
    temperature=1,
    max_tokens=64000,
)

messages = [
    {"role": "user", "content": "北京今天天气怎么样？如果需要就调用工具。"}
]

response = llm.completion(messages)
print(response)
```

请求发出去时，本项目不会单独判断是不是 `cloudsway`。真正的特殊处理发生在响应回来之后。

## 2. cloudsway 返回里要关注什么

如果 `cloudsway` 透传了类似下面的字段：

```json
{
  "role": "assistant",
  "content": "",
  "tool_calls": [
    {
      "id": "call_123",
      "type": "function",
      "function": {
        "name": "web_search",
        "arguments": "{\"query\":\"北京天气\"}"
      }
    }
  ],
  "provider_specific_fields": {
    "reasoning_details": [
      {
        "type": "tool",
        "signature": "sig_abc123"
      }
    ]
  }
}
```

那么当前代码会把这条 assistant 消息视为“带 thought signature 的消息”。

这里真正重要的不是 `thinking_content`，而是：

- `provider_specific_fields`
- 其中的 `reasoning_details[*].signature`

## 3. 一个拼接示例代码

下面这段示例代码表达的就是当前项目里的核心逻辑：如果 assistant 消息里带有 `thought signature`，下一轮请求时要把 `provider_specific_fields` 重新拼回 assistant 消息，并把后续工具结果改写成 `role: "user"`。

```python
from copy import deepcopy


def has_google_thought_signature(message: dict) -> bool:
    provider_specific_fields = message.get("provider_specific_fields") or {}
    reasoning_details = provider_specific_fields.get("reasoning_details") or []
    if not isinstance(reasoning_details, list):
        return False
    return any(
        isinstance(item, dict)
        and item.get("type") == "tool"
        and bool(item.get("signature"))
        for item in reasoning_details
    )


def rebuild_assistant_message(message: dict) -> dict:
    payload = {
        k: deepcopy(v)
        for k, v in message.items()
        if k in {"role", "content", "tool_calls", "tool_call_id", "name"}
    }
    provider_specific_fields = message.get("provider_specific_fields")
    if provider_specific_fields:
        payload["provider_specific_fields"] = deepcopy(provider_specific_fields)
    return payload


def normalize_tool_message_for_google(message: dict) -> dict:
    return {
        "role": "user",
        "tool_call_id": message.get("tool_call_id"),
        "content": message.get("content", ""),
    }


def clean_messages(messages: list[dict]) -> list[dict]:
    cleaned = []
    pending_google_tool_reply = False

    for msg in messages:
        if pending_google_tool_reply and msg.get("role") == "tool":
            cleaned.append(normalize_tool_message_for_google(msg))
            continue

        if msg.get("role") == "assistant" and has_google_thought_signature(msg):
            cleaned.append(rebuild_assistant_message(msg))
        else:
            cleaned.append(
                {
                    k: deepcopy(v)
                    for k, v in msg.items()
                    if k in {"role", "content", "tool_calls", "tool_call_id", "name"}
                }
            )

        pending_google_tool_reply = has_google_thought_signature(msg)

    return cleaned
```

## 4. 这段拼接代码的含义

这段逻辑做的事很具体：

1. 检查 assistant 消息里有没有 `provider_specific_fields.reasoning_details[*].signature`
2. 如果有，就把 `provider_specific_fields` 跟着 assistant 消息一起带回下一轮
3. 如果下一条消息是工具返回，就把它改写成 `role: "user"`

所以准确说法是：

- 不是把 thought 文本拼回 `content`
- 而是把 `thought signature` 所在的 provider 元数据拼回 assistant 消息

## 5. 代码位置

当前仓库里的真实实现位于：

- `src/base_llm.py`
  - `_message_has_google_thought_signature()`
  - `_rebuild_assistant_message()`
  - `_normalize_tool_message_for_google()`
  - `_clean_messages()`
