/**
 * 导出工具 - 定时导出日志到文件
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getConfig } from '../config/index.js';
import { exportToJsonl, exportToMarkdown, getStats } from '../db/repository.js';

// 默认导出目录
const DEFAULT_EXPORT_DIR = path.join(os.homedir(), 'logs', 'model-proxy');

/**
 * 确保目录存在
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * 执行导出
 */
export function runExport() {
  const config = getConfig();
  const exportConfig = config.get('export') || {};
  
  if (!exportConfig.enabled) {
    return { skipped: true, reason: 'Export disabled' };
  }
  
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const month = date.slice(0, 7);
  
  // 导出目录：~/logs/model-proxy/2026-03/
  const baseDir = exportConfig.dir || DEFAULT_EXPORT_DIR;
  const exportDir = path.join(baseDir, month);
  ensureDir(exportDir);
  
  const results = {
    timestamp: now.toISOString(),
    dir: exportDir,
    files: [],
  };
  
  try {
    // 导出 JSONL
    const jsonlPath = path.join(exportDir, `requests-${date}.jsonl`);
    const jsonlData = exportToJsonl(10000);
    fs.writeFileSync(jsonlPath, jsonlData.content);
    results.files.push({
      type: 'jsonl',
      path: jsonlPath,
      size: jsonlData.content.length,
      records: jsonlData.exported,
    });
    
    // 导出 Markdown 报告
    const mdPath = path.join(exportDir, `report-${date}.md`);
    const mdContent = exportToMarkdown(100);
    fs.writeFileSync(mdPath, mdContent);
    results.files.push({
      type: 'markdown',
      path: mdPath,
      size: mdContent.length,
    });
    
    // 记录导出日志
    const logPath = path.join(baseDir, 'export.log');
    const stats = getStats();
    const logLine = `${now.toISOString()} - 导出完成: ${stats.totalRequests} 请求\n`;
    fs.appendFileSync(logPath, logLine);
    
    // 清理旧文件
    cleanupOldExports(baseDir, exportConfig.retentionDays || 30);
    
    results.success = true;
  } catch (err) {
    results.success = false;
    results.error = err.message;
  }
  
  return results;
}

/**
 * 清理旧的导出文件
 */
function cleanupOldExports(baseDir, retentionDays) {
  const cutoff = Date.now() - retentionDays * 24 * 60 * 60 * 1000;
  
  try {
    const months = fs.readdirSync(baseDir).filter(f => /^\d{4}-\d{2}$/.test(f));
    
    for (const month of months) {
      const monthDir = path.join(baseDir, month);
      const files = fs.readdirSync(monthDir);
      
      for (const file of files) {
        const filePath = path.join(monthDir, file);
        const stat = fs.statSync(filePath);
        
        if (stat.mtimeMs < cutoff) {
          fs.unlinkSync(filePath);
        }
      }
      
      // 如果月份目录为空，删除它
      if (fs.readdirSync(monthDir).length === 0) {
        fs.rmdirSync(monthDir);
      }
    }
  } catch (err) {
    // 忽略清理错误
    console.warn('Export cleanup error:', err.message);
  }
}

/**
 * 检查是否应该执行导出
 * @param {string} schedule - 格式 "hour minute" 如 "0 5" 表示 00:05
 * @returns {boolean}
 */
export function shouldExport(schedule) {
  const now = new Date();
  const [hour, minute] = schedule.split(' ').map(Number);
  
  return now.getHours() === hour && now.getMinutes() === minute;
}

export default { runExport, shouldExport };
