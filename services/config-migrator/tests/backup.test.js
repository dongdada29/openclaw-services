import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs-extra';
import path from 'path';
import { scanConfigStatus, createBackup, listBackups, cleanupOldBackups } from '../src/backup.js';

describe('Backup Module', () => {
  beforeAll(async () => {
    // 确保测试环境
    await fs.ensureDir(path.join(process.env.HOME, '.openclaw', 'data', 'backups'));
  });

  it('should scan config status', async () => {
    const status = await scanConfigStatus();
    
    expect(status).toHaveProperty('workspace');
    expect(status).toHaveProperty('openclaw');
    expect(status).toHaveProperty('totalSize');
    
    // 检查 workspace 配置
    expect(status.workspace).toHaveProperty('MEMORY.md');
    expect(status.workspace).toHaveProperty('SOUL.md');
  });

  it('should create backup', async () => {
    const result = await createBackup({ label: 'test' });
    
    expect(result.success).toBe(true);
    expect(result.path).toBeDefined();
    expect(result.size).toBeGreaterThan(0);
    
    // 清理测试备份
    if (result.path) {
      await fs.remove(result.path);
      await fs.remove(result.path + '.manifest.json');
    }
  });

  it('should list backups', async () => {
    // 先创建一个备份
    await createBackup({ label: 'list-test' });
    
    const backups = await listBackups();
    
    expect(Array.isArray(backups)).toBe(true);
    expect(backups.length).toBeGreaterThan(0);
    
    // 清理
    for (const backup of backups.filter(b => b.label === 'list-test')) {
      await fs.remove(backup.path);
      await fs.remove(backup.path + '.manifest.json');
    }
  });

  it('should cleanup old backups', async () => {
    // 创建多个备份
    for (let i = 0; i < 3; i++) {
      await createBackup({ label: `cleanup-test-${i}` });
    }
    
    const result = await cleanupOldBackups(2);
    
    expect(result.kept).toBeLessThanOrEqual(2);
  });
});
