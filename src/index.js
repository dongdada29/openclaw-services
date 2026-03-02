#!/usr/bin/env node
/**
 * OpenClaw Services - Unified Binary Entry
 *
 * Commands:
 *   openclaw-services [cli commands]  - CLI operations (default)
 *   openclaw-services proxy           - Start the proxy server
 *   openclaw-services watchdog        - Run watchdog tasks
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 配置
const OPENCLAW_SERVICES_HOME = process.env.OPENCLAW_SERVICES_HOME || join(process.env.HOME, '.openclaw/services');

// 检测运行模式
const mode = process.argv[2];

async function runProxy() {
  const { startProxy } = await import('./proxy/server.js');
  await startProxy();
}

async function runCLI() {
  const { main } = await import('./cli/index.js');
  await main();
}

async function runWatchdog() {
  const { main } = await import('./watchdog/index.js');
  await main();
}

// 主入口
async function main() {
  try {
    switch (mode) {
      case 'proxy':
      case 'server':
        await runProxy();
        break;
      case 'watchdog':
        await runWatchdog();
        break;
      default:
        // 默认运行 CLI
        await runCLI();
    }
  } catch (err) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  }
}

main();
