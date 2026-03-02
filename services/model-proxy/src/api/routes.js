/**
 * API 层 - RESTful API 路由
 */
import { getConfig } from '../config/index.js';
import { flushBatch, getStats, getLogs, cleanupOldLogs, exportToJsonl, exportToMarkdown } from '../db/repository.js';
import { getProviderList } from '../providers/index.js';

/**
 * 处理 API 请求
 */
export function handleApiRequest(req, res) {
  const config = getConfig();
  const baseUrl = `http://localhost:${config.get('port')}`;
  const url = new URL(req.url, baseUrl);
  const path = url.pathname;

  // 路由表
  const routes = {
    'GET /_health': () => handleHealth(res),
    'GET /_stats': () => handleStats(url, res),
    'GET /_logs': () => handleLogs(url, res),
    'GET /_providers': () => handleProviders(res),
    'GET /_cleanup': () => handleCleanup(url, res),
    'POST /_flush': () => handleFlush(res),
    'GET /_metrics': () => handleMetrics(res),
    'GET /_export/jsonl': () => handleExportJsonl(url, res),
    'GET /_export/markdown': () => handleExportMarkdown(url, res),
  };

  const routeKey = `${req.method} ${path}`;
  const handler = routes[routeKey];

  if (handler) {
    handler();
    return true;
  }

  return false;
}

/**
 * GET /_health - 健康检查
 */
function handleHealth(res) {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }));
}

/**
 * GET /_stats - 统计信息
 */
function handleStats(url, res) {
  const period = url.searchParams.get('period') || 'day';
  const timeFilter = buildTimeFilter(period);
  
  const stats = getStats(timeFilter);
  stats.period = period;
  
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(stats, null, 2));
}

/**
 * GET /_logs - 日志查询
 */
function handleLogs(url, res) {
  const limit = parseInt(url.searchParams.get('limit')) || 100;
  const offset = parseInt(url.searchParams.get('offset')) || 0;
  const provider = url.searchParams.get('provider');
  
  const logs = getLogs(limit, offset, provider);
  
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(logs, null, 2));
}

/**
 * GET /_providers - 供应商列表
 */
function handleProviders(res) {
  const providers = getProviderList();
  
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(providers, null, 2));
}

/**
 * GET /_cleanup - 清理旧数据
 */
function handleCleanup(url, res) {
  const config = getConfig();
  const days = parseInt(url.searchParams.get('days')) || config.get('retentionDays');
  
  const result = cleanupOldLogs(days);
  
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(result, null, 2));
}

/**
 * POST /_flush - 手动刷新批量写入
 */
function handleFlush(res) {
  const result = flushBatch();
  
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(result, null, 2));
}

/**
 * 构建时间过滤 SQL
 */
function buildTimeFilter(period) {
  const filters = {
    hour: `AND timestamp > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 hour')`,
    day: `AND timestamp > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 day')`,
    week: `AND timestamp > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-7 days')`,
    month: `AND timestamp > strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-30 days')`,
  };
  return filters[period] || filters.day;
}

/**
 * GET /_metrics - Prometheus 格式指标
 */
function handleMetrics(res) {
  const stats = getStats(buildTimeFilter('hour'));
  
  // Prometheus 格式
  const metrics = [];
  
  // 总请求数
  metrics.push(`# HELP model_proxy_requests_total Total number of proxied requests`);
  metrics.push(`# TYPE model_proxy_requests_total counter`);
  metrics.push(`model_proxy_requests_total ${stats.totalRequests}`);
  
  // 各供应商请求数
  metrics.push(`# HELP model_proxy_provider_requests Requests per provider`);
  metrics.push(`# TYPE model_proxy_provider_requests gauge`);
  for (const [provider, data] of Object.entries(stats.byProvider)) {
    metrics.push(`model_proxy_provider_requests{provider="${provider}"} ${data.requests}`);
  }
  
  // Token 使用量
  metrics.push(`# HELP model_proxy_tokens_total Total tokens processed`);
  metrics.push(`# TYPE model_proxy_tokens_total counter`);
  metrics.push(`model_proxy_tokens_total{type="input"} ${stats.totalTokens.input}`);
  metrics.push(`model_proxy_tokens_total{type="output"} ${stats.totalTokens.output}`);
  
  // 各供应商 Token 使用
  metrics.push(`# HELP model_proxy_provider_tokens Tokens per provider`);
  metrics.push(`# TYPE model_proxy_provider_tokens gauge`);
  for (const [provider, data] of Object.entries(stats.byProvider)) {
    metrics.push(`model_proxy_provider_tokens{provider="${provider}",type="input"} ${data.inputTokens}`);
    metrics.push(`model_proxy_provider_tokens{provider="${provider}",type="output"} ${data.outputTokens}`);
  }
  
  // 进程信息
  metrics.push(`# HELP model_proxy_info Proxy server info`);
  metrics.push(`# TYPE model_proxy_info gauge`);
  metrics.push(`model_proxy_info{version="1.1.0"} 1`);
  
  // 运行时间
  const uptime = process.uptime();
  metrics.push(`# HELP model_proxy_uptime_seconds Server uptime in seconds`);
  metrics.push(`# TYPE model_proxy_uptime_seconds gauge`);
  metrics.push(`model_proxy_uptime_seconds ${Math.floor(uptime)}`);
  
  res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(metrics.join('\n') + '\n');
}

/**
 * GET /_export/jsonl - 导出为 JSONL 格式
 */
function handleExportJsonl(url, res) {
  const limit = parseInt(url.searchParams.get('limit')) || 1000;
  const result = exportToJsonl(limit);
  
  res.writeHead(200, { 
    'Content-Type': 'application/x-ndjson',
    'Content-Disposition': `attachment; filename="requests-${new Date().toISOString().slice(0,10)}.jsonl"`
  });
  res.end(result.content);
}

/**
 * GET /_export/markdown - 导出为 Markdown 格式
 */
function handleExportMarkdown(url, res) {
  const limit = parseInt(url.searchParams.get('limit')) || 100;
  const md = exportToMarkdown(limit);
  
  res.writeHead(200, { 
    'Content-Type': 'text/markdown; charset=utf-8',
    'Content-Disposition': `attachment; filename="report-${new Date().toISOString().slice(0,10)}.md"`
  });
  res.end(md);
}
