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
const LAUNCHD_DIR = path.join(OPENCLAW_SERVICES_HOME, 'launchd');
const LAUNCHAGENTS_DIR = path.join(process.env.HOME, 'Library', 'LaunchAgents');

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
  ${colors.green}setup${colors.reset}          安装并注册 LaunchAgent 服务
  ${colors.green}install${colors.reset}         一键安装（不备份）
  ${colors.green}uninstall${colors.reset}       卸载所有服务

  ${colors.green}start${colors.reset} [服务]   启动服务 (proxy | watchdog)
  ${colors.green}stop${colors.reset} [服务]    停止服务
  ${colors.green}restart${colors.reset} [服务] 重启服务

  ${colors.green}proxy enable${colors.reset}   启用 proxy 模式
  ${colors.green}proxy disable${colors.reset}  禁用 proxy 模式（恢复直连）
  ${colors.green}proxy test${colors.reset}     测试 proxy 连接

  ${colors.green}logs${colors.reset} [服务]    查看日志
  ${colors.green}health${colors.reset}         运行健康监控
  ${colors.green}watchdog${colors.reset}       运行 watchdog

  ${colors.green}config${colors.reset}         配置管理 (backup/restore/sync/migrate)
  ${colors.green}launchd list${colors.reset}   列出 LaunchAgent 状态
  ${colors.green}launchd install${colors.reset} 注册 LaunchAgent
  ${colors.green}launchd uninstall${colors.reset} 卸载 LaunchAgent

${colors.yellow}选项:${colors.reset}
  -v, --version    显示版本号
  -h, --help       显示帮助信息

${colors.yellow}示例:${colors.reset}
  openclaw-services setup            # 首次安装设置
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
    const child = spawn('bun', ['server.js'], {
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
        execSync('pkill -f "(node|bun).*model-proxy"', { stdio: 'pipe' });
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

// ==================== LaunchAgent 管理 ====================

const LAUNCHD_SERVICES = [
  { name: 'model-proxy', label: 'com.openclaw.model-proxy', schedule: null },
  { name: 'watchdog', label: 'com.openclaw.watchdog', schedule: null },  // 持续运行模式
  { name: 'health', label: 'com.openclaw.health', schedule: 'Daily 9:00' },
];

// 生成 plist 文件内容
function generatePlist(serviceName) {
  const service = LAUNCHD_SERVICES.find(s => s.name === serviceName);
  if (!service) return null;

  const baseConfig = {
    Label: service.label,
    EnvironmentVariables: {
      OPENCLAW_SERVICES_HOME: OPENCLAW_SERVICES_HOME,
      PATH: '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin',
    },
    StandardOutPath: path.join(LOG_DIR, `${serviceName}.log`),
    StandardErrorPath: path.join(LOG_DIR, `${serviceName}.error.log`),
  };

  if (serviceName === 'model-proxy') {
    return {
      ...baseConfig,
      ProgramArguments: [
        '/usr/bin/env',
        'node',
        path.join(SERVICES_DIR, 'model-proxy', 'server.js'),
      ],
      RunAtLoad: true,
      KeepAlive: true,
      WorkingDirectory: path.join(SERVICES_DIR, 'model-proxy'),
    };
  } else if (serviceName === 'watchdog') {
    return {
      ...baseConfig,
      ProgramArguments: [
        '/usr/bin/env',
        'node',
        path.join(SERVICES_DIR, 'watchdog', 'index.js'),
        'watch',
      ],
      RunAtLoad: true,
      KeepAlive: true,
    };
  } else if (serviceName === 'health') {
    return {
      ...baseConfig,
      ProgramArguments: [
        '/usr/bin/env',
        'node',
        path.join(SERVICES_DIR, 'watchdog', 'index.js'),
        'check',
      ],
      StartCalendarInterval: [{ Hour: 9, Minute: 0 }],
      RunAtLoad: false,
    };
  }
  return null;
}

// 将 plist 对象转换为 XML
function plistToXml(plist) {
  const escapeXml = (str) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const valueToXml = (value, indent = '    ') => {
    if (typeof value === 'string') {
      return `${indent}<string>${escapeXml(value)}</string>`;
    } else if (typeof value === 'number') {
      return `${indent}<integer>${value}</integer>`;
    } else if (typeof value === 'boolean') {
      return `${indent}<${value}/>`;
    } else if (Array.isArray(value)) {
      const items = value.map(item => valueToXml(item, indent + '  ')).join('\n');
      return `${indent}<array>\n${items}\n${indent}</array>`;
    } else if (typeof value === 'object' && value !== null) {
      const entries = Object.entries(value)
        .map(([k, v]) => `${indent}  <key>${escapeXml(k)}</key>\n${valueToXml(v, indent + '  ')}`)
        .join('\n');
      return `${indent}<dict>\n${entries}\n${indent}</dict>`;
    }
    return `${indent}<string>${escapeXml(String(value))}</string>`;
  };

  const entries = Object.entries(plist)
    .map(([key, value]) => `    <key>${escapeXml(key)}</key>\n${valueToXml(value)}`)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
${entries}
</dict>
</plist>`;
}

// 安装 LaunchAgent
function installLaunchd(serviceName) {
  const service = LAUNCHD_SERVICES.find(s => s.name === serviceName);
  if (!service) {
    log('red', `❌ 未知服务: ${serviceName}`);
    return false;
  }

  const plist = generatePlist(serviceName);
  if (!plist) {
    log('red', `❌ 无法生成 plist: ${serviceName}`);
    return false;
  }

  // 确保目录存在
  if (!fs.existsSync(LAUNCHAGENTS_DIR)) {
    fs.mkdirSync(LAUNCHAGENTS_DIR, { recursive: true });
  }

  const plistPath = path.join(LAUNCHAGENTS_DIR, `${service.label}.plist`);
  const plistContent = plistToXml(plist);

  // 写入 plist 文件
  fs.writeFileSync(plistPath, plistContent);
  log('green', `✅ 创建 LaunchAgent: ${plistPath}`);

  // 卸载旧的（如果存在）
  try {
    execSync('launchctl', ['unload', plistPath], { stdio: 'pipe' });
  } catch {}

  // 加载新的
  try {
    execSync('launchctl', ['load', plistPath], { stdio: 'pipe' });
    log('green', `✅ 已注册: ${service.label}`);

    if (service.schedule) {
      log('cyan', `   调度: ${service.schedule}`);
    } else {
      log('cyan', `   模式: 保持运行 (KeepAlive)`);
    }
    return true;
  } catch (err) {
    log('red', `❌ 注册失败: ${err.message}`);
    return false;
  }
}

// 卸载 LaunchAgent
function uninstallLaunchd(serviceName) {
  const service = LAUNCHD_SERVICES.find(s => s.name === serviceName);
  if (!service) {
    log('red', `❌ 未知服务: ${serviceName}`);
    return false;
  }

  const plistPath = path.join(LAUNCHAGENTS_DIR, `${service.label}.plist`);

  // 卸载
  try {
    execSync(`launchctl unload "${plistPath}" 2>/dev/null`, { stdio: 'pipe' });
    log('green', `✅ 已卸载: ${service.label}`);
  } catch {}

  // 删除文件
  if (fs.existsSync(plistPath)) {
    fs.unlinkSync(plistPath);
    log('green', `✅ 已删除: ${plistPath}`);
  }

  return true;
}

// 列出 LaunchAgent 状态
function listLaunchd() {
  console.log('\n📋 LaunchAgent 状态:\n');

  for (const service of LAUNCHD_SERVICES) {
    const plistPath = path.join(LAUNCHAGENTS_DIR, `${service.label}.plist`);
    const installed = fs.existsSync(plistPath);

    // 检查是否已加载
    let loaded = false;
    try {
      execSync(`launchctl list ${service.label} 2>/dev/null`, { stdio: 'pipe' });
      loaded = true;
    } catch {}

    const status = loaded ? '🟢 运行中' : (installed ? '🟡 已安装' : '⚪ 未安装');
    console.log(`   ${status}  ${service.name}${service.schedule ? ` (${service.schedule})` : ''}`);
  }
  console.log('');
}

// 运行完整设置
async function runSetup() {
  console.log(`\n🚀 OpenClaw Services Setup v${VERSION}\n`);

  // 1. 确保目录存在
  log('cyan', '📁 创建目录...');
  ensureDirs();
  [OPENCLAW_SERVICES_HOME, SERVICES_DIR, LOG_DIR, DATA_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    log('green', `   ✅ ${dir}`);
  });

  // 2. 安装服务模块
  log('cyan', '\n📦 安装服务模块...');
  await installServices();

  // 3. 备份配置
  log('cyan', '\n💾 备份配置...');
  const modelsFile = path.join(process.env.HOME, '.openclaw/agents/main/agent/models.json');
  const backupFile = path.join(DATA_DIR, 'openclaw-models-original.json');
  if (fs.existsSync(modelsFile) && !fs.existsSync(backupFile)) {
    fs.copyFileSync(modelsFile, backupFile);
    log('green', '   ✅ 已备份 OpenClaw 配置');
  } else if (fs.existsSync(backupFile)) {
    log('cyan', '   ℹ️  备份已存在');
  }

  // 4. 注册 LaunchAgent
  log('cyan', '\n🚀 注册 LaunchAgent...');

  // model-proxy - 立即启动
  if (await checkProxyHealth()) {
    log('green', '   ✅ model-proxy 已在运行');
  } else {
    installLaunchd('model-proxy');
  }

  // watchdog 和 health - 定时任务
  installLaunchd('watchdog');
  installLaunchd('health');

  // 5. 显示状态
  log('cyan', '\n📊 服务状态:');
  await showStatus();

  log('green', '\n✅ 设置完成！');
  console.log('\n快速开始:');
  console.log('   openclaw-services status       # 查看状态');
  console.log('   openclaw-services proxy enable # 启用 proxy 模式');
  console.log('   openclaw-services doctor       # 健康检查\n');
}

// 检查可用的包管理器
function getPackageManager() {
  if (fs.existsSync(path.join(process.env.HOME, '.bun/bin/bun'))) {
    return 'bun';
  }
  if (fs.existsSync('/opt/homebrew/bin/pnpm')) {
    return 'pnpm';
  }
  if (fs.existsSync('/opt/homebrew/bin/npm')) {
    return 'npm';
  }
  return 'bun'; // 默认
}

// 安装服务模块
async function installServices() {
  // 优先使用环境变量，其次使用相对路径
  const srcBase = process.env.OPENCLAW_SERVICES_SRC || path.join(process.env.HOME, 'workspace/openclaw-services');
  const pkgManager = getPackageManager();
  
  const services = ['model-proxy', 'watchdog', 'config-migrator'];
  
  for (const service of services) {
    let srcPath = path.join(srcBase, 'services', service);
    const destPath = path.join(SERVICES_DIR, service);
    
    if (!fs.existsSync(srcPath)) {
      // 尝试从当前项目路径
      const localSrc = path.join(path.dirname(__filename), '..', 'services', service);
      if (fs.existsSync(localSrc)) {
        srcPath = localSrc;
      } else {
        log('yellow', `   ⚠️ 源码不存在: ${service}`);
        continue;
      }
    }
    
    // 复制服务目录
    execSync(`cp -r "${srcPath}" "${destPath}"`, { stdio: 'pipe' });
    
    // 安装依赖
    if (fs.existsSync(path.join(destPath, 'package.json'))) {
      try {
        const installCmd = pkgManager === 'bun' ? 'bun install' 
          : pkgManager === 'pnpm' ? 'pnpm install' 
          : 'npm install';
        execSync(installCmd, { cwd: destPath, stdio: 'pipe' });
        log('green', `   ✅ ${service} (${pkgManager})`);
      } catch (err) {
        log('red', `   ❌ ${service} 依赖安装失败`);
      }
    } else {
      log('green', `   ✅ ${service}`);
    }
  }
}

// 一键安装（不备份）
async function runInstall() {
  console.log(`\n📦 OpenClaw Services Install v${VERSION}\n`);

  // 1. 确保目录存在
  log('cyan', '📁 创建目录...');
  ensureDirs();

  // 2. 安装服务模块
  log('cyan', '\n📦 安装服务模块...');
  await installServices();

  // 3. 注册 LaunchAgent
  log('cyan', '\n🚀 注册 LaunchAgent...');
  for (const service of LAUNCHD_SERVICES) {
    installLaunchd(service.name);
  }

  log('green', '\n✅ 安装完成！');
}

// 卸载所有服务
async function runUninstall() {
  console.log(`\n🗑️ OpenClaw Services Uninstall v${VERSION}\n`);

  // 1. 停止所有服务
  log('cyan', '🛑 停止服务...');
  await stopService('proxy');
  
  // 2. 卸载 LaunchAgent
  log('cyan', '\n🗑️ 卸载 LaunchAgent...');
  for (const service of LAUNCHD_SERVICES) {
    uninstallLaunchd(service.name);
  }

  // 3. 删除服务目录
  log('cyan', '\n🗑️ 删除服务目录...');
  if (fs.existsSync(SERVICES_DIR)) {
    execSync(`rm -rf "${SERVICES_DIR}"`);
    log('green', `   ✅ 已删除: ${SERVICES_DIR}`);
  }

  log('green', '\n✅ 卸载完成！');
}

// LaunchAgent 命令处理
async function launchdCommand(subCmd, serviceName) {
  switch (subCmd) {
    case 'list':
      listLaunchd();
      break;
    case 'install':
      if (serviceName) {
        installLaunchd(serviceName);
      } else {
        for (const service of LAUNCHD_SERVICES) {
          installLaunchd(service.name);
        }
      }
      break;
    case 'uninstall':
      if (serviceName) {
        uninstallLaunchd(serviceName);
      } else {
        for (const service of LAUNCHD_SERVICES) {
          uninstallLaunchd(service.name);
        }
      }
      break;
    default:
      console.log('用法: openclaw-services launchd <list|install|uninstall> [服务名]');
  }
}

// 配置管理命令
async function configCommand(subCmd, options) {
  const configMigratorDir = path.join(SERVICES_DIR, 'config-migrator');
  const configScript = path.join(configMigratorDir, 'index.js');

  if (!fs.existsSync(configMigratorDir)) {
    log('red', '❌ config-migrator 未安装');
    log('yellow', '   请先运行: openclaw-services setup');
    return;
  }

  // 构建参数
  const args = [];
  if (subCmd) args.push(subCmd);

  // 添加选项
  for (const [key, value] of Object.entries(options)) {
    if (value === true) {
      args.push(`--${key}`);
    } else if (value) {
      args.push(`--${key}`, String(value));
    }
  }

  try {
    const cmd = `bun run "${configScript}" ${args.join(' ')}`;
    execSync(cmd, { stdio: 'inherit', cwd: configMigratorDir, shell: true });
  } catch (err) {
    log('red', `❌ config 命令执行失败: ${err.message}`);
  }
}

// 主入口
async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const subCmd = args[1];
  const thirdArg = args[2];

  // 确保目录存在
  ensureDirs();

  switch (cmd) {
    case '--version':
    case '-v':
      console.log(`openclaw-services v${VERSION}`);
      break;
    case 'status': await showStatus(); break;
    case 'doctor': await runDoctor(); break;
    case 'setup': await runSetup(); break;
    case 'install': await runInstall(); break;
    case 'uninstall': await runUninstall(); break;
    case 'start': await startService(subCmd || 'proxy'); break;
    case 'stop': await stopService(subCmd || 'proxy'); break;
    case 'restart': await stopService(subCmd || 'proxy'); await startService(subCmd || 'proxy'); break;
    case 'proxy': await proxyCommand(subCmd); break;
    case 'logs': await showLogs(subCmd); break;
    case 'health': runScript('health-monitor'); break;
    case 'watchdog': runScript('openclaw-watchdog'); break;
    case 'config': {
      // 解析 config 后的选项
      const configOptions = {};
      let configSubCmd = subCmd;
      
      // 处理 --help
      if (subCmd === '--help' || subCmd === '-h') {
        configSubCmd = '--help';
      } else {
        for (let i = 2; i < args.length; i++) {
          if (args[i].startsWith('--')) {
            const key = args[i].slice(2);
            configOptions[key] = args[i + 1] || true;
            i++;
          }
        }
      }
      await configCommand(configSubCmd, configOptions);
      break;
    }
    case 'launchd': await launchdCommand(subCmd, thirdArg); break;
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
