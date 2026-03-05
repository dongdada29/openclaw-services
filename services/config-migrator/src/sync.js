/**
 * 配置同步模块
 * 
 * 功能：
 * - 双向同步
 * - 冲突检测
 * - 定时同步
 */

import fs from 'fs-extra';
import path from 'path';
import { scanConfigStatus } from './backup.js';

/**
 * 同步状态
 */
export async function getSyncStatus(nasPath) {
  const local = await scanConfigStatus();
  const remote = await scanRemoteStatus(nasPath);

  return {
    local: {
      totalSize: local.totalSize,
      fileCount: Object.keys(local.workspace).length,
      lastModified: getLastModified(local),
    },
    remote: {
      connected: remote.connected,
      totalSize: remote.totalSize,
      lastModified: remote.lastModified,
    },
    syncNeeded: local.totalSize !== remote.totalSize || 
      getLastModified(local) > remote.lastModified,
  };
}

/**
 * 扫描远程状态
 */
async function scanRemoteStatus(nasPath) {
  try {
    if (!nasPath) {
      return { connected: false };
    }

    const exists = await fs.exists(nasPath);
    if (!exists) {
      return { connected: false };
    }

    // 扫描远程配置
    const remoteWorkspace = path.join(nasPath, 'workspace');
    let totalSize = 0;
    let lastModified = new Date(0);

    const files = ['MEMORY.md', 'SOUL.md', 'TOOLS.md', 'AGENTS.md', 'USER.md'];
    
    for (const file of files) {
      const filePath = path.join(remoteWorkspace, file);
      try {
        const stat = await fs.stat(filePath);
        totalSize += stat.size;
        if (stat.mtime > lastModified) {
          lastModified = stat.mtime;
        }
      } catch {
        // 文件不存在
      }
    }

    return {
      connected: true,
      totalSize,
      lastModified,
    };
  } catch {
    return { connected: false };
  }
}

/**
 * 获取最后修改时间
 */
function getLastModified(status) {
  let lastModified = new Date(0);
  
  for (const [file, info] of Object.entries(status.workspace)) {
    if (info.modified && info.modified > lastModified) {
      lastModified = info.modified;
    }
  }
  
  return lastModified;
}

/**
 * 检测冲突
 */
export async function detectConflicts(nasPath) {
  const local = await scanConfigStatus();
  const remote = await scanRemoteStatus(nasPath);

  const conflicts = [];

  if (!remote.connected) {
    return { hasConflicts: false, conflicts: [] };
  }

  // 检查每个文件
  for (const [file, localInfo] of Object.entries(local.workspace)) {
    if (!localInfo.exists) continue;

    const remoteFile = path.join(nasPath, 'workspace', file);
    try {
      const remoteStat = await fs.stat(remoteFile);
      
      // 两边都有修改
      if (localInfo.modified && remoteStat.mtime) {
        const localTime = new Date(localInfo.modified).getTime();
        const remoteTime = new Date(remoteStat.mtime).getTime();
        
        // 如果差距小于 1 分钟，可能同时修改
        if (Math.abs(localTime - remoteTime) < 60000 && localTime !== remoteTime) {
          conflicts.push({
            file,
            localModified: localInfo.modified,
            remoteModified: remoteStat.mtime,
            type: 'simultaneous',
          });
        }
      }
    } catch {
      // 远程文件不存在，无冲突
    }
  }

  return {
    hasConflicts: conflicts.length > 0,
    conflicts,
  };
}

/**
 * 智能同步（自动解决冲突）
 */
export async function smartSync(nasPath, options = {}) {
  const {
    strategy = 'newer',  // newer | local | remote | ask
    dryRun = false,
  } = options;

  const conflicts = await detectConflicts(nasPath);
  const syncResult = {
    uploaded: [],
    downloaded: [],
    skipped: [],
    conflicts: conflicts.conflicts,
  };

  if (conflicts.hasConflicts) {
    for (const conflict of conflicts.conflicts) {
      const localTime = new Date(conflict.localModified).getTime();
      const remoteTime = new Date(conflict.remoteModified).getTime();

      let action;
      if (strategy === 'newer') {
        action = localTime > remoteTime ? 'upload' : 'download';
      } else if (strategy === 'local') {
        action = 'upload';
      } else if (strategy === 'remote') {
        action = 'download';
      } else {
        action = 'skip';
      }

      if (action === 'skip') {
        syncResult.skipped.push(conflict.file);
      } else if (!dryRun) {
        const localPath = path.join(process.env.HOME, 'workspace', conflict.file);
        const remotePath = path.join(nasPath, 'workspace', conflict.file);

        if (action === 'upload') {
          await fs.copy(localPath, remotePath, { overwrite: true });
          syncResult.uploaded.push(conflict.file);
        } else {
          await fs.copy(remotePath, localPath, { overwrite: true });
          syncResult.downloaded.push(conflict.file);
        }
      }
    }
  }

  return syncResult;
}
