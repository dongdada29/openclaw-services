# Model-Proxy 接入与故障抢救方案

## 项目概览

| 项目 | 位置 | 功能 | 状态 |
|------|------|------|------|
| **openclaw-model-proxy** | `~/workspace/openclaw-model-proxy` | LLM API 代理服务 | ✅ 运行中 (port 3456) |
| **openclaw-watchdog** | `~/workspace/openclaw-watchdog` | 自动更新 + 故障保护 | ✅ 已部署 |

---

## 一、接入 Model-Proxy

### 步骤 1: 确认 Proxy 运行

```bash
# 检查 proxy 状态
curl http://localhost:3456/_health
# 期望输出: {"status":"ok","timestamp":"..."}

# 查看统计
curl http://localhost:3456/_stats

# 查看支持的供应商
curl http://localhost:3456/_providers
```

### 步骤 2: 备份原始配置

```bash
# 使用 watchdog 工具备份
~/workspace/scripts/model-proxy-switch.sh backup

# 或手动备份
cp ~/.openclaw/agents/main/agent/models.json ~/workspace/logs/openclaw-models-original.json
```

### 步骤 3: 修改 OpenClaw 配置

有两种方式：

#### 方式 A: 使用切换工具（推荐）

```bash
~/workspace/scripts/model-proxy-switch.sh enable
```

#### 方式 B: 手动修改

编辑 `~/.openclaw/agents/main/agent/models.json`：

```json
{
  "providers": {
    "anthropic": {
      "baseUrl": "http://localhost:3456",  // 改为 proxy
      ...
    },
    "openai": {
      "baseUrl": "http://localhost:3456",  // 改为 proxy
      ...
    }
  }
}
```

### 步骤 4: 重启 Gateway

```bash
openclaw gateway restart
```

### 步骤 5: 验证

```bash
# 发送测试消息
# 然后检查 proxy 日志
curl http://localhost:3456/_stats
```

---

## 二、故障检测与自动抢救

### 自动保护机制

Watchdog 在以下时机会检查 proxy 状态：

1. **每周日 09:00** - 更新检查时
2. **每天 09:00** - 健康检查时

### 抢救流程

```
┌─────────────────────────────────────────────────────────────┐
│                    故障抢救流程                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  检测: curl http://localhost:3456/_health                   │
│     ↓                                                        │
│  ┌─✅ 成功 → 继续                                           │
│  │                                                           │
│  └─❌ 失败 → 触发抢救                                        │
│        ↓                                                     │
│     1. 恢复原始配置                                          │
│        cp backup.json → models.json                         │
│        ↓                                                     │
│     2. 重启 Gateway                                          │
│        openclaw gateway restart                              │
│        ↓                                                     │
│     3. 记录日志                                              │
│        echo "⚠️ proxy 故障，已恢复直连" >> watchdog.log     │
│        ↓                                                     │
│     4. 尝试重启 proxy（可选）                                │
│        cd ~/workspace/openclaw-model-proxy && npm start     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 手动抢救

```bash
# 1. 立即切换回直连
~/workspace/scripts/model-proxy-switch.sh disable

# 2. 重启 Gateway
openclaw gateway restart

# 3. 检查 proxy 问题
~/workspace/scripts/model-proxy-switch.sh test

# 4. 如果需要重启 proxy
cd ~/workspace/openclaw-model-proxy
npm start
```

---

## 三、监控与告警

### 主动检查

```bash
# 查看当前状态
~/workspace/scripts/model-proxy-switch.sh status

# 输出示例:
# Proxy: ✅ 运行中 (http://localhost:3456)
# 当前 baseUrl: http://localhost:3456
# 模式: 🔀 Proxy 模式
# 备份: ✅ .../openclaw-models-original.json
```

### 日志位置

| 日志 | 路径 |
|------|------|
| Proxy 数据库 | `~/.openclaw-model-proxy/logs.db` |
| Watchdog 日志 | `~/workspace/logs/openclaw-watchdog.log` |
| Health 日志 | `~/workspace/logs/openclaw-health.log` |
| Proxy DB | `~/.openclaw-model-proxy/logs.db` |

---

## 四、常见故障场景

### 场景 1: Proxy 进程崩溃

```
症状: curl localhost:3456 无响应
检测: watchdog 每日检查发现
抢救: 自动恢复直连配置 + 重启 Gateway
恢复: 手动重启 proxy 后可再次启用
```

### 场景 2: Proxy 端口被占用

```
症状: EADDRINUSE 错误
检测: proxy 启动失败
抢救: lsof -i :3456 找到占用进程并 kill
```

### 场景 3: OpenClaw 更新后配置被覆盖

```
症状: baseUrl 恢复为原始值
检测: watchdog 检查发现 proxy 模式失效
抢救: 重新执行 enable 命令
```

### 场景 4: 数据库损坏

```
症状: SQLite 错误
检测: proxy 返回 500 错误
抢救: 
  1. rm ~/.openclaw-model-proxy/logs.db
  2. 重启 proxy（会自动重建数据库）
```

---

## 五、最佳实践

### DO ✅

- 始终保持备份文件
- 定期检查 proxy 日志
- 更新前先备份
- 测试环境先验证

### DON'T ❌

- 不要直接修改 models.json 而不备份
- 不要在 proxy 不稳定时强制启用
- 不要忽略 watchdog 的告警日志

---

## 六、快速命令参考

```bash
# 状态检查
~/workspace/scripts/model-proxy-switch.sh status

# 启用 proxy
~/workspace/scripts/model-proxy-switch.sh enable

# 禁用 proxy
~/workspace/scripts/model-proxy-switch.sh disable

# 测试 proxy
~/workspace/scripts/model-proxy-switch.sh test

# 备份配置
~/workspace/scripts/model-proxy-switch.sh backup

# 手动运行 watchdog
~/workspace/scripts/openclaw-watchdog.sh

# 手动运行健康检查
~/workspace/scripts/health-monitor.sh

# 查看 proxy 统计
curl http://localhost:3456/_stats

# 查看 proxy 日志
curl http://localhost:3456/_logs?limit=10

# 重启 proxy
cd ~/workspace/openclaw-model-proxy && npm start
```

---

## 七、紧急恢复

如果一切都不工作：

```bash
# 1. 恢复直连
cp ~/workspace/logs/openclaw-models-original.json ~/.openclaw/agents/main/agent/models.json

# 2. 重启 Gateway
openclaw gateway restart

# 3. 停止 proxy
pkill -f "node server.js"

# 4. 检查 OpenClaw
openclaw doctor
```

---

**文档版本**: 1.0  
**更新日期**: 2026-03-02  
**维护者**: OpenClaw Watchdog
