# OpenClaw Model API Proxy - 架构文档

## 分层架构

```
┌─────────────────────────────────────────────────────────────┐
│                      server.js (入口)                        │
│  - 初始化配置                                                │
│  - 初始化数据库                                              │
│  - 启动 HTTP 服务                                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │                 src/api/routes.js                        │ │
│  │  - RESTful API 路由                                      │ │
│  │  - GET /_stats, /_logs, /_providers, /_cleanup           │ │
│  │  - POST /_flush                                          │ │
│  └─────────────────────────────────────────────────────────┘ │
│                           ↓                                  │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │               src/proxy/handler.js                       │ │
│  │  - 请求转发                                              │ │
│  │  - 响应处理                                              │ │
│  │  - 超时控制                                              │ │
│  └─────────────────────────────────────────────────────────┘ │
│          ↓                           ↓                        │
│  ┌──────────────────┐      ┌──────────────────┐              │
│  │ src/providers/   │      │ src/db/          │              │
│  │ - 供应商注册表    │      │ - 数据库连接      │              │
│  │ - 自动检测        │      │ - 批量写入        │              │
│  │ - 路由重写        │      │ - 查询接口        │              │
│  └──────────────────┘      └──────────────────┘              │
│          ↓                           ↓                        │
│  ┌──────────────────┐      ┌──────────────────┐              │
│  │ src/config/      │      │ src/utils/       │              │
│  │ - 配置文件加载    │      │ - 日志工具        │              │
│  │ - 环境变量       │      │ - 脱敏工具        │              │
│  │ - 默认配置       │      │                  │              │
│  └──────────────────┘      └──────────────────┘              │
└─────────────────────────────────────────────────────────────┘
```

## 模块职责

### 1. src/config/ - 配置管理
- **index.js**: 配置加载器
  - 支持配置文件 (`config.toml`)
  - 支持环境变量
  - 优先级: 代码 > 环境变量 > 配置文件 > 默认值

### 2. src/db/ - 数据库层
- **index.js**: 数据库连接管理
  - SQLite 初始化
  - WAL 模式
  - 表结构创建
- **repository.js**: 数据仓库
  - 批量写入（带重试）
  - 统计查询
  - 日志查询
  - 数据清理

### 3. src/providers/ - 供应商管理
- **index.js**: 供应商注册表
  - 支持的供应商定义
  - key 前缀映射
- **detector.js**: 供应商检测
  - X-Provider 头检测
  - API Key 前缀匹配
  - 路径格式匹配

### 4. src/proxy/ - 代理处理
- **handler.js**: 请求/响应处理
  - 请求转发
  - 响应流式处理
  - 超时控制
  - 错误处理

### 5. src/api/ - API 路由
- **routes.js**: RESTful API
  - GET /_health - 健康检查
  - GET /_stats - 统计信息
  - GET /_logs - 日志查询
  - GET /_providers - 供应商列表
  - GET /_cleanup - 数据清理
  - POST /_flush - 手动刷新

### 6. src/utils/ - 工具函数
- **logger.js**: 日志工具
  - 统一日志格式
  - API Key 脱敏
- **sanitize.js**: 脱敏工具
  - 消息内容截断
  - 敏感信息处理

## 已修复的问题

| # | 问题 | 状态 | 解决方案 |
|---|------|------|---------|
| 1 | 时间过滤 SQL 语法错误 | ✅ | 使用 `strftime()` 正确格式 |
| 2 | OpenAI key 前缀太宽泛 | ✅ | `['sk-proj-', 'sk-svca-', 'sk-']` |
| 3 | 批量写入失败数据丢失 | ✅ | 先复制再写入，失败保留数据 |
| 4 | 缺少请求超时 | ✅ | 添加 30s 超时和 timeout 事件 |
| 5 | 缺少配置文件支持 | ✅ | 支持 TOML 配置文件 |
| 6 | 缺少 API Key 脱敏 | ✅ | 日志中脱敏认证信息 |

## 配置方式

### 方式 1: 配置文件

```toml
# ~/.openclaw-model-proxy/config.toml

[server]
port = 3456
timeout = 30000

[logging]
requests = true
responses = true

[storage]
retentionDays = 30
batchSize = 50
```

### 方式 2: 环境变量

```bash
export PROXY_PORT=3456
export PROXY_TIMEOUT=30000
export DB_PATH=~/.openclaw-model-proxy/logs.db
```

### 方式 3: 代码

```javascript
import { initConfig } from './src/config/index.js';

initConfig({
  port: 3456,
  timeout: 30000,
});
```

## 扩展指南

### 添加新供应商

编辑 `src/providers/index.js`:

```javascript
export const PROVIDERS = {
  // ...
  
  'new-provider': {
    name: 'New Provider',
    host: 'api.newprovider.com',
    keyPrefix: ['new_'],
    pathPatterns: ['/v1/chat'],
    apiFormat: 'openai',
  },
};
```

### 添加新 API 端点

编辑 `src/api/routes.js`:

```javascript
const routes = {
  // ...
  'GET /_new-endpoint': () => handleNewEndpoint(res),
};
```

### 自定义脱敏规则

编辑 `src/utils/sanitize.js`:

```javascript
export function sanitizeRequest(requestData) {
  // 添加自定义脱敏逻辑
}
```

## 性能优化

1. **批量写入**: 50条/5秒 批量写入，减少 I/O
2. **WAL 模式**: SQLite WAL 模式，提高并发
3. **预编译语句**: SQL 语句预编译，提高查询速度
4. **连接复用**: 单数据库连接，减少开销

## 安全措施

1. **API Key 脱敏**: 日志中不显示完整密钥
2. **内容截断**: 长文本截断，防止日志膨胀
3. **图片检测**: 识别并标记图片内容
4. **敏感信息**: 不保存完整用户消息

## 文件大小

```
src/config/index.js      - 195 行
src/db/index.js          - 65 行
src/db/repository.js     - 178 行
src/providers/index.js   - 58 行
src/providers/detector.js- 71 行
src/proxy/handler.js     - 165 行
src/api/routes.js        - 110 行
src/utils/logger.js      - 115 行
src/utils/sanitize.js    - 68 行
server.js                - 82 行
───────────────────────────────
总计                      ~1107 行
```
