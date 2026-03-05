/**
 * 配置迁移模块
 * 
 * 功能：
 * - 迁移配置到新机器
 * - 支持通过 SSH 迁移
 * - 支持通过 NAS 同步
 */

import fs from 'fs-extra';
import path from 'path';
import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
import { createBackup, listBackups } from './backup.js';

const exec = promisify(execCallback);

/**
 * 迁移配置到目标机器
 */
export async function migrateToTarget(target, options = {}) {
  const {
    method = 'ssh',     // ssh | nas | local
    includeLogs = false,
    verifyAfterMigrate = true,
  } = options;

  // 先创建备份
  console.log('📦 Creating backup...');
  const backup = await createBackup({ includeLogs, label: 'migration' });

  if (!backup.success) {
    throw new Error('Failed to create backup');
  }

  const result = {
    success: false,
    backup,
    target,
    method,
    transferred: false,
    verified: false,
    errors: [],
  };

  try {
    if (method === 'ssh') {
      // 通过 SCP 传输
      const { host, user, path: targetPath } = parseTarget(target);
      
      console.log(`📤 Transferring to ${user}@${host}:${targetPath}...`);
      
      const { stdout, stderr } = await exec(
        `scp "${backup.path}" "${user}@${host}:${targetPath}/"`
      );
      
      // 传输 manifest
      await exec(
        `scp "${backup.path}.manifest.json" "${user}@${host}:${targetPath}/"`
      );
      
      result.transferred = true;
      result.stdout = stdout;
      
    } else if (method === 'nas') {
      // 同步到 NAS
      const nasPath = target || process.env.OPENCLAW_NAS_PATH;
      
      if (!nasPath) {
        throw new Error('NAS path not specified. Set OPENCLAW_NAS_PATH or provide target.');
      }
      
      console.log(`📤 Syncing to NAS: ${nasPath}...`);
      
      await fs.ensureDir(nasPath);
      await fs.copy(backup.path, path.join(nasPath, path.basename(backup.path)));
      await fs.copy(backup.path + '.manifest.json', 
        path.join(nasPath, path.basename(backup.path) + '.manifest.json'));
      
      result.transferred = true;
      
    } else if (method === 'local') {
      // 本地复制
      await fs.ensureDir(target);
      await fs.copy(backup.path, path.join(target, path.basename(backup.path)));
      await fs.copy(backup.path + '.manifest.json', 
        path.join(target, path.basename(backup.path) + '.manifest.json'));
      
      result.transferred = true;
    }

    result.success = true;
    return result;
  } catch (err) {
    result.errors.push(err.message);
    return result;
  }
}

/**
 * 解析目标字符串
 */
function parseTarget(target) {
  // 格式: user@host:/path
  const match = target.match(/^([^@]+)@([^:]+):(.+)$/);
  
  if (!match) {
    throw new Error(`Invalid target format: ${target}. Expected: user@host:/path`);
  }
  
  return {
    user: match[1],
    host: match[2],
    path: match[3],
  };
}

/**
 * 从 NAS 同步配置
 */
export async function syncFromNas(options = {}) {
  const {
    nasPath = process.env.OPENCLAW_NAS_PATH,
    dryRun = false,
  } = options;

  if (!nasPath) {
    throw new Error('NAS path not specified. Set OPENCLAW_NAS_PATH or provide nasPath.');
  }

  // 获取 NAS 上的最新备份
  const nasBackups = await fs.readdir(nasPath)
    .then(files => files.filter(f => f.endsWith('.tar.gz')))
    .catch(() => []);

  if (nasBackups.length === 0) {
    return {
      success: false,
      message: 'No backups found on NAS',
    };
  }

  // 排序获取最新的
  const latestBackup = nasBackups.sort().reverse()[0];
  const backupPath = path.join(nasPath, latestBackup);

  return {
    success: true,
    nasPath,
    latestBackup,
    backupPath,
    dryRun,
    message: dryRun 
      ? `Would sync ${latestBackup} from NAS`
      : `Found ${latestBackup} on NAS, ready to restore`,
  };
}

/**
 * 增量同步到 NAS
 */
export async function incrementalSync(options = {}) {
  const {
    nasPath = process.env.OPENCLAW_NAS_PATH || '/Volumes/SSD_M2_1/openclaw-backups',
    workspaceDir = process.env.HOME + '/workspace',
  } = options;

  const result = {
    success: false,
    synced: [],
    skipped: [],
    errors: [],
  };

  try {
    await fs.ensureDir(nasPath);

    // 同步 workspace 配置文件
    const workspaceFiles = [
      'MEMORY.md', 'SOUL.md', 'TOOLS.md', 'AGENTS.md', 
      'USER.md', 'IDENTITY.md', 'HEARTBEAT.md',
    ];

    for (const file of workspaceFiles) {
      const src = path.join(workspaceDir, file);
      const dest = path.join(nasPath, 'workspace', file);

      try {
        if (await fs.exists(src)) {
          await fs.ensureDir(path.dirname(dest));
          await fs.copy(src, dest, { overwrite: true });
          result.synced.push(file);
        }
      } catch (err) {
        result.errors.push({ file, error: err.message });
      }
    }

    // 同步 .openclaw 关键目录
    const openclawDirs = ['agents', 'config', 'credentials', 'memory'];
    
    for (const dir of openclawDirs) {
      const src = path.join(process.env.HOME, '.openclaw', dir);
      const dest = path.join(nasPath, 'openclaw', dir);

      try {
        if (await fs.exists(src)) {
          await fs.ensureDir(dest);
          await fs.copy(src, dest, { overwrite: true });
          result.synced.push(`openclaw/${dir}/`);
        }
      } catch (err) {
        result.errors.push({ dir, error: err.message });
      }
    }

    result.success = result.errors.length === 0;
    return result;
  } catch (err) {
    result.errors.push({ fatal: true, error: err.message });
    return result;
  }
}
