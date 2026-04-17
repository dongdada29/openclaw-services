/**
 * OpenClaw Watchdog 配置文件
 * 
 * 环境变量优先级高于配置文件
 */

export const config = {
  // Gateway 配置
  gateway: {
    port: parseInt(process.env.GATEWAY_PORT) || 18789,
    healthEndpoint: process.env.GATEWAY_HEALTH_ENDPOINT || '/health',
    processPattern: process.env.GATEWAY_PROCESS_PATTERN || 'openclaw-gateway',
    baseUrl: process.env.GATEWAY_URL || `http://localhost:${parseInt(process.env.GATEWAY_PORT) || 18789}`
  },

  // Model-Proxy 配置
  proxy: {
    port: parseInt(process.env.PROXY_PORT) || 3456,
    healthEndpoint: process.env.PROXY_HEALTH_ENDPOINT || '/_health',
    baseUrl: process.env.PROXY_URL || `http://localhost:${parseInt(process.env.PROXY_PORT) || 3456}`
  },

  // 监控配置
  monitoring: {
    interval: parseInt(process.env.WATCHDOG_INTERVAL) || 60000, // 60 秒
    startupWait: parseInt(process.env.WATCHDOG_STARTUP_WAIT) || 10000, // 10 秒
    verifyWait: parseInt(process.env.WATCHDOG_VERIFY_WAIT) || 15000, // 15 秒
    fetchTimeout: parseInt(process.env.WATCHDOG_FETCH_TIMEOUT) || 5000 // 5 秒
  },

  // Discord 配置
  discord: {
    connectionWindow: parseInt(process.env.DISCORD_CONNECTION_WINDOW) || 5 * 60 * 1000, // 5 分钟
    logLines: parseInt(process.env.DISCORD_LOG_LINES) || 100
  },

  // 告警配置
  alert: {
    enabled: process.env.ALERT_ENABLED === 'true' || false,
    discordWebhook: process.env.DISCORD_WEBHOOK_URL || '',
    slackWebhook: process.env.SLACK_WEBHOOK_URL || '',
    alertFile: process.env.ALERT_FILE || ''
  },

  // 路径配置
  paths: {
    openclawHome: process.env.OPENCLAW_SERVICES_HOME || process.env.HOME + '/.openclaw',
    logDir: process.env.WATCHDOG_LOG_DIR || process.env.HOME + '/.openclaw/logs',
    gatewayLog: process.env.GATEWAY_LOG_FILE || process.env.HOME + '/.openclaw/logs/gateway.log',
    watchdogLog: process.env.WATCHDOG_LOG_FILE || process.env.HOME + '/.openclaw/logs/watchdog.log'
  },

  // Node 路径配置
  node: {
    path: process.env.NODE_PATH || '/opt/homebrew/opt/node@22/bin/node',
    openclawPath: process.env.OPENCLAW_PATH || '/opt/homebrew/lib/node_modules/openclaw/dist/entry.js'
  },

  // 重启策略
  restart: {
    methods: (process.env.RESTART_METHODS || 'launchctl,pkill,spawn').split(','),
    maxRetries: parseInt(process.env.RESTART_MAX_RETRIES) || 3,
    retryDelay: parseInt(process.env.RESTART_RETRY_DELAY) || 5000 // 5 秒
  }
};

/**
 * 验证配置
 */
export function validateConfig() {
  const errors = [];

  if (config.gateway.port < 1 || config.gateway.port > 65535) {
    errors.push('Invalid gateway port');
  }

  if (config.proxy.port < 1 || config.proxy.port > 65535) {
    errors.push('Invalid proxy port');
  }

  if (config.monitoring.interval < 10000) {
    console.warn('⚠️ Monitoring interval < 10s may cause performance issues');
  }

  if (config.alert.enabled && !config.alert.discordWebhook && !config.alert.slackWebhook) {
    console.warn('⚠️ Alert enabled but no webhook configured');
  }

  return errors;
}

/**
 * 打印当前配置
 */
export function printConfig() {
  console.log('🔧 Watchdog Configuration:');
  console.log(`  Gateway Port: ${config.gateway.port}`);
  console.log(`  Proxy Port: ${config.proxy.port}`);
  console.log(`  Monitoring Interval: ${config.monitoring.interval}ms`);
  console.log(`  Alert Enabled: ${config.alert.enabled}`);
  console.log(`  Log Directory: ${config.paths.logDir}`);
}

export default config;
