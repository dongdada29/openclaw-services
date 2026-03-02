#!/usr/bin/env node
/**
 * OpenClaw Services CLI
 * Unified command-line tool for managing OpenClaw infrastructure services
 */

import { spawn, execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// 读取版本信息
const __filename = fileURLToPath(import.meta.url);
const pkgPath = path.join(path.dirname(__filename), '../package.json');
let VERSION = '1.0.0';
try {
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  VERSION = pkg.version;
} catch {}

// 配置常量
const OPENCLAW_SERVICES_HOME = process.env.OPENCLAW_SERVICES_HOME || path.join(process.env.HOME, '.openclaw');
const SERVICES_DIR = path.join(OPENCLAW_SERVICES_HOME, 'services');
const LOG_DIR = path.join(OPENCLAW_SERVICES_HOME, 'logs');
const DATA_DIR = path.join(OPENCLAW_SERVICES_HOME, 'data');

// Proxy 配置
const PROXY_HOST = 'localhost';
const PROXY_PORT = 3456;
const PROXY_BASE_URL = `http://${PROXY_HOST}:${PROXY_PORT}`;
const PROXY_PID_FILE = '/tmp/openclaw-model-proxy.pid';

// 请求超时配置
const HEALTH_CHECK_TIMEOUT = 5000;
const STARTUP_RETRY_COUNT = 10;
const STARTUP_RETRY_INTERVAL = 500;

// 颜色
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
};

const log = (color, ...args) => console.log(colors[color] || '', ...args, colors.reset);

// 带超时的 fetch
async function fetchWithTimeout(url, timeout = HEALTH_CHECK_TIMEOUT) {
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

// 帮助信息
function showHelp() {
  console.log(`
${colors.cyan}OpenClaw Services CLI v${VERSION}${colors.reset}

${colors.yellow}用法:${colors.reset}
  openclaw-services <命令> [选项]

${colors.yellow}命令:${colors.reset}
  ${colors.green}status${colors.reset}         查看所有服务状态
  ${colors.green}doctor${colors.reset}         全面健康检查

  ${colors.green}start${colors.reset} [服务]   启动服务 (proxy | watchdog)
  ${colors.green}stop${colors.reset} [服务]    停止服务
  ${colors.green}restart${colors.reset} [服务] 重启服务

  ${colors.green}proxy enable${colors.reset}   启用 proxy 模式
  ${colors.green}proxy disable${colors.reset}  禁用 proxy 模式（恢复直连）
  ${colors.green}proxy test${colors.reset}     测试 proxy 连接

  ${colors.green}logs${colors.reset} [服务]    查看日志
  ${colors.green}health${colors.reset}         运行健康监控
  ${colors.green}watchdog${colors.reset}       运行 watchdog

${colors.yellow}选项:${colors.reset}
  -v, --version    显示版本号
  -h, --help       显示帮助信息

${colors.yellow}示例:${colors.reset}
  openclaw-services status           # 查看状态
  openclaw-services proxy enable     # 切换到 proxy 模式
  openclaw-services doctor           # 健康检查

${colors.yellow}环境变量:${colors.reset}
  OPENCLAW_SERVICES_HOME    服务安装路径 (默认: ~/.openclaw)
`);
}

// 检查 proxy 是否运行
async function checkProxyHealth() {
  try {
    const response = await fetchWithTimeout(`${PROXY_BASE_URL}/_health`);
    return response.ok;
  } catch {
    return false;
  }
}

// 获取 proxy 状态
async function getProxyStats() {
  try {
    const response = await fetchWithTimeout(`${PROXY_BASE_URL}/_stats`);
    return await response.json();
  } catch {
    return null;
  }
}

// 等待服务启动（重试机制）
async function waitForHealth(maxRetries = STARTUP_RETRY_COUNT, interval = STARTUP_RETRY_INTERVAL) {
  for (let i = 0; i < maxRetries; i++) {
    if (await checkProxyHealth()) return true;
    await new Promise(r => setTimeout(r, interval));
  }
  return false;
}

// 读取 PID 文件
function readPidFile() {
  try {
    if (fs.existsSync(PROXY_PID_FILE)) {
      const pid = parseInt(fs.readFileSync(PROXY_PID_FILE, 'utf-8').trim(), 10);
      if (!isNaN(pid)) return pid;
    }
  } catch {}
  return null;
}

// 写入 PID 文件
function writePidFile(pid) {
  try {
    fs.writeFileSync(PROXY_PID_FILE, String(pid));
  } catch {}
}

// 删除 PID 文件
function removePidFile() {
  try {
    fs.unlinkSync(PROXY_PID_FILE);
  } catch {}
}

// 检查进程是否存在
function isProcessRunning(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// 启动服务
async function startService(service) {
  if (service === 'proxy' || service === 'model-proxy') {
    log('cyan', '🚀 启动 model-proxy...');
    const proxyDir = path.join(SERVICES_DIR, 'model-proxy');
    if (!fs.existsSync(proxyDir)) {
      log('red', '❌ model-proxy 目录不存在');
      log('yellow', '   请先运行: openclaw-services install');
      return false;
    }

    // 检查是否已运行
    if (await checkProxyHealth()) {
      log('green', '✅ model-proxy 已在运行');
      return true;
    }

    // 检查 PID 文件是否被锁定
    const existingPid = readPidFile();
    if (existingPid && isProcessRunning(existingPid)) {
      log('yellow', `⚠️ model-proxy 正在启动中 (PID: ${existingPid})`);
      // 等待启动完成
      if (await waitForHealth()) {
        log('green', '✅ model-proxy 已启动');
        return true;
      }
    }

    // 启动进程
    const proxyLog = path.join(LOG_DIR, 'model-proxy.log');
    const child = spawn('node', ['server.js'], {
      cwd: proxyDir,
      detached: true,
      stdio: ['ignore', fs.openSync(proxyLog, 'a'), fs.openSync(proxyLog, 'a')]
    });
    child.unref();

    // 写入 PID
    writePidFile(child.pid);

    // 等待启动完成
    if (await waitForHealth()) {
      log('green', `✅ model-proxy 启动成功 (PID: ${child.pid})`);
      return true;
    }

    log('red', '❌ model-proxy 启动失败');
    removePidFile();
    return false;
  }
  log('red', `❌ 未知服务: ${service}`);
  return false;
}

// 停止服务
async function stopService(service) {
  if (service === 'proxy' || service === 'model-proxy') {
    log('cyan', '🛑 停止 model-proxy...');

    // 优先使用 PID 文件停止
    const pid = readPidFile();
    if (pid && isProcessRunning(pid)) {
      try {
        process.kill(pid, 'SIGTERM');
        // 等待进程退出
        let retries = 10;
        while (retries > 0 && isProcessRunning(pid)) {
          await new Promise(r => setTimeout(r, 300));
          retries--;
        }
        // 如果还没退出，强制杀掉
        if (isProcessRunning(pid)) {
          process.kill(pid, 'SIGKILL');
        }
        log('green', `✅ model-proxy 已停止 (PID: ${pid})`);
      } catch (err) {
        log('yellow', `⚠️ 停止进程失败: ${err.message}`);
      }
    } else {
      // 备用方案：使用 pkill
      try {
        execSync('pkill -f "node.*model-proxy"', { stdio: 'pipe' });
        log('green', '✅ model-proxy 已停止');
      } catch {
        log('yellow', '⚠️ model-proxy 未在运行');
      }
    }

    removePidFile();
    return true;
  }
  log('red', `❌ 未知服务: ${service}`);
  return false;
}

// 显示状态
async function showStatus() {
  console.log('\n📦 Model Proxy:');
  const proxyRunning = await checkProxyHealth();
  if (proxyRunning) {
    log('green', '   状态: ✅ 运行中');
    const pid = readPidFile();
    if (pid) console.log(`   PID: ${pid}`);
    console.log(`   端口: ${PROXY_PORT}`);
    const stats = await getProxyStats();
    if (stats) {
      console.log(`   总请求: ${stats.totalRequests || 0}`);
    }
  } else {
    log('red', '   状态: ❌ 未运行');
  }

  console.log('\n📁 路径配置:');
  console.log(`   服务目录: ${OPENCLAW_SERVICES_HOME}`);
  console.log(`   日志目录: ${LOG_DIR}`);

  console.log('\n💾 配置备份:');
  const backupFile = path.join(DATA_DIR, 'openclaw-models-original.json');
  if (fs.existsSync(backupFile)) {
    const stats = fs.statSync(backupFile);
    log('green', `   ✅ 存在 (${(stats.size / 1024).toFixed(1)} KB)`);
  } else {
    log('yellow', '   ⚠️ 无备份');
  }
  console.log('');
}

// Proxy 模式切换
async function proxyCommand(subCmd) {
  const switchScript = path.join(SERVICES_DIR, 'watchdog/scripts/model-proxy-switch.sh');
  if (!fs.existsSync(switchScript)) {
    log('red', '❌ model-proxy-switch.sh 不存在');
    return;
  }
  if (subCmd === 'enable') {
    log('cyan', '🔄 切换到 proxy 模式...');
    execSync(`bash "${switchScript}" enable`, { stdio: 'inherit' });
  } else if (subCmd === 'disable') {
    log('cyan', '🔄 恢复直连模式...');
    execSync(`bash "${switchScript}" disable`, { stdio: 'inherit' });
  } else if (subCmd === 'test') {
    log('cyan', '🧪 测试 proxy...');
    execSync(`bash "${switchScript}" test`, { stdio: 'inherit' });
  } else {
    console.log('用法: openclaw-services proxy <enable|disable|test>');
  }
}

// 健康检查
async function runDoctor() {
  console.log(`\n🔍 OpenClaw Services Doctor v${VERSION}\n`);

  console.log('1. 目录结构:');
  [OPENCLAW_SERVICES_HOME, SERVICES_DIR, LOG_DIR, DATA_DIR].forEach(dir => {
    fs.existsSync(dir) ? log('green', `   ✅ ${dir}`) : log('red', `   ❌ ${dir}`);
  });

  console.log('\n2. 服务状态:');
  const proxyRunning = await checkProxyHealth();
  proxyRunning ? log('green', '   ✅ model-proxy 运行中') : log('red', '   ❌ model-proxy 未运行');

  if (proxyRunning) {
    const pid = readPidFile();
    if (pid) console.log(`   PID: ${pid}`);
  }

  console.log('\n3. 配置文件:');
  const modelsFile = path.join(process.env.HOME, '.openclaw/agents/main/agent/models.json');
  if (fs.existsSync(modelsFile)) {
    log('green', '   ✅ models.json 存在');
    const content = fs.readFileSync(modelsFile, 'utf-8');
    content.includes(`localhost:${PROXY_PORT}`) ? log('cyan', '   🔀 当前模式: Proxy') : log('cyan', '   🔗 当前模式: 直连');
  } else {
    log('red', '   ❌ models.json 不存在');
  }

  console.log('\n4. Gateway 状态:');
  try {
    execSync('openclaw gateway status', { stdio: 'pipe' });
    log('green', '   ✅ Gateway 正常');
  } catch {
    log('yellow', '   ⚠️ Gateway 状态未知');
  }
  console.log('');
}

// 查看日志
async function showLogs(service) {
  const logFile = service === 'proxy'
    ? path.join(LOG_DIR, 'model-proxy.log')
    : path.join(LOG_DIR, `openclaw-${service || 'watchdog'}.log`);
  if (fs.existsSync(logFile)) {
    console.log(`📄 ${logFile}:\n`);
    execSync(`tail -100 "${logFile}"`, { stdio: 'inherit' });
  } else {
    log('yellow', `日志文件不存在: ${logFile}`);
  }
}

// 运行脚本
function runScript(name) {
  const script = path.join(SERVICES_DIR, `watchdog/scripts/${name}.sh`);
  if (fs.existsSync(script)) {
    execSync(`bash "${script}"`, { stdio: 'inherit' });
  } else {
    log('red', `❌ 脚本不存在: ${script}`);
  }
}

// 确保必要目录存在
function ensureDirs() {
  [LOG_DIR, DATA_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

// 主入口
async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const subCmd = args[1];

  // 确保目录存在
  ensureDirs();

  switch (cmd) {
    case '--version':
    case '-v':
      console.log(`openclaw-services v${VERSION}`);
      break;
    case 'status': await showStatus(); break;
    case 'doctor': await runDoctor(); break;
    case 'start': await startService(subCmd || 'proxy'); break;
    case 'stop': await stopService(subCmd || 'proxy'); break;
    case 'restart': await stopService(subCmd || 'proxy'); await startService(subCmd || 'proxy'); break;
    case 'proxy': await proxyCommand(subCmd); break;
    case 'logs': await showLogs(subCmd); break;
    case 'health': runScript('health-monitor'); break;
    case 'watchdog': runScript('openclaw-watchdog'); break;
    case '--help':
    case '-h':
    case 'help':
    default: showHelp(); break;
  }
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
