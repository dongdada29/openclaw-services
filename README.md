# OpenClaw Services

OpenClaw 基础设施服务统一管理。

## 快速开始

```bash
# 一键安装
curl -fsSL https://raw.githubusercontent.com/dongdada29/openclaw-services/main/scripts/install.sh | bash

# 查看状态
openclaw-services status

# 启用 proxy 模式
openclaw-services proxy enable

# 健康检查
openclaw-services doctor
```

## 目录结构

```
~/.openclaw/services/
├── config/
│   └── openclaw.toml          # 统一配置
├── services/
│   ├── model-proxy/           # LLM API 代理
│   └── watchdog/              # 监控服务
├── cli/
│   └── src/index.js           # CLI 工具
├── launchd/
│   ├── com.openclaw.model-proxy.plist
│   ├── com.openclaw.watchdog.plist
│   └── com.openclaw.health.plist
├── logs/                      # 统一日志
├── data/
│   └── backups/               # 配置备份
└── scripts/
    └── install.sh             # 安装脚本
```

## CLI 命令

```bash
# 服务管理
openclaw-services install        # 安装所有服务
openclaw-services start [服务]   # 启动服务
openclaw-services stop [服务]    # 停止服务
openclaw-services status         # 查看状态

# Proxy 模式
openclaw-services proxy enable   # 启用 proxy 模式
openclaw-services proxy disable  # 禁用 proxy 模式
openclaw-services proxy test     # 测试 proxy

# 健康检查
openclaw-services doctor         # 全面诊断
openclaw-services logs [服务]    # 查看日志
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `OPENCLAW_SERVICES_HOME` | 服务安装路径 | `~/.openclaw/services` |

## 从旧版本迁移

如果你之前使用 `~/workspace/scripts/` 和 `~/workspace/openclaw-model-proxy/`：

```bash
# 安装新版本
curl -fsSL https://raw.githubusercontent.com/dongdada29/openclaw-services/main/scripts/install.sh | bash

# 停止旧服务
launchctl unload ~/Library/LaunchAgents/com.dongdada.openclaw-*.plist

# 加载新服务
launchctl load ~/.openclaw/services/launchd/com.openclaw.*.plist

# 验证
openclaw-services status
```

## License

MIT
