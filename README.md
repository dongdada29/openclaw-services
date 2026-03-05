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
│   └── watchdog/              # 监控服务
├── logs/                      # 统一日志
└── data/
    └── backups/               # 配置备份
```

## LaunchAgent 服务

| 服务 | 调度 | 功能 |
|------|------|------|
| model-proxy | KeepAlive | LLM API 代理（持续运行） |
| watchdog | 每周日 9:00 | 自动更新 OpenClaw |
| health | 每天 9:00 | 健康检查 + 日志清理 |

## CLI 命令

```bash
# 一键设置（首次安装或重置）
openclaw-services setup

# 服务管理
openclaw-services start [服务]   # 启动服务
openclaw-services stop [服务]    # 停止服务
openclaw-services restart [服务] # 重启服务
openclaw-services status         # 查看状态

# Proxy 模式
openclaw-services proxy enable   # 启用 proxy 模式
openclaw-services proxy disable  # 禁用 proxy 模式
openclaw-services proxy test     # 测试 proxy

# LaunchAgent 管理
openclaw-services launchd list     # 列出服务状态
openclaw-services launchd install  # 注册 LaunchAgent
openclaw-services launchd uninstall # 卸载 LaunchAgent

# 健康检查
openclaw-services doctor         # 全面诊断
openclaw-services logs [服务]    # 查看日志
```

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
```

## License

MIT
