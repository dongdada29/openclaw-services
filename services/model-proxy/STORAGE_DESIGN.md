# 日志存储设计方案

## 问题分析

### 数据量
- 单条日志: 2-10KB
- 高频场景: 100-10000 次/天
- 月累计: 6MB - 3GB

### 存储需求
1. **热数据** (最近1小时) - 快速查询
2. **温数据** (最近7天) - 统计分析
3. **冷数据** (历史) - 归档压缩

---

## 方案对比

| 方案 | 优点 | 缺点 | 适用场景 |
|------|------|------|----------|
| **内存** | 最快 | 易丢失，容量小 | 热数据缓存 |
| **JSON Lines** | 简单，易解析 | 查询慢，无索引 | 小规模 |
| **SQLite** | 轻量，支持索引 | 单文件，并发差 | 中等规模 |
| **PostgreSQL** | 功能强大 | 需要服务器 | 大规模 |
| **时序DB** | 专为监控设计 | 复杂度高 | 监控场景 |

---

## 推荐方案：分层存储

```
┌─────────────────────────────────────────────────────────┐
│                      日志写入流程                         │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  请求 → 内存队列 (100条) → 批量写入 → SQLite              │
│                           ↓                              │
│                      定期压缩 → 归档文件                   │
│                           ↓                              │
│                      超过30天 → 自动删除                   │
│                                                          │
└─────────────────────────────────────────────────────────┘

数据分层：
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│   内存缓存    │  │   SQLite     │  │  归档文件     │
│  (最近100条)  │→ │  (最近30天)   │→ │  (>30天)     │
│  快速查询     │  │  统计分析     │  │  压缩存储     │
└──────────────┘  └──────────────┘  └──────────────┘
```

---

## 数据结构设计

### SQLite 表结构

```sql
-- 请求元数据
CREATE TABLE requests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT,
  method TEXT,
  path TEXT,
  status INTEGER,
  duration_ms INTEGER,
  is_streaming BOOLEAN,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- Token 使用统计
CREATE TABLE token_usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER REFERENCES requests(id),
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  provider TEXT,
  model TEXT,
  timestamp TEXT
);

-- 请求体（可选，敏感信息脱敏）
CREATE TABLE request_bodies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  request_id INTEGER REFERENCES requests(id),
  messages TEXT,  -- JSON，脱敏
  system TEXT,    -- 截断到 500 字符
  tools TEXT,     -- 仅保存名称列表
  has_images BOOLEAN,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX idx_requests_timestamp ON requests(timestamp);
CREATE INDEX idx_requests_provider ON requests(provider);
CREATE INDEX idx_requests_model ON requests(model);
CREATE INDEX idx_token_usage_timestamp ON token_usage(timestamp);
```

---

## 敏感信息处理

### 脱敏策略

```javascript
function sanitizeRequest(request) {
  return {
    // Messages: 截断长文本
    messages: request.messages?.map(m => ({
      role: m.role,
      content: truncate(m.content, 100),  // 只保留前100字符
    })),
    
    // System: 截断
    system: truncate(request.system, 200),
    
    // Tools: 只保留名称
    tools: request.tools?.map(t => t.name || t.function?.name),
    
    // 移除敏感内容
    // - 完整的用户消息
    // - 图片 base64
    // - 文件内容
  };
}

function truncate(text, maxLength) {
  if (!text) return text;
  if (typeof text !== 'string') return '[complex]';
  return text.length > maxLength 
    ? text.slice(0, maxLength) + '...' 
    : text;
}
```

---

## 存储策略

### 写入策略
```javascript
// 批量写入，减少 I/O
const BUFFER_SIZE = 100;
const FLUSH_INTERVAL = 5000; // 5秒

let buffer = [];

function logRequest(data) {
  buffer.push(data);
  
  if (buffer.length >= BUFFER_SIZE) {
    flush();
  }
}

setInterval(() => {
  if (buffer.length > 0) flush();
}, FLUSH_INTERVAL);

function flush() {
  const batch = buffer.splice(0);
  db.batchInsert(batch);
}
```

### 清理策略
```javascript
const RETENTION_DAYS = 30;

// 每天凌晨清理
cron.schedule('0 0 * * *', () => {
  const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
  
  // 1. 归档旧数据
  archiveOldRequests(cutoff);
  
  // 2. 删除旧数据
  db.query('DELETE FROM requests WHERE timestamp < ?', [cutoff]);
  db.query('DELETE FROM request_bodies WHERE created_at < ?', [cutoff]);
  
  // 3. 压缩数据库
  db.query('VACUUM');
});
```

---

## 查询优化

### 热门查询
```sql
-- 最近1小时统计
SELECT 
  provider,
  COUNT(*) as count,
  SUM(token_usage.input_tokens) as input_tokens,
  SUM(token_usage.output_tokens) as output_tokens
FROM requests
JOIN token_usage ON requests.id = token_usage.request_id
WHERE requests.timestamp > datetime('now', '-1 hour')
GROUP BY provider;

-- 每日统计
SELECT 
  date(timestamp) as date,
  provider,
  COUNT(*) as requests,
  SUM(input_tokens) as total_input,
  SUM(output_tokens) as total_output
FROM requests
JOIN token_usage ON requests.id = token_usage.request_id
WHERE timestamp > datetime('now', '-7 days')
GROUP BY date(timestamp), provider
ORDER BY date DESC;
```

---

## 配置选项

```toml
# config.toml

[storage]
# 存储类型: memory | sqlite | postgres
type = "sqlite"

# SQLite 数据库路径
database = "~/.openclaw-model-proxy/logs.db"

# 保留天数
retention_days = 30

# 批量写入大小
batch_size = 100

# 批量写入间隔 (毫秒)
flush_interval = 5000

# 是否保存请求体
save_request_body = true

# 请求体截断长度
max_content_length = 100

# 归档目录
archive_dir = "~/.openclaw-model-proxy/archives"

# 自动归档
auto_archive = true
```

---

## API 设计

```bash
# 查询最近日志
GET /_logs?limit=100&offset=0

# 按供应商过滤
GET /_logs?provider=zai&limit=100

# 按时间范围
GET /_logs?from=2026-03-01&to=2026-03-02

# 统计信息
GET /_stats?period=hour|day|week|month

# 导出日志
GET /_export?format=json|csv&from=2026-03-01

# 清理旧日志
POST /_cleanup?days=30

# 归档日志
POST /_archive
```

---

## 实现优先级

### Phase 1: 基础存储 (MVP)
- [ ] SQLite 存储
- [ ] 批量写入
- [ ] 基础查询 API

### Phase 2: 优化
- [ ] 敏感信息脱敏
- [ ] 索引优化
- [ ] 定期清理

### Phase 3: 高级功能
- [ ] 自动归档
- [ ] 导出功能
- [ ] Web UI 查看器
