# OpenClaw Services 项目状态报告

**生成时间**: 2026-03-21 15:40  
**报告类型**: 项目状态 + 技术债务分析

---

## 📊 项目概览

```
项目名称: openclaw-services
项目位置: /Volumes/SSD_M2_1/workspace/openclaw-services
版本: 2026.3.21
状态: 活跃开发
```

---

## 🖥️ 双机部署状态

### M1 (192.168.31.12) - Mac mini M1 (16GB)

| 服务 | 状态 | PID | 说明 |
|------|------|-----|------|
| Gateway | ✅ 运行中 | 88859 | OpenClawM1 (GLM-5) |
| Model-Proxy | ✅ 运行中 | 19819 | API 代理 v1.4.0 |
| Watchdog | ✅ 运行中 | 62628 | 原版 (只监控 Proxy) |
| Health | ⏸️ 定时 | - | 每天 9:00 |

**配置**:
- 主模型: `zai/glm-5`
- 备选模型: `minimax/MiniMax-M2.5`
- Discord Bot: OpenClawM1

---

### M4 (192.168.31.10) - Mac mini M4 (16GB)

| 服务 | 状态 | PID | 说明 |
|------|------|-----|------|
| Gateway | ✅ 运行中 | 50354 | OpenClawM4 (MiniMax-M2.5) |
| Model-Proxy | ✅ 运行中 | 35820 | API 代理 v1.4.0 |
| Watchdog | ✅ 运行中 | 51072 | **扩展版** (综合监控) |
| Health-Check | ⏸️ 定时 | - | 每天 00:00 |
| Backup | ⏸️ 定时 | - | 每天 02:00, 14:00 |

**配置**:
- 主模型: `minimax/MiniMax-M2.5`
- Discord Bot: OpenClawM4

---

## 🆕 扩展版 Watchdog 功能

### 新增监控项

```javascript
// 原版 (M1)
✅ Model-Proxy 健康检查 (localhost:3456/_health)
✅ Proxy 故障自动恢复

// 扩展版 (M4)
✅ Model-Proxy 健康检查 (localhost:3456/_health)
✅ Gateway 进程状态 (pgrep -f openclaw-gateway)
✅ Gateway Health API (localhost:18789/health)
✅ Discord 连接状态 (日志分析)
✅ Gateway 崩溃自动重启
✅ 综合健康检查报告
```

### 自动修复机制

```
┌─────────────────────────────────────────┐
│         扩展版 Watchdog 工作流程          │
├─────────────────────────────────────────┤
│                                         │
│  每 60 秒执行一次                         │
│  ├─ 检查 Proxy                          │
│  ├─ 检查 Gateway 进程                   │
│  ├─ 检查 Gateway Health                 │
│  └─ 检查 Discord 连接                   │
│                                         │
│  故障时自动修复:                          │
│  ├─ Gateway 进程不存在 → 自动重启        │
│  ├─ Gateway Health 失败 → 自动重启      │
│  └─ 重启后验证 → 确保修复成功             │
│                                         │
└─────────────────────────────────────────┘
```

---

## 📁 项目结构

```
openclaw-services/
├── cli/                        # CLI 工具
│   └── src/index.js
├── config/                     # 配置管理
│   └── openclaw.toml
├── services/                   # 服务模块
│   ├── model-proxy/           # LLM API 代理
│   │   ├── server.js
│   │   └── package.json
│   ├── watchdog/              # 监控服务
│   │   ├── index.js           # 扩展版 (M4)
│   │   ├── index.js.bak       # 原版备份
│   │   └── scripts/
│   └── config-migrator/       # 配置迁移
├── launchd/                    # 系统服务配置
│   ├── com.openclaw.model-proxy.plist
│   ├── com.openclaw.watchdog.plist
│   └── com.openclaw.health.plist
├── scripts/                    # 安装脚本
│   └── install.sh
├── CHANGELOG.md               # 变更日志
├── README.md                   # 项目文档
└── package.json
```

---

## 📈 技术债务

### 高优先级

| 问题 | 影响 | 状态 |
|------|------|------|
| 日志重复 | 每个检查项记录两次 | ⏳ 待修复 |
| 缺少通知机制 | 故障时无告警 | ⏳ 待添加 |
| Discord 时间窗口 | 检查不准确 | ⏳ 待改进 |

### 中优先级

| 问题 | 影响 | 状态 |
|------|------|------|
| 配置硬编码 | 难以维护 | ⏳ 待改进 |
| 缺少优雅关闭 | 进程可能僵死 | ⏳ 待添加 |
| 重启逻辑单一 | 可能失败 | ⏳ 待改进 |

### 低优先级

| 问题 | 影响 | 状态 |
|------|------|------|
| 缺少单元测试 | 质量保证 | ⏳ 待添加 |
| 缺少类型定义 | 代码提示 | ⏳ 待添加 |
| 缺少监控指标 | 可观测性 | ⏳ 待添加 |

---

## 🔧 配置文件

### M4 Watchdog 配置

**位置**: `~/Library/LaunchAgents/com.openclaw.watchdog.plist`

**关键修复**:
```xml
<!-- 修复前 -->
<string>/usr/bin/env</string>
<string>node</string>

<!-- 修复后 -->
<string>/opt/homebrew/opt/node@22/bin/node</string>
```

### M4 Gateway 配置

**位置**: `~/.openclaw/openclaw.json`

**新增**:
```json
{
  "gateway": {
    "healthMonitor": {
      "enabled": true,
      "interval": 600,
      "startupGrace": 120,
      "channelConnectGrace": 300,
      "restartOnDisconnect": false
    }
  },
  "models": {
    "providers": {
      "minimax": {
        "baseUrl": "https://api.minimaxi.com/v1",
        "api": "openai-completions",
        "apiKey": "sk-cp-***",
        "models": [
          {
            "id": "MiniMax-M2.5",
            "name": "MiniMax M2.5 (CN Coding Plan)",
            "reasoning": true,
            "contextWindow": 128000
          }
        ]
      }
    }
  },
  "agents": {
    "defaults": {
      "model": {
        "primary": "minimax/MiniMax-M2.5"
      }
    }
  }
}
```

---

## 📝 运维脚本

### M4 健康检查脚本

**位置**: `~/.openclaw/scripts/health_check.sh`

**功能**:
- Gateway 进程检查
- Gateway Health API 检查
- Discord 连接检查
- 磁盘空间检查
- 配置文件完整性检查
- 服务进程检查
- 自动重启故障服务

### M4 自动备份脚本

**位置**: `~/.openclaw/scripts/backup_config.sh`

**备份内容**:
- `openclaw.json` + 所有备份文件
- launchd plist 文件
- credentials 目录
- agents 配置文件
- 当前状态快照

**存储**: `/Volumes/SSD_M2_1/workspace/openclaw-m4-backup/YYYYMMDD_HHMMSS/`  
**保留**: 30 天

---

## 🚀 下一步计划

### 短期（本周）

- [ ] 修复日志重复问题
- [ ] 添加 Discord Webhook 告警
- [ ] 改进 Discord 连接检查（时间窗口）
- [ ] 添加配置化支持

### 中期（本月）

- [ ] 添加单元测试
- [ ] 添加优雅关闭机制
- [ ] 改进重启逻辑（多种方法）
- [ ] 添加监控指标

### 长期

- [ ] TypeScript 重写
- [ ] Web UI 监控面板
- [ ] 集群监控支持
- [ ] 自动扩容

---

## 📚 文档

- [CHANGELOG.md](./CHANGELOG.md) - 变更日志
- [README.md](./README.md) - 项目文档
- [CODE_REVIEW.md](./CODE_REVIEW.md) - 代码审查

---

## 📞 联系方式

**项目维护者**: dongdada29  
**Discord**: @dongdada29  
**GitHub**: https://github.com/dongdada29/openclaw-services

---

**最后更新**: 2026-03-21 15:40
