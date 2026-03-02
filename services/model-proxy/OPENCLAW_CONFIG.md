# OpenClaw Model API Proxy - 配置指南

## 供应商对应关系

代理通过 **URL 路径** 区分不同的 API 端点，OpenClaw 通过 **providerId** 区分供应商。

### 方案 A：使用环境变量（简单）

```toml
# ~/.config/openclaw/config.toml

[env]
# z.ai 全球版（默认）
ZAI_BASE_URL = "http://localhost:3456/api/paas/v4"

# 或 z.ai 国内版
# ZAI_BASE_URL = "http://localhost:3456/zai-cn/api/paas/v4"
```

**缺点**：只能监控一个版本（全球版 或 国内版）

---

### 方案 B：配置多个供应商（推荐）

```toml
# ~/.config/openclaw/config.toml

[models.providers]

# z.ai 全球版
[models.providers.zai-global]
baseUrl = "http://localhost:3456/api/paas/v4"
api = "openai-completions"
authHeader = true
models = [
  { id = "glm-5", name = "GLM-5 Global", cost = { input = 0, output = 0 } },
  { id = "glm-4.7", name = "GLM-4.7 Global", cost = { input = 0, output = 0 } },
]

# z.ai 国内版
[models.providers.zai-cn]
baseUrl = "http://localhost:3456/zai-cn/api/paas/v4"
api = "openai-completions"
authHeader = true
models = [
  { id = "glm-5", name = "GLM-5 CN", cost = { input = 0, output = 0 } },
  { id = "glm-4", name = "GLM-4 CN", cost = { input = 0, output = 0 } },
]

# z.ai Coding Plan（全球版）
[models.providers.zai-coding]
baseUrl = "http://localhost:3456/api/coding/paas/v4"
api = "openai-completions"
authHeader = true
models = [
  { id = "glm-5", name = "GLM-5 Coding", cost = { input = 0, output = 0 } },
]

# Anthropic
[models.providers.anthropic-proxy]
baseUrl = "http://localhost:3456/v1"
api = "anthropic-messages"
models = [
  { id = "claude-3-5-sonnet-20241022", name = "Claude 3.5 Sonnet" },
]

# OpenAI
[models.providers.openai-proxy]
baseUrl = "http://localhost:3456/v1"
api = "openai-completions"
models = [
  { id = "gpt-4o", name = "GPT-4o" },
  { id = "gpt-4-turbo", name = "GPT-4 Turbo" },
]
```

### 使用模型

```toml
# 设置默认模型
[agents.defaults]
model = "zai-global/glm-5"
# 或
model = "zai-cn/glm-5"
# 或
model = "zai-coding/glm-5"
```

---

## 代理路由规则

| URL 前缀 | 目标主机 | 说明 |
|---------|---------|------|
| `/api/paas/v4/*` | `api.z.ai` | z.ai 全球版（通用） |
| `/api/coding/paas/v4/*` | `api.z.ai` | z.ai 全球版（Coding） |
| `/zai-cn/api/paas/v4/*` | `open.bigmodel.cn` | z.ai 国内版（通用） |
| `/zai-cn/api/coding/paas/v4/*` | `open.bigmodel.cn` | z.ai 国内版（Coding） |
| `/v1/*` | 根据 API 格式自动检测 | OpenAI/Anthropic |

---

## 示例：同时监控多个供应商

```bash
# 在 OpenClaw 中配置后，所有请求都会经过代理

# 使用 z.ai 全球版
openclaw chat --model zai-global/glm-5

# 使用 z.ai 国内版
openclaw chat --model zai-cn/glm-5

# 使用 Anthropic
openclaw chat --model anthropic-proxy/claude-3-5-sonnet-20241022

# 查看统计
curl http://localhost:3456/_stats
```

输出：
```json
{
  "byProvider": {
    "zai-global": 5,
    "zai-cn": 3,
    "anthropic": 2
  },
  "totalTokens": {
    "input": 1500,
    "output": 800
  }
}
```
