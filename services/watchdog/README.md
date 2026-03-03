# OpenClaw Watchdog 🐕

OpenClaw 的守护工具，包含自动更新、健康监控和 model-proxy 保护。

## 组件

| 组件 | 功能 | 时间 |
|------|------|------|
| **Watchdog** | 自动更新 + 回滚 | 每周日 09:00 |
| **Health Monitor** | 健康检查 + 清理 | 每天 09:00 |
| **Proxy Protection** | model-proxy 故障保护 | 实时 |
| **Notification** | 故障/恢复通知 | 实时 |

## 特性

### Watchdog (自动更新)
- ✅ 每周日凌晨 09:00 自动检查更新
- ✅ 更新失败自动回滚到之前版本
- ✅ 配置自动备份
- ✅ **model-proxy 故障自动切换直连**
- ✅ **Discord/macOS 通知**

### Health Monitor (健康监控)
- ✅ 使用 `openclaw doctor` 进行完整检查
- ✅ Gateway 状态检测 + 自动修复
- ✅ 日志文件清理

### Model-Proxy 保护
- ✅ 自动检测 proxy 是否存活
- ✅ proxy 故障时自动恢复直连配置
- ✅ 提供手动切换工具
- ✅ 故障/恢复时发送通知

### 通知系统
- ✅ macOS 原生通知
- ✅ Discord Webhook
- ✅ 支持 info/warning/error 级别

## 快速安装

```bash
# 安装 OpenClaw Services（包含 watchdog）
curl -fsSL https://raw.githubusercontent.com/dongdada29/openclaw-services/main/scripts/install.sh | bash
```

## 使用方式

### 通过 CLI

```bash
# 健康检查
openclaw-services doctor

# 查看状态
openclaw-services status

# Proxy 模式切换
openclaw-services proxy enable   # 启用 proxy 模式
openclaw-services proxy disable  # 禁用 proxy 模式
openclaw-services proxy test     # 测试 proxy

# 查看日志
openclaw-services logs proxy
openclaw-services logs watchdog
```

### 直接运行脚本

```bash
# 查看状态
~/.openclaw/services/watchdog/scripts/model-proxy-switch.sh status

# 启用 proxy 模式
~/.openclaw/services/watchdog/scripts/model-proxy-switch.sh enable

# 禁用 proxy 模式（恢复直连）
~/.openclaw/services/watchdog/scripts/model-proxy-switch.sh disable

# 通知设置
~/.openclaw/services/watchdog/scripts/openclaw-notify.sh setup
```

## 工作流程

```
┌─────────────────────────────────────────────────────────────┐
│                   OpenClaw Watchdog                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. 记录当前版本                                             │
│     ↓                                                        │
│  2. 备份配置 (~/.openclaw)                                   │
│     ↓                                                        │
│  3. 执行 npm update -g openclaw                              │
│     ↓                                                        │
│  4. 测试新版本                                               │
│     ├─✅ 成功 → 完成                                         │
│     └─❌ 失败 → 自动回滚                                     │
│                 ↓                                            │
│           恢复配置 + 重启 Gateway                            │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## 目录结构

```
~/.openclaw/
├── services/
│   └── watchdog/
│       ├── index.js              # Watchdog 主程序
│       └── scripts/
│           ├── openclaw-watchdog.sh     # 自动更新脚本
│           ├── health-monitor.sh        # 健康监控脚本
│           ├── model-proxy-switch.sh    # Proxy 切换工具
│           └── openclaw-notify.sh       # 通知脚本
├── launchd/
│   ├── com.openclaw.watchdog.plist      # 更新定时任务
│   └── com.openclaw.health.plist        # 健康检查定时任务
├── logs/
│   ├── watchdog.log
│   ├── health.log
│   └── model-proxy.log
└── data/
    ├── openclaw-models-original.json    # 原始配置备份
    └── backups/
```

## 日志文件

| 文件 | 路径 |
|------|------|
| 更新日志 | `~/.openclaw/logs/watchdog.log` |
| 健康日志 | `~/.openclaw/logs/health.log` |
| Proxy 日志 | `~/.openclaw/logs/model-proxy.log` |
| 原始配置 | `~/.openclaw/data/openclaw-models-original.json` |

## 故障排除

### npm: command not found

launchd 环境需要设置 PATH。脚本已自动设置：
```bash
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
```

### Gateway 未授权

```bash
openclaw gateway restart
```

### 手动回滚

```bash
# 恢复配置备份
cd ~
# 配置备份在 ~/.openclaw/data/backups/

# 安装特定版本
npm install -g openclaw@2026.2.26
```

## License

MIT License
