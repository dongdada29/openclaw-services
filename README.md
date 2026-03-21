# OpenClaw Services

OpenClaw 基础设施服务统一管理。

## 快速开始

```bash
# 一键安装（远程）
curl -fsSL https://raw.githubusercontent.com/dongdada29/openclaw-services/main/scripts/install.sh | bash

# 本地安装/更新（开发）
cd ~/workspace/openclaw-services
bash scripts/install.sh --update

# 查看状态
openclaw-services status

# 启用 proxy 模式
openclaw-services proxy enable

# 健康检查
openclaw-services doctor
```

## 目录结构

```
~/.openclaw/
├── cli/
│   └── src/index.js           # CLI 工具
├── config/
│   └── openclaw.toml          # 统一配置
├── services/
│   ├── model-proxy/           # LLM API 代理
│   ├── watchdog/              # 监控服务
│   └── config-migrator/       # 配置迁移服务
├── logs/                      # 统一日志
└── data/
    └── backups/               # 配置备份
```

## LaunchAgent 服务

| 服务 | 模式 | 功能 |
|------|------|------|
| model-proxy | KeepAlive | LLM API 代理（持续运行） |
| watchdog | KeepAlive | 综合监控 + 自动故障恢复（持续运行） |
| health | 每天 9:00 | 健康检查 + 日志清理 |
| health-check | 每天 00:00 | 综合健康检查（M4） |
| backup | 每天 02:00, 14:00 | 自动备份配置（M4） |

> **注意**: watchdog 已升级为扩展版，支持 Gateway 监控和自动重启。

## 扩展版 Watchdog（v1.0.0）

### 新增监控项

```bash
# 原版功能
✅ Model-Proxy 健康检查 (localhost:3456/_health)
✅ Proxy 故障自动恢复

# 扩展版新增（M4）
✅ Gateway 进程状态检测 (pgrep)
✅ Gateway Health API 检测 (localhost:18789/health)
✅ Discord 连接状态检测 (日志分析)
✅ Gateway 崩溃自动重启
✅ 综合健康检查报告
```

### 使用方法

```bash
# 持续监控（默认 60 秒间隔）
node ~/.openclaw/services/watchdog/index.js watch

# 单次健康检查
node ~/.openclaw/services/watchdog/index.js check

# 执行自动修复
node ~/.openclaw/services/watchdog/index.js heal
```

### 日志

```bash
# 查看实时监控日志
tail -f ~/.openclaw/logs/watchdog.log

# 输出示例
[2026-03-21T07:37:29.439Z] [INFO] 👀 开始综合监控 (间隔: 60s)
[2026-03-21T07:37:29.440Z] [INFO] --- 健康检查开始 ---
[2026-03-21T07:37:29.468Z] [INFO] ✅ Proxy 正常
[2026-03-21T07:37:29.479Z] [INFO] ✅ Gateway 进程运行中
[2026-03-21T07:37:29.483Z] [INFO] ✅ Gateway 健康检查通过
[2026-03-21T07:37:29.486Z] [INFO] ✅ Discord 已连接
[2026-03-21T07:37:29.487Z] [INFO] --- 健康检查完成 ---
```

## CLI 命令

```bash
# 一键安装（首次安装或重置）
openclaw-services install

# 完整安装（含配置备份）
openclaw-services setup

# 卸载所有服务
openclaw-services uninstall

# 服务管理
openclaw-services start [服务]   # 启动服务
openclaw-services stop [服务]    # 停止服务
openclaw-services restart [服务] # 重启服务
openclaw-services status         # 查看状态

# Proxy 模式
openclaw-services proxy enable   # 启用 proxy 模式
openclaw-services proxy disable  # 禁用 proxy 模式
openclaw-services proxy test     # 测试 proxy

# 配置管理
openclaw-services config status      # 查看配置状态
openclaw-services config backup     # 创建备份
openclaw-services config list        # 列出备份
openclaw-services config restore    # 恢复备份
openclaw-services config diff       # 对比差异
openclaw-services config sync       # 同步到 NAS
openclaw-services config migrate    # 迁移到目标

# LaunchAgent 管理
openclaw-services launchd list      # 列出服务状态
openclaw-services launchd install   # 注册 LaunchAgent
openclaw-services launchd uninstall # 卸载 LaunchAgent

# 健康检查
openclaw-services doctor           # 全面诊断
openclaw-services health            # 运行健康监控
openclaw-services logs [服务]       # 查看日志
```

## 配置迁移服务

使用 `openclaw-services config` 命令统一管理：

```bash
# 查看配置状态
openclaw-services config status

# 创建备份
openclaw-services config backup --label "daily"

# 列出备份
openclaw-services config list

# 恢复备份
openclaw-services config restore [backup-file]

# 对比差异
openclaw-services config diff

# 同步到 NAS
openclaw-services config sync --nas /Volumes/SSD_M2_1/openclaw-backups

# 迁移到新机器
openclaw-services config migrate --target user@192.168.1.100:~/.openclaw
```

### 备份范围

| 类型 | 文件 |
|------|------|
| Workspace | MEMORY.md, SOUL.md, TOOLS.md, AGENTS.md, USER.md, IDENTITY.md |
| .openclaw | agents/, config/, credentials/, memory/, cron/ |

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `OPENCLAW_SERVICES_HOME` | 服务安装路径 | `~/.openclaw` |

## 开发

```bash
# 克隆仓库
git clone https://github.com/dongdada29/openclaw-services.git
cd openclaw-services

# 安装依赖
pnpm install

# 本地安装/更新（一键）
bash scripts/install.sh --update

# 仅运行 setup
bash scripts/install.sh --setup

# 运行测试
pnpm test

# 运行测试（监听模式）
pnpm test:watch

# 运行测试覆盖率
pnpm test:coverage

# 打开覆盖率报告
open coverage/index.html
```

## License

MIT
