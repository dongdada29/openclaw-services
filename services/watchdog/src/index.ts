import { spawn, execSync, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';

// ============================================================
// Types
// ============================================================

export interface WebhookConfig {
  webhookUrl: string | null;
}

export interface DiscordAlertPayload {
  title: string;
  message: string;
  level: 'error' | 'warn' | 'info';
}

export interface HealthCheckResult {
  proxyHealthy: boolean;
  timestamp: string;
}

export interface WatchdogOptions {
  intervalMs?: number;
  maxRetries?: number;
  webhookUrl?: string | null;
}

interface WatchdogConfig {
  OPENCLAW_SERVICES_HOME: string;
  DATA_DIR: string;
  LOG_DIR: string;
  PROXY_PORT: number;
  PROXY_URL: string;
  PID_FILE: string;
  PROXY_PROCESS_PATTERN: string;
  WEBHOOK_FILE: string;
  MODELS_FILE: string;
  BACKUP_FILE: string;
  RECOVERY_FLAG: string;
  LOG_JSON: boolean;
}

// ============================================================
// Constants
// ============================================================

const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
} as const;

const alertColors: Record<string, number> = {
  error: 15158332,
  warn: 16776960,
  info: 3447003,
};

// ============================================================
// Config (lazy-loaded)
// ============================================================

function getConfig(): WatchdogConfig {
  const OPENCLAW_SERVICES_HOME = process.env.OPENCLAW_SERVICES_HOME || path.join(process.env.HOME ?? '', '.openclaw');
  const DATA_DIR = path.join(OPENCLAW_SERVICES_HOME, 'data');
  const LOG_DIR = path.join(OPENCLAW_SERVICES_HOME, 'logs');
  const PROXY_PORT = parseInt(process.env.PROXY_PORT || '3456', 10);
  const PROXY_URL = `http://localhost:${PROXY_PORT}`;
  const PID_FILE = process.env.OPENCLAW_PROXY_PID_FILE || '/tmp/openclaw-model-proxy.pid';
  const PROXY_PROCESS_PATTERN = 'openclaw-services|openclaw.*model-proxy|openclaw-model-proxy';
  const WEBHOOK_FILE = path.join(OPENCLAW_SERVICES_HOME, 'watchdog-webhook.json');
  const MODELS_FILE = path.join(process.env.HOME ?? '', '.openclaw/agents/main/agent/models.json');
  const BACKUP_FILE = path.join(DATA_DIR, 'openclaw-models-original.json');
  const RECOVERY_FLAG = path.join(DATA_DIR, '.proxy-recovery-mode');
  const LOG_JSON = process.env.OPENCLAW_LOG_JSON === '1' || process.env.OPENCLAW_LOG_JSON === 'true';

  return {
    OPENCLAW_SERVICES_HOME,
    DATA_DIR,
    LOG_DIR,
    PROXY_PORT,
    PROXY_URL,
    PID_FILE,
    PROXY_PROCESS_PATTERN,
    WEBHOOK_FILE,
    MODELS_FILE,
    BACKUP_FILE,
    RECOVERY_FLAG,
    LOG_JSON,
  };
}

// ============================================================
// Logging
// ============================================================

function structuredLog(level: string, module: string, message: string, meta: Record<string, unknown> = {}) {
  const config = getConfig();
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    module,
    message,
    ...meta,
  };
  if (config.LOG_JSON) {
    console.log(JSON.stringify(entry));
  } else {
    const prefix = `[${level.toUpperCase()}] [${module}]`;
    console.log(prefix, message, Object.keys(meta).length ? JSON.stringify(meta) : '');
  }
}

function log(color: keyof typeof colors, ...args: unknown[]) {
  const c = colors[color] || '';
  console.log(c, ...args, colors.reset);
}

// ============================================================
// Utilities
// ============================================================

function ensureDirs(dirs: string[]) {
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

async function fetchWithTimeout(url: string, timeout = 5000): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

// ============================================================
// Webhook
// ============================================================

let webhookUrl: string | null = null;

function loadWebhookConfig(): void {
  const config = getConfig();
  try {
    if (fs.existsSync(config.WEBHOOK_FILE)) {
      const cfg = JSON.parse(fs.readFileSync(config.WEBHOOK_FILE, 'utf-8')) as WebhookConfig;
      webhookUrl = cfg.webhookUrl ?? null;
      if (webhookUrl) {
        log('cyan', '📩 Discord Webhook 已加载');
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log('yellow', `⚠️ 加载 Webhook 配置失败: ${msg}`);
  }
}

async function sendDiscordAlert(title: string, message: string, level: AlertLevel = 'error'): Promise<boolean> {
  if (!webhookUrl) return false;

  const payload = {
    embeds: [{
      title,
      description: message,
      color: alertColors[level] || alertColors.error,
      timestamp: new Date().toISOString(),
      footer: { text: 'OpenClaw Watchdog' },
    }],
  };

  try {
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    return response.ok;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log('red', `发送告警失败: ${msg}`);
    return false;
  }
}

type AlertLevel = 'error' | 'warn' | 'info';

// ============================================================
// Proxy health
// ============================================================

async function checkProxyHealth(): Promise<boolean> {
  const config = getConfig();
  try {
    const response = await fetchWithTimeout(`${config.PROXY_URL}/_health`);
    return response.ok;
  } catch {
    return false;
  }
}

function readPidFile(): number | null {
  const config = getConfig();
  try {
    if (fs.existsSync(config.PID_FILE)) {
      return parseInt(fs.readFileSync(config.PID_FILE, 'utf-8').trim(), 10);
    }
  } catch (err) {
    debug('操作失败:', err instanceof Error ? err.message : String(err));
  }
  return null;
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function debug(...args: unknown[]) {
  structuredLog('debug', 'watchdog', args.join(' '));
}

// ============================================================
// Proxy start/stop
// ============================================================

async function startProxy(): Promise<boolean> {
  const config = getConfig();
  const proxyBin = path.join(config.OPENCLAW_SERVICES_HOME, 'bin/openclaw-proxy');
  const proxyDir = path.join(config.OPENCLAW_SERVICES_HOME, 'services/model-proxy');
  const proxyScript = path.join(proxyDir, 'server.js');

  let cmd: string;
  let args: string[] = [];
  let cwd: string;

  if (fs.existsSync(proxyBin)) {
    cmd = proxyBin;
  } else if (fs.existsSync(proxyScript)) {
    const runtime = fs.existsSync('/opt/homebrew/bin/bun') ? 'bun' : 'node';
    cmd = runtime;
    if (runtime === 'node') {
      args = ['server.js'];
    }
    cwd = proxyDir;
  } else {
    log('red', '❌ model-proxy 未找到');
    return false;
  }

  const proxyLog = path.join(config.LOG_DIR, 'model-proxy.log');
  const child = spawn(cmd, args, {
    cwd: proxyDir,
    detached: true,
    stdio: ['ignore', fs.openSync(proxyLog, 'a'), fs.openSync(proxyLog, 'a')],
  });
  child.unref();

  fs.writeFileSync(config.PID_FILE, String(child.pid));

  for (let i = 0; i < 10; i++) {
    if (await checkProxyHealth()) {
      log('green', `✅ model-proxy 启动成功 (PID: ${child.pid})`);
      return true;
    }
    await new Promise(r => setTimeout(r, 500));
  }

  log('red', '❌ model-proxy 启动失败');
  return false;
}

async function stopProxy(): Promise<boolean> {
  const config = getConfig();
  const pid = readPidFile();

  if (pid && isProcessRunning(pid)) {
    try {
      process.kill(pid, 'SIGTERM');
      let retries = 10;
      while (retries > 0 && isProcessRunning(pid)) {
        await new Promise(r => setTimeout(r, 300));
        retries--;
      }
      if (isProcessRunning(pid)) {
        process.kill(pid, 'SIGKILL');
      }
      log('green', `✅ model-proxy 已停止 (PID: ${pid})`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log('yellow', `⚠️ 停止进程失败: ${msg}`);
    }
  } else {
    try {
      execSync(`pkill -f "${config.PROXY_PROCESS_PATTERN}"`, { stdio: 'pipe' });
      log('green', '✅ model-proxy 已停止');
    } catch {
      log('yellow', '⚠️ model-proxy 未在运行');
    }
  }

  try {
    fs.unlinkSync(config.PID_FILE);
  } catch (err) {
    debug('操作失败:', err instanceof Error ? err.message : String(err));
  }
  return true;
}

// ============================================================
// Recovery
// ============================================================

async function recoverToDirect(): Promise<void> {
  log('cyan', '🚨 紧急恢复到直连模式...');
  const config = getConfig();

  await stopProxy();

  if (fs.existsSync(config.BACKUP_FILE)) {
    fs.copyFileSync(config.BACKUP_FILE, config.MODELS_FILE);
    log('green', '✅ 配置已恢复');
  }

  fs.writeFileSync(config.RECOVERY_FLAG, new Date().toISOString());

  try {
    execSync('openclaw gateway restart', { stdio: 'pipe' });
    log('green', '✅ Gateway 已重启');
  } catch {
    log('yellow', '⚠️ Gateway 重启失败');
  }
}

// ============================================================
// Health check
// ============================================================

async function healthCheck(): Promise<boolean> {
  log('cyan', '🏥 健康检查...');
  const config = getConfig();

  const proxyHealthy = await checkProxyHealth();

  if (proxyHealthy) {
    log('green', '✅ Proxy 运行正常');
    return true;
  }

  log('red', '❌ Proxy 故障，尝试恢复...');
  await sendDiscordAlert('🚨 Proxy 故障', '检测到 Model-Proxy 服务异常，正在尝试恢复...', 'error');

  if (fs.existsSync(config.MODELS_FILE)) {
    const content = fs.readFileSync(config.MODELS_FILE, 'utf-8');
    if (content.includes(`localhost:${config.PROXY_PORT}`)) {
      await recoverToDirect();
    }
  }

  return false;
}

// ============================================================
// Watch loop
// ============================================================

async function watch(intervalMs = 60000, maxRetries = 5): Promise<void> {
  const config = getConfig();
  let retryCount = 0;
  let currentInterval = intervalMs;

  log('cyan', `👀 开始监控 (间隔: ${intervalMs / 1000}s)`);

  while (true) {
    const timestamp = new Date().toISOString();

    if (await checkProxyHealth()) {
      log('green', `[${timestamp}] ✅ Proxy 正常`);

      if (retryCount > 0) {
        log('cyan', `[${timestamp}] 🔄 重置退避计数器`);
        retryCount = 0;
        currentInterval = intervalMs;
      }
    } else {
      retryCount++;
      log('red', `[${timestamp}] ❌ Proxy 故障 (重试 ${retryCount}/${maxRetries})`);

      if (retryCount === 1) {
        await sendDiscordAlert('🚨 Proxy 故障', `Model-Proxy 服务异常，正在尝试恢复 (${retryCount}/${maxRetries})`, 'error');
      }

      if (retryCount <= maxRetries) {
        await recoverToDirect();
        currentInterval = Math.min(intervalMs * Math.pow(2, retryCount - 1), 600000);
        log('yellow', `[${timestamp}] ⏳ 等待 ${currentInterval / 1000}s 后重试...`);
      } else {
        log('red', `[${timestamp}] 🚨 达到最大重试次数，停止监控`);
        break;
      }
    }

    await new Promise(r => setTimeout(r, currentInterval));
  }
}

// ============================================================
// Main
// ============================================================

export async function main(): Promise<void> {
  const config = getConfig();
  const args = process.argv.slice(2);
  const cmd = args[0];

  ensureDirs([config.DATA_DIR, config.LOG_DIR]);
  loadWebhookConfig();

  switch (cmd) {
    case 'check':
      await healthCheck();
      break;
    case 'watch':
      await watch(parseInt(args[1]) || 60000);
      break;
    case 'recover':
      await recoverToDirect();
      break;
    default:
      console.log(`
用法: openclaw-services watchdog <命令>

命令:
  check    执行一次健康检查
  watch    持续监控 (默认 60 秒间隔)
  recover  紧急恢复到直连模式

示例:
  openclaw-services watchdog check
  openclaw-services watchdog watch 30000
`);
  }
}

// ============================================================
// Run
// ============================================================

main().catch(err => {
  console.error('Fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
