/**
 * OpenClaw Model API Proxy - 入口文件
 * 
 * 分层架构:
 *   - config/    配置管理
 *   - db/        数据库层
 *   - providers/ 供应商检测
 *   - proxy/     代理处理
 *   - api/       API 路由
 *   - utils/     工具函数
 */
import http from 'http';

import { initConfig, getConfig } from './src/config/index.js';
import { initDatabase, closeDatabase } from './src/db/index.js';
import { initCache } from './src/db/cache.js';
import { flushBatch, getPendingCount } from './src/db/repository.js';
import { handleProxyRequest } from './src/proxy/handler.js';
import { handleApiRequest } from './src/api/routes.js';

// 初始化
const config = initConfig();
const db = initDatabase();
initCache();  // 初始化缓存

// 创建 HTTP 服务器
const server = http.createServer((req, res) => {
  // 先尝试 API 路由
  if (handleApiRequest(req, res)) return;
  
  // 否则走代理
  handleProxyRequest(req, res);
});

// 定时刷新批量写入（保存引用以便清理）
const flushInterval = config.get('flushInterval');
const flushTimer = setInterval(() => {
  flushBatch().catch(err => {
    console.error('Flush batch error:', err.message);
  });
}, flushInterval);

// 防止定时器阻止进程退出
flushTimer.unref();

// 优雅关闭
async function shutdown(signal) {
  console.log(`\n${signal} received, shutting down...`);
  
  // 1. 停止接受新请求
  server.close(() => {
    console.log('HTTP server closed');
  });
  
  // 2. 清理定时器
  clearInterval(flushTimer);
  console.log('Flush timer cleared');
  
  // 3. 刷新剩余数据
  const pending = getPendingCount();
  if (pending > 0) {
    console.log(`Flushing ${pending} pending logs...`);
    await flushBatch();
  }
  
  // 4. 关闭数据库
  closeDatabase();
  console.log('Database closed');
  
  process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// 未捕获异常处理
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error.message);
  console.error(error.stack);
  shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise);
  console.error('Reason:', reason);
});

// 启动服务
const port = config.get('port');
const dbPath = config.get('dbPath');

server.listen(port, () => {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════╗
║         🔍 OpenClaw Model API Proxy (分层架构版 v1.3.1)                   ║
╠══════════════════════════════════════════════════════════════════════════╣
║  Proxy:  http://localhost:${port}                                            ║
║  DB:     ${dbPath.padEnd(52)}║
╠══════════════════════════════════════════════════════════════════════════╣
║  API 端点:                                                                ║
║    GET  /_stats?period=hour|day|week|month   统计信息                      ║
║    GET  /_logs?limit=100&provider=zai        日志查询                      ║
║    GET  /_providers                          供应商列表                     ║
║    GET  /_metrics                            Prometheus 指标                ║
║    GET  /_export/jsonl?limit=1000            导出 JSONL                    ║
║    GET  /_export/markdown?limit=100          导出 Markdown 报告            ║
║    GET  /_cleanup?days=30                    清理旧数据                     ║
║    POST /_flush                              手动刷新缓冲区                 ║
╠══════════════════════════════════════════════════════════════════════════╣
║  特性:                                                                    ║
║    ✅ 并发锁保护批量写入                                                   ║
║    ✅ LRU 缓存加速查询                                                    ║
║    ✅ Prometheus metrics 端点                                              ║
║    ✅ JSONL/Markdown 导出                                                  ║
║    ✅ 优雅关闭流程                                                         ║
╚══════════════════════════════════════════════════════════════════════════╝
  `);
});
