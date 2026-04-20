# OpenClaw Services 优化任务

**创建时间**: 2026-04-15 18:34

---

## 🔴 高优先级

### [x] 1. MiniMax 529 错误自动 fallback
- **问题**: MiniMax 过载返回 529，OpenClaw 无法响应
- **方案**: 配置 OpenClaw model fallback 格式
- **涉及**: 两台机器的 openclaw.json
- **状态**: ✅ 已配置 (2026-04-18)
- **说明**: primary=zai/glm-5, fallbacks=[minimax/MiniMax-M2.7, tencent/glm-5]

### [x] 2. 添加 Discord Webhook 告警
- **问题**: 服务故障时无通知
- **方案**: Watchdog 检测到故障时发送 Discord 通知
- **涉及**: `services/watchdog/index.js`
- **状态**: ✅ 已完成 (2026-04-17)
- **说明**: 添加 `sendDiscordAlert()` 函数，配置文件 `watchdog-webhook.json`

### [x] 3. 修复日志重复问题
- **问题**: Watchdog 每个检查项记录两次
- **涉及**: `services/watchdog/index.js`
- **状态**: ✅ 已修复 (2026-04-17)
- **修复**: 去掉 `console.log`，只保留文件写入

---

## 🟡 中优先级

### [x] 4. 同步源码到运行目录
- **问题**: 修改 `/Users/louis/workspace/openclaw-services/` 后需要手动复制
- **方案**: 添加 `scripts/sync-to-runtime.sh` 同步脚本
- **状态**: ✅ 已完成 (2026-04-18)
- **使用**: `bash scripts/sync-to-runtime.sh`

### [x] 5. 修复 pkill 模式过宽 ✅ (2026-04-20)
- **问题**: `pkill -f "(node|bun).*model-proxy"` 可能误杀其他进程
- **方案**: 使用更精确的匹配 + PID 文件优先
- **涉及**: `cli/src/index.js`, `services/watchdog/index.js`
- **修复**: `openclaw-services|openclaw.*model-proxy|openclaw-model-proxy`
- **新增**: `OPENCLAW_PROXY_PID_FILE` 环境变量支持

### [x] 6. spawn 运行时检测 ✅ (2026-04-20)
- **问题**: 硬编码 `bun`，某些环境可能没有
- **方案**: `detectRuntime()` 自动检测 bun/node
- **涉及**: `cli/src/index.js`
- **修复**: 优先 bun，fallback node，都没有时报错

### [ ] 7. 空 catch 块处理
- **问题**: 空 catch 吞掉错误，难调试
- **方案**: 添加 debug 模式日志
- **涉及**: 多个文件
- **状态**: 待修复

### [ ] 8. 硬编码路径改为可配置
- **问题**: `/tmp/openclaw-model-proxy.pid` 等硬编码
- **方案**: 使用环境变量或配置文件
- **涉及**: `services/model-proxy/src/config/index.js`
- **状态**: 待改进

---

## 🟢 低优先级

### [ ] 9. 统一日志格式
- **问题**: 不同模块日志格式不一致
- **方案**: 统一结构化日志
- **状态**: 待改进

### [ ] 10. 添加单元测试
- **问题**: 缺少测试覆盖
- **状态**: 待添加

### [ ] 11. TypeScript 重写
- **问题**: 纯 JS 缺少类型检查
- **状态**: 长期目标

---

## ✅ 已完成

### [x] Model-Proxy MiniMax OpenAI 格式支持
- **完成时间**: 2026-04-15
- **提交**: `b1c9ccf`
- **说明**: `/minimax/*` 路由支持 OpenAI 和 Anthropic 双格式

---

## 📝 任务执行顺序建议

1. **先做 2, 3** - 修复现有问题，提升稳定性
2. **再做 1** - 解决 MiniMax 过载问题
3. **然后 4, 5, 6, 7** - 代码质量改进
4. **最后 8-11** - 长期优化
