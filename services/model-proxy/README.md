# OpenClaw Model API Proxy

透明代理模型 API，记录所有请求/响应内容。

## 🚀 快速开始

```bash
# 使用 openclaw-services CLI
openclaw-services start proxy

# 或手动启动
cd ~/.openclaw/services/model-proxy
node server.js
```

## 📋 配置 OpenClaw

在 OpenClaw 配置文件中设置：

```env
# Anthropic
ANTHROPIC_BASE_URL=http://localhost:3456/v1

# 或 OpenAI
OPENAI_BASE_URL=http://localhost:3456/v1

# 或智谱
ZHIPU_BASE_URL=http://localhost:3456/v1
```

## 🔍 查看日志

### 实时日志
服务器会在终端输出所有请求/响应。

### API 查询

**查看所有请求：**
```bash
curl http://localhost:3456/_logs
```

**查看统计：**
```bash
curl http://localhost:3456/_stats
```

## 📊 日志内容

每个请求记录包含：

```json
{
  "id": 1,
  "timestamp": "2026-03-02T...",
  "provider": "openai",
  "model": "gpt-4o",
  "messages": [...],
  "response": {...},
  "usage": {
    "input_tokens": 100,
    "output_tokens": 50
  }
}
```

## 🏗️ 架构

```
┌─────────────┐
│   OpenClaw  │
└──────┬──────┘
       │
       ▼
┌─────────────────────────────────────┐
│        Model Proxy (port 3456)       │
│  ┌─────────────────────────────────┐ │
│  │ 供应商检测                       │ │
│  │ • X-Provider 头                 │ │
│  │ • API Key 前缀                   │ │
│  │ • 路径模式                       │ │
│  └─────────────────────────────────┘ │
│  ┌─────────────────────────────────┐ │
│  │ SQLite 存储                      │ │
│  │ • 批量写入（50 条/5 秒）         │ │
│  │ • WAL 模式                       │ │
│  │ • 30 天保留                      │ │
│  └─────────────────────────────────┘ │
└─────────────────────────────────────┘
       │
       ▼
┌─────────────────────────────────────┐
│  LLM APIs (Anthropic/OpenAI/智谱/...) │
└─────────────────────────────────────┘
```

## 🎯 使用场景

1. **调试** - 查看实际发送的 prompt
2. **优化** - 分析 token 使用情况
3. **审计** - 记录所有模型调用
4. **成本分析** - 统计 API 费用

## ✅ 已实现功能

- [x] 透明代理（支持 Anthropic/OpenAI/z.ai/智谱/MiniMax）
- [x] SQLite 存储（WAL 模式）
- [x] 批量写入（50 条/5 秒）
- [x] 并发锁保护
- [x] LRU 缓存加速查询
- [x] API Key 脱敏
- [x] 内容截断
- [x] 供应商自动检测
- [x] REST API（7 个端点）
- [x] Prometheus metrics 端点
- [x] 单元测试（25 个）
- [x] 配置文件支持（TOML）
- [x] launchd 自动启动

## 📡 API 端点

| 端点 | 说明 |
|------|------|
| `GET /_health` | 健康检查 |
| `GET /_stats` | 统计信息 |
| `GET /_logs` | 日志查询 |
| `GET /_providers` | 供应商列表 |
| `GET /_metrics` | Prometheus 指标 |
| `GET /_cleanup` | 清理旧数据 |
| `POST /_flush` | 手动刷新 |

## 🔗 相关项目

| 项目 | 说明 |
|------|------|
| [openclaw-watchdog](https://github.com/dongdada29/openclaw-watchdog) | 自动更新 + 故障保护 |
| [OpenClaw](https://github.com/openclaw/openclaw) | AI Agent 框架 |

## ⚠️ 注意事项

- 仅用于开发/调试
- 不要在生产环境使用
- 日志可能包含敏感信息（已脱敏）

## 📄 文档

- [ARCHITECTURE.md](./ARCHITECTURE.md) - 架构设计
- [接入指南](../openclaw-watchdog/docs/PROXY_INTEGRATION_GUIDE.md) - OpenClaw 接入
- [测试用例](../openclaw-watchdog/docs/TEST_CASES.md) - 测试清单

## 📜 License

MIT
