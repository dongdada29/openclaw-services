#!/usr/bin/env node
/**
 * OpenClaw Services CLI
 * Unified command-line tool for managing OpenClaw infrastructure services
 */

import { spawn, execSync, exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 配置
const OPENCLAW_SERVICES_HOME = process.env.OPENCLAW_SERVICES_HOME || path.join(process.env.HOME, '.openclaw/services');
const SERVICES_DIR = path.join(OPENCLAW_SERVICES_HOME, 'services');
const LOG_DIR = path.join(OPENCLAW_SERVICES_HOME, 'logs');
const DATA_DIR = path.join(OPENCLAW_SERVICES_HOME, 'data');
const CONFIG_FILE = path.join(OPENCLAW_SERVICES_HOME, 'config/openclaw.toml');

// 颜色
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(color, ...args) {
  console.log(colors[color] || '', ...args, colors.reset);
}

function logBox(title, lines) {
  const width = 60;
  const border = '═'.repeat(width - 2);
  console.log(`╔${border}╗`);
  console.log(`║ ${title.padEnd(width - 4)} ║`);
  console.log(`╠${border}╣`);
  lines.forEach(line => {
    console.log(`║ ${line.padEnd(width - 4)} ║`);
  });
  console.log(`╚${border}╝`);
}

// 帮助信息
function showHelp() {
  console.log(`
${colors.cyan}OpenClaw Services CLI${colors.reset} - 统一管理 OpenClaw 基础设施服务

${colors.yellow}用法:${colors.reset}
  openclaw-services <命令> [选项]

${colors.yellow}命令:${colors.reset}
  ${colors.green}install${colors.reset}        一键安装所有服务
  ${colors.green}update${colors.reset}         更新所有服务

  ${colors.green}start${colors.reset} [服务]   启动服务 (proxy | watchdog | all)
  ${colors.green}stop${colors.reset} [服务]    停止服务
  ${colors.green}restart${colors.reset} [服务] 重启服务
  ${colors.green}status${colors.reset}         查看所有服务状态

  ${colors.green}proxy enable${colors.reset}   启用 proxy 模式
  ${colors.green}proxy disable${colors.reset}  禁用 proxy 模式（恢复直连）
  ${colors.green}proxy test${colors.reset}     测试 proxy 连接

  ${colors.green}doctor${colors.reset}         全面健康检查
  ${colors.green}logs${colors.reset} [服务]    查看日志

${colors.yellow}示例:${colors.reset}
  openclaw-services install          # 首次安装
  openclaw-services start proxy      # 启动 proxy 服务
  openclaw-services status           # 查看状态
  openclaw-services proxy enable     # 切换到 proxy 模式
  openclaw-services doctor           # 健康检查

${colors.yellow}环境变量:${colors.reset}
  OPENCLAW_SERVICES_HOME    服务安装路径 (默认: ~/.openclaw/services)
`);
}

// 检查 proxy 是否运行
async function checkProxyHealth() {
  try {
    const response = await fetch('http://localhost:3456/_health');
    return response.ok;
  } catch {
    return false;
  }
}

// 获取 proxy 状态
async function getProxyStats() {
  try {
    const response = await fetch('http://localhost:3456/_stats');
    return await response.json();
  } catch {
    return null;
  }
}

// 启动服务
async function startService(service) {
  switch (service) {
    case 'proxy':
    case 'model-proxy':
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

      // 启动
      const proxyLog = path.join(LOG_DIR, 'model-proxy.log');
      spawn('node', ['server.js'], {
        cwd: proxyDir,
        detached: true,
        stdio: ['ignore', fs.openSync(proxyLog, 'a'), fs.openSync(proxyLog, 'a')]
      }).unref();

      // 等待启动
      await new Promise(r => setTimeout(r, 3000));

      if (await checkProxyHealth()) {
        log('green', '✅ model-proxy 启动成功');
        return true;
      } else {
        log('red', '❌ model-proxy 启动失败');
        return false;
      }

    case 'watchdog':
      log('cyan', '🚀 启动 watchdog...');
      const watchdogScript = path.join(SERVICES_DIR, 'watchdog/scripts/openclaw-watchdog.sh');
      if (fs.existsSync(watchdogScript)) {
        execSync(`bash "${watchdogScript}"`, { stdio: 'inherit' });
        return true;
      } else {
        log('red', '❌ watchdog 脚本不存在');
        return false;
      }

    default:
      log('red', `❌ 未知服务: ${service}`);
      return false;
  }
}

// 停止服务
async function stopService(service) {
  switch (service) {
    case 'proxy':
    case 'model-proxy':
      log('cyan', '🛑 停止 model-proxy...');
      try {
        execSync('pkill -f "node.*model-proxy"', { stdio: 'pipe' });
        log('green', '✅ model-proxy 已停止');
        return true;
      } catch {
        log('yellow', '⚠️ model-proxy 未在运行');
        return true;
      }

    default:
      log('red', `❌ 未知服务: ${service}`);
      return false;
  }
}

// 显示状态
async function showStatus() {
  logBox('OpenClaw Services 状态', []);

  // Proxy 状态
  console.log('\n📦 Model Proxy:');
  const proxyRunning = await checkProxyHealth();
  if (proxyRunning) {
    log('green', '   状态: ✅ 运行中');
    const stats = await getProxyStats();
    if (stats) {
      console.log(`   总请求: ${stats.totalRequests || 0}`);
      console.log(`   端口: 3456`);
    }
  } else {
    log('red', '   状态: ❌ 未运行');
  }

  // Watchdog 状态
  console.log('\n🐕 Watchdog:');
  const watchdogPlist = path.join(process.env.HOME, 'Library/LaunchAgents/com.openclaw.watchdog.plist');
  const healthPlist = path.join(process.env.HOME, 'Library/LaunchAgents/com.openclaw.health.plist');

  if (fs.existsSync(watchdogPlist)) {
    try {
      const result = execSync('launchctl list | grep openclaw.watchdog', { encoding: 'utf-8', stdio: ['pipe'] });
      log('green', '   状态: ✅ 已加载');
    } catch {
      log('yellow', '   状态: ⚠️ 未加载');
    }
  } else {
    log('yellow', '   状态: ⚠️ 未安装');
  }

  // 配置
  console.log('\n📁 路径配置:');
  console.log(`   服务目录: ${OPENCLAW_SERVICES_HOME}`);
  console.log(`   日志目录: ${LOG_DIR}`);
  console.log(`   数据目录: ${DATA_DIR}`);

  // 备份
  console.log('\n💾 配置备份:');
  const backupFile = path.join(DATA_DIR, 'openclaw-models-original.json');
  if (fs.existsSync(backupFile)) {
    const stats = fs.statSync(backupFile);
    log('green', `   ✅ 存在 (${(stats.size / 1024).toFixed(1)} KB, ${stats.mtime.toLocaleDateString()})`);
  } else {
    log('yellow', '   ⚠️ 无备份');
  }

  console.log('');
}

// Proxy 模式切换
async function proxyCommand(subCmd) {
  const switchScript = path.join(SERVICES_DIR, 'watchdog/scripts/model-proxy-switch.sh');

  switch (subCmd) {
    case 'enable':
      log('cyan', '🔄 切换到 proxy 模式...');
      if (fs.existsSync(switchScript)) {
        execSync(`bash "${switchScript}" enable`, { stdio: 'inherit' });
      } else {
        log('red', '❌ model-proxy-switch.sh 不存在');
      }
      break;

    case 'disable':
      log('cyan', '🔄 恢复直连模式...');
      if (fs.existsSync(switchScript)) {
        execSync(`bash "${switchScript}" disable`, { stdio: 'inherit' });
      } else {
        log('red', '❌ model-proxy-switch.sh 不存在');
      }
      break;

    case 'test':
      log('cyan', '🧪 测试 proxy...');
      if (fs.existsSync(switchScript)) {
        execSync(`bash "${switchScript}" test`, { stdio: 'inherit' });
      } else {
        // 直接测试
        if (await checkProxyHealth()) {
          log('green', '✅ Proxy 响应正常');
        } else {
          log('red', '❌ Proxy 无响应');
        }
      }
      break;

    default:
      console.log(`用法: openclaw-services proxy <enable|disable|test>`);
  }
}

// 健康检查
async function runDoctor() {
  logBox('OpenClaw Services Doctor', []);

  console.log('\n🔍 检查服务状态...\n');

  // 1. 目录检查
  console.log('1. 目录结构:');
  const dirs = [OPENCLAW_SERVICES_HOME, SERVICES_DIR, LOG_DIR, DATA_DIR];
  dirs.forEach(dir => {
    if (fs.existsSync(dir)) {
      log('green', `   ✅ ${dir}`);
    } else {
      log('red', `   ❌ ${dir} (不存在)`);
    }
  });

  // 2. 服务检查
  console.log('\n2. 服务状态:');
  if (await checkProxyHealth()) {
    log('green', '   ✅ model-proxy 运行中');
  } else {
    log('red', '   ❌ model-proxy 未运行');
  }

  // 3. 配置检查
  console.log('\n3. 配置文件:');
  const modelsFile = path.join(process.env.HOME, '.openclaw/agents/main/agent/models.json');
  if (fs.existsSync(modelsFile)) {
    log('green', `   ✅ models.json 存在`);
    const content = fs.readFileSync(modelsFile, 'utf-8');
    if (content.includes('localhost:3456')) {
      log('cyan', '   🔀 当前模式: Proxy');
    } else {
      log('cyan', '   🔗 当前模式: 直连');
    }
  } else {
    log('red', '   ❌ models.json 不存在');
  }

  // 4. Gateway 检查
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

// 安装
async function install() {
  logBox('OpenClaw Services 安装', []);

  console.log('\n📦 安装步骤:\n');

  // 1. 检查目录
  console.log('1. 创建目录...');
  [OPENCLAW_SERVICES_HOME, LOG_DIR, DATA_DIR, path.join(DATA_DIR, 'backups')].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      log('green', `   ✅ 创建 ${dir}`);
    } else {
      log('cyan', `   ℹ️  已存在 ${dir}`);
    }
  });

  // 2. 安装依赖
  console.log('\n2. 安装依赖...');
  try {
    execSync('pnpm install', { cwd: OPENCLAW_SERVICES_HOME, stdio: 'inherit' });
    log('green', '   ✅ 依赖安装完成');
  } catch (e) {
    log('yellow', '   ⚠️ pnpm 不可用，跳过');
  }

  // 3. 备份配置
  console.log('\n3. 备份 OpenClaw 配置...');
  const modelsFile = path.join(process.env.HOME, '.openclaw/agents/main/agent/models.json');
  const backupFile = path.join(DATA_DIR, 'openclaw-models-original.json');
  if (fs.existsSync(modelsFile) && !fs.existsSync(backupFile)) {
    fs.copyFileSync(modelsFile, backupFile);
    log('green', `   ✅ 已备份到 ${backupFile}`);
  } else if (fs.existsSync(backupFile)) {
    log('cyan', '   ℹ️  备份已存在');
  }

  // 4. 启动 proxy
  console.log('\n4. 启动服务...');
  await startService('proxy');

  // 5. 验证
  console.log('\n5. 验证安装...');
  if (await checkProxyHealth()) {
    log('green', '   ✅ model-proxy 运行正常');
  } else {
    log('red', '   ❌ model-proxy 启动失败');
  }

  console.log('\n✅ 安装完成!\n');
  console.log('下一步:');
  console.log('  openclaw-services status       # 查看状态');
  console.log('  openclaw-services proxy enable # 启用 proxy 模式');
  console.log('  openclaw-services doctor       # 健康检查');
}

// 主入口
async function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];
  const subCmd = args[1];

  // 确保日志目录存在
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }

  switch (cmd) {
    case 'install':
      await install();
      break;

    case 'start':
      if (subCmd === 'all' || !subCmd) {
        await startService('proxy');
      } else {
        await startService(subCmd);
      }
      break;

    case 'stop':
      await stopService(subCmd || 'proxy');
      break;

    case 'restart':
      await stopService(subCmd || 'proxy');
      await startService(subCmd || 'proxy');
      break;

    case 'status':
      await showStatus();
      break;

    case 'proxy':
      await proxyCommand(subCmd);
      break;

    case 'doctor':
      await runDoctor();
      break;

    case 'logs':
      await showLogs(subCmd);
      break;

    case 'watchdog':
      const watchdogScript = path.join(SERVICES_DIR, 'watchdog/scripts/openclaw-watchdog.sh');
      if (fs.existsSync(watchdogScript)) {
        execSync(`bash "${watchdogScript}"`, { stdio: 'inherit' });
      }
      break;

    case 'health':
      const healthScript = path.join(SERVICES_DIR, 'watchdog/scripts/health-monitor.sh');
      if (fs.existsSync(healthScript)) {
        execSync(`bash "${healthScript}"`, { stdio: 'inherit' });
      }
      break;

    case '--help':
    case '-h':
    case 'help':
    default:
      showHelp();
      break;
  }
}

main().catch(console.error);
