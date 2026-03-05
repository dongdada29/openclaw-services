#!/usr/bin/env node
/**
 * OpenClaw Config Migrator
 * 
 * 配置备份、恢复、迁移服务
 * 
 * Usage:
 *   openclaw-services config backup
 *   openclaw-services config restore [backup-file]
 *   openclaw-services config status
 *   openclaw-services config sync --nas
 *   openclaw-services config migrate --target user@host:/path
 */

import {
  createBackup,
  listBackups,
  scanConfigStatus,
  cleanupOldBackups,
} from './src/backup.js';

import {
  restoreBackup,
  diffBackup,
} from './src/restore.js';

import {
  migrateToTarget,
  syncFromNas,
  incrementalSync,
} from './src/migrate.js';

import {
  getSyncStatus,
  detectConflicts,
  smartSync,
} from './src/sync.js';

const commands = {
  status: async () => {
    const status = await scanConfigStatus();
    
    console.log('\n📦 OpenClaw 配置状态\n');
    
    console.log('Workspace 配置:');
    for (const [file, info] of Object.entries(status.workspace)) {
      if (info.exists) {
        const size = formatSize(info.size);
        const modified = new Date(info.modified).toLocaleString();
        console.log(`  ✅ ${file} (${size}, ${modified})`);
      } else {
        console.log(`  ⬜ ${file} (不存在)`);
      }
    }
    
    console.log('\n.openclaw 目录:');
    for (const [dir, info] of Object.entries(status.openclaw.dirs)) {
      if (info.exists) {
        console.log(`  ✅ ${dir}/ (${info.fileCount} 个文件)`);
      } else {
        console.log(`  ⬜ ${dir}/ (不存在)`);
      }
    }
    
    console.log('\n.openclaw 文件:');
    for (const [file, info] of Object.entries(status.openclaw.files)) {
      if (info.exists) {
        const size = formatSize(info.size);
        console.log(`  ✅ ${file} (${size})`);
      } else {
        console.log(`  ⬜ ${file} (不存在)`);
      }
    }
    
    console.log(`\n总大小: ${formatSize(status.totalSize)}`);
  },

  backup: async (options) => {
    console.log('📦 创建备份...');
    
    const result = await createBackup({
      label: options.label,
      includeLogs: options.includeLogs,
    });
    
    if (result.success) {
      console.log(`✅ 备份成功: ${result.path}`);
      console.log(`   大小: ${formatSize(result.size)}`);
      
      // 清理旧备份
      const cleanup = await cleanupOldBackups(10);
      if (cleanup.deleted > 0) {
        console.log(`   已清理 ${cleanup.deleted} 个旧备份`);
      }
    } else {
      console.error('❌ 备份失败');
    }
  },

  restore: async (backupFile, options) => {
    const backups = await listBackups();
    
    let targetBackup;
    if (backupFile) {
      targetBackup = backups.find(b => b.file === backupFile);
      if (!targetBackup) {
        console.error(`❌ 找不到备份: ${backupFile}`);
        console.log('可用备份:');
        for (const b of backups.slice(0, 5)) {
          console.log(`  - ${b.file}`);
        }
        return;
      }
    } else {
      // 使用最新备份
      if (backups.length === 0) {
        console.error('❌ 没有可用的备份');
        return;
      }
      targetBackup = backups[0];
    }
    
    console.log(`📦 恢复备份: ${targetBackup.file}`);
    
    const result = await restoreBackup(targetBackup.path, {
      autoBackup: options.autoBackup !== false,
      components: options.components,
      dryRun: options.dryRun,
    });
    
    if (result.success) {
      console.log('✅ 恢复成功');
      console.log(`   Workspace: ${result.restored.workspace.length} 个文件`);
      console.log(`   .openclaw: ${result.restored.openclaw.length} 个项目`);
    } else {
      console.error('❌ 恢复失败');
      for (const err of result.errors) {
        console.error(`   ${err.file || err.item}: ${err.error}`);
      }
    }
  },

  list: async () => {
    const backups = await listBackups();
    
    console.log('\n📦 备份列表\n');
    
    if (backups.length === 0) {
      console.log('  暂无备份');
      return;
    }
    
    for (const backup of backups) {
      const size = formatSize(backup.size);
      const time = new Date(backup.timestamp).toLocaleString();
      const label = backup.label ? ` [${backup.label}]` : '';
      console.log(`  ${backup.file}${label}`);
      console.log(`    大小: ${size} | 时间: ${time}`);
    }
  },

  sync: async (options) => {
    const nasPath = options.nas || process.env.OPENCLAW_NAS_PATH || '/Volumes/SSD_M2_1/openclaw-backups';
    
    console.log('🔄 同步配置到 NAS...');
    console.log(`   目标: ${nasPath}`);
    
    const result = await incrementalSync({ nasPath });
    
    if (result.success) {
      console.log('✅ 同步成功');
      console.log(`   已同步: ${result.synced.length} 个项目`);
    } else {
      console.error('❌ 同步失败');
      for (const err of result.errors) {
        console.error(`   ${err.file || err.dir}: ${err.error}`);
      }
    }
  },

  migrate: async (options) => {
    const target = options.target;
    
    if (!target) {
      console.error('❌ 请指定目标: --target user@host:/path 或 --target /local/path');
      return;
    }
    
    const method = target.includes('@') ? 'ssh' : 'local';
    
    console.log(`🚀 迁移配置到: ${target}`);
    console.log(`   方式: ${method}`);
    
    const result = await migrateToTarget(target, { method });
    
    if (result.success) {
      console.log('✅ 迁移成功');
      console.log(`   备份: ${result.backup.path}`);
      console.log(`   传输: ${result.transferred ? '完成' : '失败'}`);
    } else {
      console.error('❌ 迁移失败');
      for (const err of result.errors) {
        console.error(`   ${err}`);
      }
    }
  },

  diff: async (backupFile) => {
    const backups = await listBackups();
    
    if (backups.length === 0) {
      console.error('❌ 没有可用的备份');
      return;
    }
    
    const targetBackup = backupFile 
      ? backups.find(b => b.file === backupFile)
      : backups[0];
    
    if (!targetBackup) {
      console.error(`❌ 找不到备份: ${backupFile}`);
      return;
    }
    
    const result = await diffBackup(targetBackup.path);
    
    console.log('\n📊 配置对比\n');
    console.log(`备份: ${targetBackup.file}`);
    console.log(`时间: ${targetBackup.timestamp}`);
    
    if (result.changes.length === 0) {
      console.log('\n✅ 无差异');
    } else {
      console.log('\n变更:');
      for (const change of result.changes) {
        console.log(`  ${change.change}: ${change.file}`);
      }
    }
  },
};

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}

// CLI 入口
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  const options = {};
  let targetArg = null;
  
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      options[key] = args[++i] || true;
    } else {
      targetArg = args[i];
    }
  }
  
  if (commands[command]) {
    await commands[command](targetArg, options);
  } else {
    console.log(`
OpenClaw Config Migrator

用法:
  openclaw-services config <command> [options]

命令:
  status              查看配置状态
  backup              创建备份
  restore [file]      恢复备份
  list                列出备份
  sync --nas [path]   同步到 NAS
  migrate --target    迁移到目标
  diff [file]         对比差异

选项:
  --label <name>      备份标签
  --include-logs      包含日志
  --dry-run           仅预览
  --nas <path>        NAS 路径
  --target <target>   迁移目标
`);
  }
}

main().catch(console.error);
