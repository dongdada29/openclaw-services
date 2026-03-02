# 日志存储方案对比

## 方案概览

| 方案 | 复杂度 | 查询性能 | 存储效率 | 适用规模 | 维护成本 |
|------|--------|---------|---------|---------|---------|
| **SQLite** | ⭐ | ⭐⭐⭐ | ⭐⭐⭐ | <10万条 | 低 |
| **JSON Lines** | ⭐ | ⭐ | ⭐⭐ | <1万条 | 最低 |
| **DuckDB** | ⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | <100万条 | 低 |
| **LevelDB** | ⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ | <1000万条 | 中 |
| **PostgreSQL** | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | 无限 | 高 |
| **ClickHouse** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 亿级 | 高 |
| **MongoDB** | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ | 千万级 | 中 |

---

## 方案详解

### 1. JSON Lines (.jsonl) - 最简单

**原理**: 每行一个 JSON 对象

```
{"timestamp":"2026-03-01T14:00:00Z","provider":"zai","model":"glm-5",...}
{"timestamp":"2026-03-01T14:01:00Z","provider":"anthropic","model":"claude",...}
```

**优点**:
- 零依赖，纯文件
- 易于备份和迁移
- 支持流式追加
- 人类可读

**缺点**:
- 查询需要全表扫描
- 无索引，大数据集慢
- 无事务支持

**适用场景**: 
- 开发调试
- 数据量 < 1万条
- 临时分析

**示例代码**:
```javascript
import fs from 'fs';

function appendLog(data) {
  fs.appendFileSync('logs.jsonl', JSON.stringify(data) + '\n');
}

function queryLogs(filter) {
  const lines = fs.readFileSync('logs.jsonl', 'utf-8').split('\n');
  return lines
    .filter(Boolean)
    .map(JSON.parse)
    .filter(filter);
}
```

---

### 2. SQLite - 推荐方案 ⭐

**原理**: 嵌入式关系数据库

**优点**:
- 零配置，单文件
- 支持 SQL 查询
- 支持索引
- 事务支持
- 广泛支持

**缺点**:
- 并发写入限制
- 单文件大小限制

**适用场景**: 
- 中等规模 (< 10万条/月)
- 需要复杂查询
- 单机部署

**示例代码**:
```javascript
import Database from 'better-sqlite3';

const db = new Database('logs.db');

// 批量插入
const insert = db.prepare(`
  INSERT INTO requests (timestamp, provider, model, status)
  VALUES (@timestamp, @provider, @model, @status)
`);

const insertMany = db.transaction((logs) => {
  for (const log of logs) insert.run(log);
});

insertMany(logs);
```

---

### 3. DuckDB - 高性能分析

**原理**: 嵌入式分析数据库，专为 OLAP 设计

**优点**:
- 列式存储，分析查询极快
- 支持 SQL
- 支持直接查询 JSON/Parquet
- 单文件，零配置
- 比SQLite快10-100倍（分析场景）

**缺点**:
- 不适合高并发写入
- 相对较新

**适用场景**: 
- 大规模日志分析
- 实时统计报表
- 数据导出

**示例代码**:
```javascript
import { Database } from 'duckdb';

const db = new Database(':memory:');
db.exec(`
  CREATE TABLE requests AS 
  SELECT * FROM read_json_auto('logs.jsonl');
  
  SELECT provider, COUNT(*) as count, 
         SUM(input_tokens) as tokens
  FROM requests
  GROUP BY provider
`);
```

---

### 4. LevelDB - 键值存储

**原理**: Google 的嵌入式 KV 数据库

**优点**:
- 极高的写入性能
- 支持范围查询
- 自动压缩
- 支持大数据量

**缺点**:
- 无 SQL，需要自己实现查询
- 单线程写入

**适用场景**: 
- 高频写入
- 时序数据
- 简单查询

**示例代码**:
```javascript
import { Level } from 'level';

const db = new Level('./logs-db', { valueEncoding: 'json' });

// 写入
await db.put(`log:${Date.now()}`, logData);

// 范围查询
for await (const [key, value] of db.iterator({
  gte: 'log:2026-03-01',
  lte: 'log:2026-03-02',
})) {
  console.log(value);
}
```

---

### 5. PostgreSQL - 企业级

**原理**: 完整的关系数据库

**优点**:
- 功能强大
- 支持分区表
- 支持时序扩展（TimescaleDB）
- 高并发
- 数据压缩

**缺点**:
- 需要服务器
- 配置复杂
- 资源消耗大

**适用场景**: 
- 大规模生产环境
- 多应用共享
- 复杂查询需求

**示例代码**:
```javascript
import { Pool } from 'pg';

const pool = new Pool({
  host: 'localhost',
  database: 'logs',
});

// 使用 TimescaleDB 扩展
await pool.query(`
  CREATE EXTENSION IF NOT EXISTS timescaledb;
  
  CREATE TABLE requests (
    timestamp TIMESTAMPTZ NOT NULL,
    provider TEXT,
    model TEXT,
    input_tokens INT,
    output_tokens INT
  );
  
  SELECT create_hypertable('requests', 'timestamp');
`);
```

---

### 6. ClickHouse - 时序分析之王

**原理**: 专为时序数据分析设计的列式数据库

**优点**:
- 亿级数据秒级查询
- 极高压缩比 (10:1)
- 支持实时聚合
- 完美支持时序数据

**缺点**:
- 学习曲线陡峭
- 需要 Docker 或服务器
- 不适合频繁更新

**适用场景**: 
- 超大规模日志
- 实时监控
- 数据仓库

**示例代码**:
```javascript
import { createClient } from '@clickhouse/client';

const client = createClient({
  host: 'http://localhost:8123',
});

await client.insert({
  table: 'requests',
  values: logs,
  format: 'JSONEachRow',
});

// 查询
const result = await client.query(`
  SELECT 
    toStartOfDay(timestamp) as day,
    provider,
    count() as requests,
    sum(input_tokens) as tokens
  FROM requests
  GROUP BY day, provider
  ORDER BY day DESC
`);
```

---

### 7. MongoDB - 文档数据库

**原理**: 文档型 NoSQL 数据库

**优点**:
- 灵活的 Schema
- 内置过期索引（TTL）
- 水平扩展
- 丰富的查询

**缺点**:
- 内存占用高
- 聚合查询复杂

**适用场景**: 
- 异构数据
- 快速迭代
- 云部署

**示例代码**:
```javascript
import { MongoClient } from 'mongodb';

const client = new MongoClient('mongodb://localhost:27017');
const collection = client.db('logs').collection('requests');

// 插入
await collection.insertMany(logs);

// TTL 索引（自动删除30天前的数据）
await collection.createIndex(
  { timestamp: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60 }
);

// 聚合查询
const stats = await collection.aggregate([
  { $match: { timestamp: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } } },
  { $group: { _id: '$provider', count: { $sum: 1 }, tokens: { $sum: '$input_tokens' } } }
]);
```

---

## 混合方案

### 方案 A: SQLite + JSON Lines

```
热数据 (最近1天) → SQLite (快速查询)
冷数据 (历史)    → JSON Lines 压缩归档
```

### 方案 B: LevelDB + DuckDB

```
写入 → LevelDB (高吞吐)
分析 → 定期导出到 DuckDB (高性能分析)
```

### 方案 C: PostgreSQL + TimescaleDB

```
PostgreSQL + TimescaleDB 扩展
- 自动分区
- 自动压缩
- 自动过期
```

---

## 推荐选择

| 场景 | 推荐方案 |
|------|---------|
| **个人开发/调试** | JSON Lines |
| **中小规模生产** | SQLite |
| **大规模分析** | DuckDB |
| **高频写入** | LevelDB |
| **企业级生产** | PostgreSQL + TimescaleDB |
| **超大规模监控** | ClickHouse |

---

## 针对当前项目的建议

考虑到:
1. 单机部署
2. 中等数据量 (< 1万条/天)
3. 需要 Web UI 查询
4. 低维护成本

**推荐方案**:

1. **首选**: SQLite
   - 简单、稳定、够用

2. **进阶**: DuckDB
   - 更好的分析性能
   - 可以直接查询 JSON Lines 归档

3. **如果数据量大**: PostgreSQL + TimescaleDB
   - 专业时序处理
   - 自动过期

