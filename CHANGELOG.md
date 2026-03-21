# Changelog

All notable changes to the openclaw-services project will be documented in this file.

## [1.2.0] - 2026-03-21

### Added
- **扩展版 Watchdog** - 支持 Gateway 监控
  - Gateway 进程状态检测
  - Gateway Health API 检测
  - Discord 连接状态检测
  - 自动重启故障 Gateway
  - 综合健康检查功能
  - 自动修复机制

- **M4 健康检查脚本** (`~/.openclaw/scripts/health_check.sh`)
  - Gateway 进程检查
  - Gateway Health API 检查
  - Discord 连接检查
  - 磁盘空间检查
  - 配置文件完整性检查
  - 服务进程检查
  - 自动重启故障服务

- **M4 自动备份脚本** (`~/.openclaw/scripts/backup_config.sh`)
  - 配置文件备份
  - launchd plist 备份
  - credentials 备份
  - agents 配置备份
  - 状态快照
  - 自动清理旧备份（保留 30 天）

- **M4 定时任务**
  - `com.openclaw.health-check` - 每天 00:00 健康检查
  - `com.openclaw.backup` - 每天 02:00, 14:00 自动备份

### Changed
- **M4 Gateway 配置优化**
  - 添加 `healthMonitor` 配置
  - 磁盘空间检查间隔从 5 分钟改为 10 分钟
  - 禁用 `restartOnDisconnect` (待验证)

- **M4 MiniMax-M2.5 配置**
  - 配置 MiniMax-M2.5 作为主模型
  - 添加 API Key
  - 配置 auth profile

- **M1 MiniMax-M2.5 备选**
  - 添加 MiniMax-M2.5 作为备选模型
  - 配置 fallbacks 链

### Fixed
- **M4 Discord Token 恢复**
  - 从备份恢复 M4 Discord bot token
  - 修复 M4 Discord 连接问题

- **M4 Watchdog 崩溃问题**
  - 修复 launchd plist 中的 node 路径
  - 从 `/usr/bin/env node` 改为 `/opt/homebrew/opt/node@22/bin/node`

### Technical Details
- **M4 OpenClaw 版本**: 2026.3.13 (61d171a)
- **M1 OpenClaw 版本**: 2026.3.13 (61d171a)
- **Watchdog 版本**: v1.2.0 (扩展版)
- **支持的 Node 版本**: v22.x

### Known Issues
- **日志重复**: 日志中每个检查项出现两次（待修复）
- **Discord 时间窗口**: Discord 连接检查缺少时间窗口验证（待改进）

---

## [1.1.0] - 2026-03-15

### Added
- OpenClaw Services 项目初始化
- Model-Proxy 服务（LLM API 代理）
- Watchdog 服务（基础版，只监控 Proxy）
- 配置迁移服务
- CLI 工具

### Changed
- Watchdog 改为持续运行模式（每 60 秒检查一次）

---

## [1.0.0] - 2026-03-08

### Added
- 项目创建
- 基础架构搭建

---

## [Unreleased]

### Planned
- 添加通知机制（Discord Webhook）
- 改进 Discord 连接检查（增加时间窗口）
- 添加监控指标（Prometheus）
- 添加单元测试
- 添加类型定义（TypeScript）
- 优雅关闭机制
