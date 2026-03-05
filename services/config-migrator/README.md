# OpenClaw Config Migrator

OpenClaw 配置备份、恢复、迁移服务。

## 功能

- **备份**: 打包所有 OpenClaw 配置文件
- **恢复**: 从备份恢复配置
- **迁移**: 迁移配置到新机器
- **同步**: 增量同步到 NAS

## 备份范围

### Workspace 配置

| 文件 | 说明 |
|------|------|
| MEMORY.md | 长期记忆 |
| SOUL.md | 身份人格 |
| TOOLS.md | 工具说明 |
| AGENTS.md | 工作空间规则 |
| USER.md | 用户信息 |
| IDENTITY.md | 身份定义 |
| HEARTBEAT.md | 心跳任务 |

### .openclaw 配置

| 目录/文件 | 说明 |
|-----------|------|
| agents/ | Agent 配置 |
| config/ | TOML 配置 |
| credentials/ | 凭证文件 |
| memory/ | 记忆目录 |
| cron/ | 定时任务 |
| openclaw.json | 主配置 |

## 使用

```bash
# 查看配置状态
openclaw-services config status

# 创建备份
openclaw-services config backup

# 列出备份
openclaw-services config list

# 恢复备份
openclaw-services config restore [backup-file]

# 同步到 NAS
openclaw-services config sync --nas /path/to/nas

# 迁移到新机器
openclaw-services config migrate --target user@host:/path

# 对比差异
openclaw-services config diff [backup-file]
```

## 选项

```bash
--label <name>      备份标签
--include-logs      包含日志
--dry-run           仅预览
--nas <path>        NAS 路径
--target <target>   迁移目标
```

## 示例

### 备份并同步

```bash
# 创建备份
openclaw-services config backup --label "daily"

# 同步到 NAS
openclaw-services config sync --nas /Volumes/SSD_M2_1/openclaw-backups
```

### 迁移到新机器

```bash
# 迁移到远程机器
openclaw-services config migrate --target user@192.168.1.100:~/.openclaw

# 在新机器上恢复
openclaw-services config restore
```

### 定时备份

添加到 crontab:

```bash
# 每天凌晨 3 点备份
0 3 * * * /Users/louis/.local/bin/openclaw-services config backup --label daily
```

## 备份存储

备份文件存储在: `~/.openclaw/data/backups/`

格式: `openclaw-config-YYYY-MM-DDTHH-mm-ss[-label].tar.gz`

## 恢复策略

恢复时自动:
1. 备份当前配置 (pre-restore)
2. 解压备份文件
3. 恢复 workspace 配置
4. 恢复 .openclaw 配置
5. 清理临时文件

## API

```javascript
import { createBackup, restoreBackup, listBackups } from '@openclaw/config-migrator';

// 创建备份
const backup = await createBackup({ label: 'test' });

// 列出备份
const backups = await listBackups();

// 恢复备份
const result = await restoreBackup(backups[0].path);
```
