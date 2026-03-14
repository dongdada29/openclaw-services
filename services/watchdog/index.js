/**
 * OpenClaw Watchdog - 监控服务
 *
 * 功能:
 *   - 健康检查
 *   - 自动故障恢复
 *   - 通知发送
 */

import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

// 配置
const OPENCLAW_SERVICES_HOME = process.env.OPENCLAW_SERVICES_HOME || path.join(process.env.HOME, '.openclaw');
const DATA_DIR = path.join(OPENCLAW_SERVICES_HOME, 'data');
const LOG_DIR = path.join(OPENCLAW_SERVICES_HOME, 'logs');
const PROXY_PORT = 3456;
const PROXY_URL = `http://localhost:${PROXY_PORT}`;
const MODELS_FILE = path.join(process.env.HOME, '.openclaw/agents/main/agent/models.json');
const BACKUP_FILE = path.join(DATA_DIR, 'openclaw-models-original.json');
const RECOVERY_FLAG = path.join(DATA_DIR, '.proxy-recovery-mode');
const PID_FILE = '/tmp/openclaw-model-proxy.pid';

// 颜色输出
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

const log = (color, ...args) => console.log(colors[color] || '', ...args, colors.reset);

// 确保目录存在
function ensureDirs() {
  [DATA_DIR, LOG_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

// 带超时的 fetch
async function fetchWithTimeout(url, timeout = 5000) {
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

// 检查 proxy 健康状态
async function checkProxyHealth() {
  try {
    const response = await fetchWithTimeout(`${PROXY_URL}/_health`);
    return response.ok;
  } catch {
    return false;
  }
}

// 读取 PID 文件
function readPidFile() {
  try {
    if (fs.existsSync(PID_FILE)) {
      return parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim(), 10);
    }
  } catch {}
  return null;
}

// 检查进程是否运行
function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// 运行 proxy
async function startProxy() {
  // 优先使用二进制，回退到源码，  自动检测运行时
  const proxyBin = path.join(OPENCLAW_SERVICES_HOME, 'bin/openclaw-proxy');
  const proxyDir = path.join(OPENCLAW_SERVICES_HOME, 'services/model-proxy');
  const proxyScript = path.join(proxyDir, 'server.js');

  let cmd, args, cwd;

  if (fs.existsSync(proxyBin)) {
    cmd = proxyBin;
    args = [];
    cwd = OPENCLAW_SERVICES_HOME;
  } else if (fs.existsSync(proxyScript)) {
    // 自动检测运行时：bun > node
    const runtime = fs.existsSync('/opt/homebrew/bin/bun') ? 'bun' : 'node';
    cmd = runtime;
    args = ['server.js'];
    cwd = proxyDir;
  } else {
    log('red', '❌ model-proxy 未找到');
    return false;
  }

  const proxyLog = path.join(LOG_DIR, 'model-proxy.log');
  const child = spawn(cmd, args, {
    cwd,
    detached: true,
    stdio: ['ignore', fs.openSync(proxyLog, 'a'), fs.openSync(proxyLog, 'a')]
  });
  child.unref();

  fs.writeFileSync(PID_FILE, String(child.pid));

  // 等待启动
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

// 停止 proxy
async function stopProxy() {
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
      log('yellow', `⚠️ 停止进程失败: ${err.message}`);
    }
  } else {
    // 备用方案
    try {
      execSync('pkill -f "node.*model-proxy"', { stdio: 'pipe' });
      log('green', '✅ model-proxy 已停止');
    } catch {
      log('yellow', '⚠️ model-proxy 未在运行');
    }
  }

  try { fs.unlinkSync(PID_FILE); } catch {}
  return true;
}

// 恢复直连模式
async function recoverToDirect() {
  log('cyan', '🚨 紧急恢复到直连模式...');

  // 停止 proxy
  await stopProxy();

  // 恢复配置
  if (fs.existsSync(BACKUP_FILE)) {
    fs.copyFileSync(BACKUP_FILE, MODELS_FILE);
    log('green', '✅ 配置已恢复');
  }

  // 设置恢复标记
  fs.writeFileSync(RECOVERY_FLAG, new Date().toISOString());

  // 重启 gateway
  try {
    execSync('openclaw gateway restart', { stdio: 'pipe' });
    log('green', '✅ Gateway 已重启');
  } catch {
    log('yellow', '⚠️ Gateway 重启失败');
  }
}

// 健康检查并恢复
async function healthCheck() {
  log('cyan', '🏥 健康检查...');

  const proxyHealthy = await checkProxyHealth();

  if (proxyHealthy) {
    log('green', '✅ Proxy 运行正常');
    return true;
  }

  log('red', '❌ Proxy 故障，尝试恢复...');

  // 检查是否在 proxy 模式
  if (fs.existsSync(MODELS_FILE)) {
    const content = fs.readFileSync(MODELS_FILE, 'utf-8');
    if (content.includes(`localhost:${PROXY_PORT}`)) {
      // 正在使用 proxy 模式，需要恢复
      await recoverToDirect();
    }
  }

  return false;
}

// 持续监控
async function watch(intervalMs = 60000) {
  const maxRetries = 5;
  let retryCount = 0;
  let currentInterval = intervalMs;

  log('cyan', `👀 开始监控 (间隔: ${intervalMs / 1000}s)`);

  while (true) {
    const timestamp = new Date().toISOString();

    if (await checkProxyHealth()) {
      log('green', `[${timestamp}] ✅ Proxy 正常`);

      // 重置退避
      if (retryCount > 0) {
        log('cyan', `[${timestamp}] 🔄 重置退避计数器`);
        retryCount = 0;
        currentInterval = intervalMs;
      }
    } else {
      retryCount++;
      log('red', `[${timestamp}] ❌ Proxy 故障 (重试 ${retryCount}/${maxRetries})`);

      if (retryCount <= maxRetries) {
        await recoverToDirect();

        // 指数退避
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

// 主入口
export async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  ensureDirs();

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

// 如果直接运行
main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
