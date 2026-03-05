/**
 * 配置恢复模块
 * 
 * 功能：
 * - 从备份恢复配置
 * - 支持选择性恢复
 * - 恢复前自动备份当前配置
 */

import fs from 'fs-extra';
import path from 'path';
import unzipper from 'unzipper';
import { pipeline } from 'stream/promises';
import { createGunzip } from 'zlib';
import { createBackup } from './backup.js';

/**
 * 恢复配置
 */
export async function restoreBackup(backupPath, options = {}) {
  const {
    targetDir = process.env.HOME,
    autoBackup = true,  // 恢复前自动备份当前配置
    components = null,  // null = 全部恢复，或 ['workspace', 'openclaw']
    dryRun = false,     // 仅预览，不实际恢复
  } = options;

  // 检查备份文件是否存在
  if (!await fs.exists(backupPath)) {
    throw new Error(`Backup file not found: ${backupPath}`);
  }

  // 自动备份当前配置
  if (autoBackup && !dryRun) {
    console.log('📦 Creating backup of current configuration...');
    await createBackup({ label: 'pre-restore' });
  }

  const result = {
    success: false,
    backupPath,
    restored: {
      workspace: [],
      openclaw: [],
    },
    skipped: [],
    errors: [],
  };

  if (dryRun) {
    // 仅预览备份内容
    return await previewBackup(backupPath);
  }

  try {
    // 解压并恢复
    await fs.ensureDir('/tmp/openclaw-restore');
    
    await pipeline(
      fs.createReadStream(backupPath),
      createGunzip(),
      unzipper.Extract({ path: '/tmp/openclaw-restore' })
    );

    // 恢复 workspace 配置
    if (!components || components.includes('workspace')) {
      const workspaceBackupDir = '/tmp/openclaw-restore/workspace';
      const workspaceDir = path.join(targetDir, 'workspace');

      if (await fs.exists(workspaceBackupDir)) {
        const files = await fs.readdir(workspaceBackupDir);
        
        for (const file of files) {
          try {
            const src = path.join(workspaceBackupDir, file);
            const dest = path.join(workspaceDir, file);
            
            await fs.copy(src, dest, { overwrite: true });
            result.restored.workspace.push(file);
          } catch (err) {
            result.errors.push({ file, error: err.message });
          }
        }
      }
    }

    // 恢复 .openclaw 配置
    if (!components || components.includes('openclaw')) {
      const openclawBackupDir = '/tmp/openclaw-restore/openclaw';
      const openclawDir = path.join(targetDir, '.openclaw');

      if (await fs.exists(openclawBackupDir)) {
        const items = await fs.readdir(openclawBackupDir);
        
        for (const item of items) {
          try {
            const src = path.join(openclawBackupDir, item);
            const dest = path.join(openclawDir, item);
            
            await fs.copy(src, dest, { overwrite: true });
            result.restored.openclaw.push(item);
          } catch (err) {
            result.errors.push({ item, error: err.message });
          }
        }
      }
    }

    // 清理临时文件
    await fs.remove('/tmp/openclaw-restore');

    result.success = result.errors.length === 0;
    return result;
  } catch (err) {
    result.errors.push({ fatal: true, error: err.message });
    return result;
  }
}

/**
 * 预览备份内容
 */
async function previewBackup(backupPath) {
  // 简化版：仅读取 manifest
  const manifestPath = backupPath + '.manifest.json';
  
  try {
    const manifest = await fs.readJson(manifestPath);
    return {
      preview: true,
      backupPath,
      ...manifest,
    };
  } catch {
    return {
      preview: true,
      backupPath,
      note: 'No manifest available',
    };
  }
}

/**
 * 对比当前配置和备份
 */
export async function diffBackup(backupPath) {
  const { scanConfigStatus } = await import('./backup.js');
  const current = await scanConfigStatus();
  const backup = await previewBackup(backupPath);

  return {
    current,
    backup,
    changes: detectChanges(current, backup),
  };
}

/**
 * 检测变更
 */
function detectChanges(current, backup) {
  const changes = [];

  // 检查 workspace 文件
  for (const [file, info] of Object.entries(current.workspace)) {
    if (!info.exists) {
      changes.push({ file, change: 'deleted' });
    } else if (info.modified) {
      changes.push({ file, change: 'modified', modified: info.modified });
    }
  }

  return changes;
}
