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
curl -fsSL https://raw.githubusercontent.com/dongdada29/openclaw-watchdog/main/install.sh | bash
```

## 手动安装

```bash
# 克隆仓库
git clone https://github.com/dongdada29/openclaw-watchdog.git
cd openclaw-watchdog

# 复制脚本
cp scripts/openclaw-watchdog.sh ~/workspace/scripts/

# 安装定时任务
cp launchd/com.dongdada.openclaw-watchdog.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.dongdada.openclaw-watchdog.plist
```

## 使用方式

### 自动更新

安装后，每周日凌晨 09:00 会自动检查更新。

### 手动更新

```bash
# 手动运行更新
~/workspace/scripts/openclaw-watchdog.sh

# 检查日志
cat ~/workspace/logs/openclaw-watchdog.log
```

### 健康检查

```bash
# 手动运行健康检查
~/workspace/scripts/health-monitor.sh

# 查看日志
cat ~/workspace/logs/openclaw-health.log
```

### Model-Proxy 切换

```bash
# 查看状态
~/workspace/scripts/model-proxy-switch.sh status

# 启用 proxy 模式
~/workspace/scripts/model-proxy-switch.sh enable

# 禁用 proxy 模式（恢复直连）
~/workspace/scripts/model-proxy-switch.sh disable

# 测试 proxy
~/workspace/scripts/model-proxy-switch.sh test
```

### 通知设置

```bash
# 设置 Discord Webhook（首次）
~/workspace/scripts/openclaw-notify.sh setup

# 测试通知
~/workspace/scripts/openclaw-notify.sh test

# 手动发送通知
~/workspace/scripts/openclaw-notify.sh send "标题" "消息内容" "info"
```

### 查看状态

```bash
# 查看定时任务状态
launchctl list | grep openclaw-watchdog

# 查看当前版本
openclaw --version
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

## 文件说明

```
openclaw-watchdog/
├── README.md                    # 本文档
├── LICENSE                      # MIT License
├── install.sh                   # 一键安装脚本
├── scripts/
│   ├── openclaw-watchdog.sh     # 自动更新脚本
│   ├── health-monitor.sh        # 健康监控脚本
│   └── model-proxy-switch.sh    # Model-Proxy 切换工具
├── launchd/
│   ├── com.dongdada.openclaw-watchdog.plist  # 更新定时任务
│   └── com.dongdada.openclaw-health.plist    # 健康检查定时任务
└── docs/
    └── SKILL.md                 # OpenClaw Skill 文档
```

## 日志文件

- **更新日志**: `~/workspace/logs/openclaw-watchdog.log`
- **健康日志**: `~/workspace/logs/openclaw-health.log`
- **版本记录**: `~/workspace/logs/openclaw-version.txt`
- **配置备份**: `~/workspace/logs/openclaw-config-backup.tar.gz`
- **原始配置**: `~/workspace/logs/openclaw-models-original.json`

## 故障排除

### npm: command not found

如果日志中出现这个错误，说明脚本找不到 npm。修复：

```bash
# 检查脚本开头的 PATH 设置
head -10 ~/workspace/scripts/openclaw-watchdog.sh
```

### Gateway 未授权

```bash
openclaw gateway restart
```

### 手动回滚

```bash
# 恢复配置备份
cd ~
tar -xzf ~/workspace/logs/openclaw-config-backup.tar.gz

# 安装特定版本
npm install -g openclaw@2026.2.26
```

## 版本历史

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.3.0 | 2026-03-02 | 添加通知系统 (Discord/macOS) |
| 1.2.0 | 2026-03-02 | 添加 model-proxy 保护机制 |
| 1.1.0 | 2026-03-02 | 重命名为 openclaw-watchdog |
| 1.0.1 | 2026-03-02 | 修复 launchd PATH 问题 |
| 1.0.0 | 2026-02-24 | 初始版本 |

## License

MIT License - 详见 [LICENSE](LICENSE)

## 相关项目

- [OpenClaw](https://github.com/openclaw/openclaw) - AI Agent 框架
- [openclaw-model-proxy](https://github.com/dongdada29/openclaw-model-proxy) - LLM API 代理
