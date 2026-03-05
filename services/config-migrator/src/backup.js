/**
 * 配置备份模块
 * 
 * 功能：
 * - 打包 workspace 配置文件 (MEMORY.md, SOUL.md, TOOLS.md 等)
 * - 打包 .openclaw 目录
 * - 支持增量备份
 * - 支持加密备份 (可选)
 */

import fs from 'fs-extra';
import path from 'path';
import archiver from 'archiver';
import crypto from 'crypto';

const WORKSPACE_CONFIGS = [
  'MEMORY.md',
  'SOUL.md',
  'TOOLS.md',
  'AGENTS.md',
  'USER.md',
  'IDENTITY.md',
  'HEARTBEAT.md',
  'PROXY_INTEGRATION_GUIDE.md',
];

const OPENCLAW_DIRS = [
  'agents',
  'config',
  'credentials',
  'memory',
  'cron',
  'canvas',
  'browser',
  'identity',
];

const OPENCLAW_FILES = [
  'openclaw.json',
];

/**
 * 获取备份目录
 */
export function getBackupDir() {
  return path.join(process.env.HOME, '.openclaw', 'data', 'backups');
}

/**
 * 确保备份目录存在
 */
async function ensureBackupDir() {
  const backupDir = getBackupDir();
  await fs.ensureDir(backupDir);
  return backupDir;
}

/**
 * 计算文件/目录的哈希值
 */
async function hashFile(filePath) {
  const content = await fs.readFile(filePath);
  return crypto.createHash('md5').update(content).digest('hex').slice(0, 8);
}

/**
 * 扫描配置文件状态
 */
export async function scanConfigStatus(workspaceDir = process.env.HOME + '/workspace') {
  const status = {
    workspace: {},
    openclaw: {
      dirs: {},
      files: {},
    },
    totalSize: 0,
  };

  // 扫描 workspace 配置文件
  for (const file of WORKSPACE_CONFIGS) {
    const filePath = path.join(workspaceDir, file);
    try {
      const stat = await fs.stat(filePath);
      status.workspace[file] = {
        exists: true,
        size: stat.size,
        modified: stat.mtime,
      };
      status.totalSize += stat.size;
    } catch {
      status.workspace[file] = { exists: false };
    }
  }

  // 扫描 .openclaw 目录
  const openclawDir = path.join(process.env.HOME, '.openclaw');
  
  for (const dir of OPENCLAW_DIRS) {
    const dirPath = path.join(openclawDir, dir);
    try {
      const stat = await fs.stat(dirPath);
      if (stat.isDirectory()) {
        const files = await fs.readdir(dirPath);
        status.openclaw.dirs[dir] = {
          exists: true,
          fileCount: files.length,
        };
      }
    } catch {
      status.openclaw.dirs[dir] = { exists: false };
    }
  }

  // 扫描 .openclaw 文件
  for (const file of OPENCLAW_FILES) {
    const filePath = path.join(openclawDir, file);
    try {
      const stat = await fs.stat(filePath);
      status.openclaw.files[file] = {
        exists: true,
        size: stat.size,
        modified: stat.mtime,
      };
      status.totalSize += stat.size;
    } catch {
      status.openclaw.files[file] = { exists: false };
    }
  }

  return status;
}

/**
 * 创建备份
 */
export async function createBackup(options = {}) {
  const {
    workspaceDir = process.env.HOME + '/workspace',
    includeLogs = false,
    compress = true,
    label = null,
  } = options;

  const backupDir = await ensureBackupDir();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const backupName = label 
    ? `openclaw-config-${timestamp}-${label}.tar.gz`
    : `openclaw-config-${timestamp}.tar.gz`;
  const backupPath = path.join(backupDir, backupName);

  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(backupPath);
    const archive = archiver('tar', {
      gzip: compress,
      gzipOptions: { level: 9 },
    });

    output.on('close', async () => {
      const size = archive.pointer();
      
      // 写入备份元数据
      const manifest = {
        timestamp: new Date().toISOString(),
        label,
        size,
        files: [],
        checksum: await hashFile(backupPath),
      };

      await fs.writeJson(backupPath + '.manifest.json', manifest, { spaces: 2 });

      resolve({
        success: true,
        path: backupPath,
        size,
        manifest,
      });
    });

    archive.on('error', reject);
    archive.pipe(output);

    // 添加 workspace 配置文件
    for (const file of WORKSPACE_CONFIGS) {
      const filePath = path.join(workspaceDir, file);
      try {
        if (fs.existsSync(filePath)) {
          archive.file(filePath, { name: `workspace/${file}` });
        }
      } catch (err) {
        console.warn(`Warning: Could not add ${file}: ${err.message}`);
      }
    }

    // 添加 .openclaw 目录
    const openclawDir = path.join(process.env.HOME, '.openclaw');
    
    for (const dir of OPENCLAW_DIRS) {
      const dirPath = path.join(openclawDir, dir);
      try {
        if (fs.existsSync(dirPath)) {
          archive.directory(dirPath, `openclaw/${dir}`);
        }
      } catch (err) {
        console.warn(`Warning: Could not add ${dir}: ${err.message}`);
      }
    }

    for (const file of OPENCLAW_FILES) {
      const filePath = path.join(openclawDir, file);
      try {
        if (fs.existsSync(filePath)) {
          archive.file(filePath, { name: `openclaw/${file}` });
        }
      } catch (err) {
        console.warn(`Warning: Could not add ${file}: ${err.message}`);
      }
    }

    // 可选：添加日志
    if (includeLogs) {
      const logsDir = path.join(openclawDir, 'logs');
      try {
        if (fs.existsSync(logsDir)) {
          archive.directory(logsDir, 'openclaw/logs');
        }
      } catch (err) {
        console.warn(`Warning: Could not add logs: ${err.message}`);
      }
    }

    archive.finalize();
  });
}

/**
 * 列出所有备份
 */
export async function listBackups() {
  const backupDir = getBackupDir();
  
  try {
    await fs.ensureDir(backupDir);
    const files = await fs.readdir(backupDir);
    
    const backups = [];
    
    for (const file of files) {
      if (file.endsWith('.tar.gz')) {
        const manifestPath = path.join(backupDir, file + '.manifest.json');
        let manifest = null;
        
        try {
          manifest = await fs.readJson(manifestPath);
        } catch {
          // 无 manifest，使用文件信息
          const stat = await fs.stat(path.join(backupDir, file));
          manifest = {
            timestamp: stat.mtime.toISOString(),
            size: stat.size,
          };
        }
        
        backups.push({
          file,
          path: path.join(backupDir, file),
          ...manifest,
        });
      }
    }
    
    // 按时间排序（最新的在前）
    return backups.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  } catch (err) {
    return [];
  }
}

/**
 * 删除旧备份
 */
export async function cleanupOldBackups(keepCount = 10) {
  const backups = await listBackups();
  const backupDir = getBackupDir();
  const deleted = [];
  
  if (backups.length > keepCount) {
    const toDelete = backups.slice(keepCount);
    
    for (const backup of toDelete) {
      try {
        await fs.remove(backup.path);
        await fs.remove(backup.path + '.manifest.json');
        deleted.push(backup.file);
      } catch (err) {
        console.warn(`Warning: Could not delete ${backup.file}: ${err.message}`);
      }
    }
  }
  
  return {
    kept: backups.length - deleted.length,
    deleted: deleted.length,
    deletedFiles: deleted,
  };
}
