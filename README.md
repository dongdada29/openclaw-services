# OpenClaw Services

OpenClaw 基础设施服务统一管理。

## 快速开始

```bash
# 一键安装（最新版本）
curl -fsSL https://raw.githubusercontent.com/dongdada29/openclaw-services/main/scripts/install.sh | bash

# 指定版本安装
curl -fsSL https://raw.githubusercontent.com/dongdada29/openclaw-services/main/scripts/install.sh | bash -s -- v1.0.8

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
openclaw-services start [服务]   # 启动服务 (proxy | watchdog)
openclaw-services stop [服务]    # 停止服务
openclaw-services restart [服务] # 重启服务
openclaw-services status         # 查看状态

# Proxy 模式
openclaw-services proxy enable   # 启用 proxy 模式
openclaw-services proxy disable  # 禁用 proxy 模式（恢复直连）
openclaw-services proxy test     # 测试 proxy

# 健康检查
openclaw-services doctor         # 全面诊断
openclaw-services logs [服务]    # 查看日志
openclaw-services health         # 运行健康监控
openclaw-services watchdog       # 运行 watchdog
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

# 运行测试
pnpm test

# 本地构建
bash scripts/build.sh

# 发布新版本
# 1. 更新 package.json 版本号
# 2. git commit -m "Bump version to x.x.x"
# 3. git tag vx.x.x && git push origin main --tags
```

## 从旧版本迁移

如果你之前使用 `~/workspace/scripts/` 和 `~/workspace/openclaw-model-proxy/`：

```bash
# 安装新版本
curl -fsSL https://raw.githubusercontent.com/dongdada29/openclaw-services/main/scripts/install.sh | bash

# 停止旧服务
launchctl unload ~/Library/LaunchAgents/com.dongdada.openclaw-*.plist 2>/dev/null

# 加载新服务（可选）
launchctl load ~/.openclaw/launchd/com.openclaw.*.plist

# 验证
openclaw-services status
openclaw-services doctor
```

## License

MIT
