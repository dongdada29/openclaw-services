---
name: watchdog
description: |
  检查并升级 OpenClaw 到最新版本。每周日凌晨自动检查更新。
  用于: (1) 检查当前版本, (2) 升级到最新版本, (3) 查看更新日志
---

# Watchdog Skill

## 检查当前版本

```bash
openclaw --version
```

## 升级 OpenClaw

```bash
# 方式1: 使用 npm 全局更新
npm update -g openclaw

# 方式2: 重新安装
npm install -g openclaw

# 方式3: 使用 pnpm
pnpm update -g openclaw
```

## 检查更新

```bash
# 查看可用更新
openclaw status
```

## 版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| 2026.2.23 | 2026-02-24 | 当前最新版本 |
| 2026.2.19-2 | 2026-02-19 | 之前版本 |

## 定期检查

### ✅ 已设置每周日凌晨自动检查更新

- **任务**: com.dongdada.watchdog
- **运行时间**: 每周日 09:00
- **日志**: ~/workspace/logs/watchdog.log

```bash
# 状态
launchctl list | grep openclaw

# 查看日志
cat ~/workspace/logs/watchdog.log

# 手动运行
~/workspace/scripts/watchdog.sh

# 停止定时任务
launchctl unload ~/Library/LaunchAgents/com.dongdada.watchdog.plist
```

## 常见问题

### Gateway 未授权
如果遇到 `unauthorized: device token mismatch`：
```bash
openclaw gateway restart
```

### 更新后问题
```bash
openclaw gateway stop
openclaw gateway start
```

## 使用示例

1. "检查 OpenClaw 版本"
2. "升级 OpenClaw"
3. "更新到最新版本"
4. "查看更新日志"
