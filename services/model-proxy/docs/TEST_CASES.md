# Model-Proxy 测试用例

## 测试环境

- Proxy URL: `http://localhost:3456`
- 数据库: `~/.openclaw-model-proxy/logs.db`

---

## 1. 功能测试

### 1.1 健康检查

```bash
# 测试
curl http://localhost:3456/_health

# 期望
{"status":"ok","timestamp":"2026-03-02T..."}
```

### 1.2 统计信息

```bash
# 测试
curl http://localhost:3456/_stats

# 期望
{
  "totalRequests": N,
  "byProvider": {...},
  "byModel": {...},
  "totalTokens": {"input": N, "output": N},
  "period": "day"
}
```

### 1.3 供应商列表

```bash
# 测试
curl http://localhost:3456/_providers

# 期望
[
  {"id": "zai", "name": "z.ai Global", ...},
  {"id": "zhipu", "name": "智谱 AI", ...},
  ...
]
```

---

## 2. 供应商检测测试

### 2.1 通过 X-Provider 头检测

```bash
# 测试
curl -X POST http://localhost:3456/v1/chat/completions \
  -H "X-Provider: zai" \
  -H "Authorization: Bearer test-key" \
  -d '{"model":"glm-5","messages":[{"role":"user","content":"hi"}]}'

# 期望: 路由到 api.z.ai
```

### 2.2 通过 API Key 前缀检测

```bash
# Anthropic (sk-ant-)
curl -X POST http://localhost:3456/v1/chat/completions \
  -H "Authorization: Bearer sk-ant-test123" \
  -d '{"model":"claude-3","messages":[{"role":"user","content":"hi"}]}'

# OpenAI (sk-proj-)
curl -X POST http://localhost:3456/v1/chat/completions \
  -H "Authorization: Bearer sk-proj-test123" \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"hi"}]}'

# z.ai (zai_)
curl -X POST http://localhost:3456/v1/chat/completions \
  -H "Authorization: Bearer zai_test123" \
  -d '{"model":"glm-5","messages":[{"role":"user","content":"hi"}]}'
```

### 2.3 通过路径模式检测

```bash
# Anthropic /v1/messages
curl http://localhost:3456/v1/messages ...

# z.ai /api/paas/v4/chat/completions
curl -X POST http://localhost:3456/api/paas/v4/chat/completions ...
```

---

## 3. 故障抢救测试

### 3.1 模拟 Proxy 崩溃

```bash
# 1. 停止 proxy
pkill -f "node.*openclaw-model-proxy"

# 2. 验证检测
~/workspace/scripts/model-proxy-switch.sh status
# 期望: Proxy: ❌ 未运行

# 3. 运行恢复
~/workspace/scripts/model-proxy-switch.sh recover
# 期望: ✅ 紧急恢复完成

# 4. 验证直连模式
~/workspace/scripts/model-proxy-switch.sh status
# 期望: 模式: 🔗 直连模式
```

### 3.2 自动重启测试

```bash
# 1. 确保备份存在
~/workspace/scripts/model-proxy-switch.sh backup

# 2. 停止 proxy
pkill -f "node.*openclaw-model-proxy"

# 3. 运行 watchdog
~/workspace/scripts/openclaw-watchdog.sh

# 期望输出:
# ⚠️ model-proxy 无响应
# ⚠️ 恢复直连配置...
# 🔄 尝试重启 model-proxy...
# ✅ model-proxy 重启成功
```

---

## 4. 切换工具测试

### 4.1 status 命令

```bash
~/workspace/scripts/model-proxy-switch.sh status

# 期望输出包含:
# Proxy:  ✅/❌
# 模式:   🔀 Proxy / 🔗 直连
# 备份:   ✅/❌
```

### 4.2 enable 命令

```bash
# 前置: 确保是直连模式
~/workspace/scripts/model-proxy-switch.sh status

# 执行
~/workspace/scripts/model-proxy-switch.sh enable

# 期望:
# ✅ 已切换到 proxy 模式
# Proxy URL: http://localhost:3456
# 🔄 重启 Gateway...
```

### 4.3 disable 命令

```bash
~/workspace/scripts/model-proxy-switch.sh disable

# 期望:
# ✅ 已恢复直连模式
# 🔄 重启 Gateway...
```

### 4.4 test 命令

```bash
~/workspace/scripts/model-proxy-switch.sh test

# 期望:
# 1. 健康检查...
#    ✅ Proxy 响应正常
# 2. 统计端点...
#    ✅ 统计端点正常
# 3. 供应商列表...
#    ✅ 供应商列表正常
```

### 4.5 recover 命令

```bash
~/workspace/scripts/model-proxy-switch.sh recover

# 期望:
# 🚨 紧急恢复...
# 1. 停止 proxy...
# 2. 恢复直连配置...
#    ✅ 配置已恢复
# 3. 重启 Gateway...
# 4. 运行健康检查...
# ✅ 紧急恢复完成
```

---

## 5. OpenClaw 集成测试

### 5.1 切换到 Proxy 模式

```bash
# 1. 启用 proxy
~/workspace/scripts/model-proxy-switch.sh enable

# 2. 检查 models.json
grep "baseUrl" ~/.openclaw/agents/main/agent/models.json | head -3
# 期望: "baseUrl": "http://localhost:3456"

# 3. 发送测试消息

# 4. 检查 proxy 日志
curl http://localhost:3456/_stats
# 期望: totalRequests 增加
```

### 5.2 切换回直连模式

```bash
# 1. 禁用 proxy
~/workspace/scripts/model-proxy-switch.sh disable

# 2. 检查 models.json
grep "baseUrl" ~/.openclaw/agents/main/agent/models.json | head -3
# 期望: "baseUrl": "https://api.xxx.com" (原始地址)

# 3. 发送测试消息

# 4. 检查 proxy 日志
curl http://localhost:3456/_stats
# 期望: totalRequests 不变（直连不经过 proxy）
```

---

## 6. 性能测试

### 6.1 并发请求

```bash
# 发送 10 个并发请求
for i in {1..10}; do
  curl -X POST http://localhost:3456/v1/chat/completions \
    -H "Authorization: Bearer sk-test-$i" \
    -d '{"model":"gpt-4o","messages":[{"role":"user","content":"test"}]}' \
    > /dev/null 2>&1 &
done
wait

# 检查统计
curl -s http://localhost:3456/_stats | grep totalRequests
# 期望: totalRequests 增加了 10
```

### 6.2 批量写入验证

```bash
# 发送请求
for i in {1..60}; do
  curl -s -X POST http://localhost:3456/v1/chat/completions \
    -H "Authorization: Bearer sk-test" \
    -d '{"model":"gpt-4o","messages":[{"role":"user","content":"test"}]}' \
    > /dev/null
done

# 等待 6 秒（超过 flushInterval）
sleep 6

# 检查日志
curl -s "http://localhost:3456/_logs?limit=100" | grep -c "id"
# 期望: >= 60
```

---

## 7. 安全测试

### 7.1 API Key 脱敏

```bash
# 发送请求
curl -X POST http://localhost:3456/v1/chat/completions \
  -H "Authorization: Bearer sk-proj-supersecret123456" \
  -d '{"model":"gpt-4o","messages":[{"role":"user","content":"hi"}]}'

# 检查日志（不应该包含完整 key）
curl -s http://localhost:3456/_logs?limit=1

# 期望: auth 字段应该类似 "Bearer sk-proj-...3456"
# 而不是 "Bearer sk-proj-supersecret123456"
```

---

## 8. 回归测试清单

每次更新后运行：

- [ ] 健康检查 `/_health`
- [ ] 统计信息 `/_stats`
- [ ] 供应商列表 `/_providers`
- [ ] 供应商检测（5 个供应商）
- [ ] 切换 enable/disable
- [ ] 故障恢复 recover
- [ ] OpenClaw 集成
- [ ] 并发请求
- [ ] 批量写入
- [ ] API Key 脱敏

---

**文档版本**: 1.0  
**更新日期**: 2026-03-02
