/**
 * 配置层 - 支持配置文件和环境变量
 */
import os from 'os';
import path from 'path';
import fs from 'fs';

const CONFIG_FILE = path.join(os.homedir(), '.openclaw-model-proxy', 'config.toml');

const DEFAULT_CONFIG = {
  // 服务配置
  port: 3456,
  timeout: 30000,
  
  // 日志配置
  logRequests: true,
  logResponses: true,
  
  // 存储配置
  retentionDays: 30,
  batchSize: 50,
  flushInterval: 5000,
  dbPath: path.join(os.homedir(), '.openclaw-model-proxy', 'logs.db'),
  
  // 缓存配置
  cacheSize: 1000,       // 最大缓存条目数
  cacheTtlMs: 60000,     // 缓存过期时间（毫秒）
  
  // 内容保存配置
  saveFullContent: true,     // 保存完整内容（推荐开启）
  maxContentLength: 100,     // 用户消息截断长度（saveFullContent=false 时生效）
  maxSystemLength: 200,      // 系统提示词截断长度（saveFullContent=false 时生效）
  redactApiKeys: true,       // 脱敏 API Key
  
  // 供应商配置
  providers: {},
};

/**
 * 简单 TOML 解析器（只支持基本格式）
 */
function parseToml(content) {
  const config = {};
  let currentSection = config;
  let currentPath = [];
  
  const lines = content.split('\n');
  
  for (let line of lines) {
    line = line.trim();
    
    // 跳过注释和空行
    if (!line || line.startsWith('#')) continue;
    
    // Section header: [section] 或 [section.subsection]
    if (line.startsWith('[') && line.endsWith(']')) {
      const sectionPath = line.slice(1, -1).split('.');
      currentPath = sectionPath;
      
      // 创建嵌套对象
      currentSection = config;
      for (const key of sectionPath) {
        if (!currentSection[key]) {
          currentSection[key] = {};
        }
        currentSection = currentSection[key];
      }
      continue;
    }
    
    // Key = value
    const eqIndex = line.indexOf('=');
    if (eqIndex > 0) {
      const key = line.slice(0, eqIndex).trim();
      let value = line.slice(eqIndex + 1).trim();
      
      // 移除引号
      if ((value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))) {
        value = value.slice(1, -1);
      }
      
      // 解析布尔值
      if (value === 'true') value = true;
      else if (value === 'false') value = false;
      // 解析数字
      else if (/^\d+$/.test(value)) value = parseInt(value);
      else if (/^\d+\.\d+$/.test(value)) value = parseFloat(value);
      // 解析数组 ["a", "b"]
      else if (value.startsWith('[') && value.endsWith(']')) {
        try {
          value = JSON.parse(value);
        } catch {
          // 保持原样
        }
      }
      
      currentSection[key] = value;
    }
  }
  
  return config;
}

/**
 * 加载配置文件
 */
function loadConfigFile() {
  // 检查多个可能的配置文件位置
  const configPaths = [
    CONFIG_FILE,
    path.join(process.cwd(), 'config.toml'),
    path.join(process.cwd(), '.openclaw-model-proxy', 'config.toml'),
  ];
  
  for (const configPath of configPaths) {
    if (fs.existsSync(configPath)) {
      try {
        const content = fs.readFileSync(configPath, 'utf-8');
        return parseToml(content);
      } catch (e) {
        console.warn(`Failed to load config file: ${configPath}`, e.message);
      }
    }
  }
  
  return {};
}

/**
 * 从环境变量加载配置
 */
function loadEnvConfig() {
  const env = {};
  
  if (process.env.PROXY_PORT) env.port = parseInt(process.env.PROXY_PORT);
  if (process.env.PROXY_TIMEOUT) env.timeout = parseInt(process.env.PROXY_TIMEOUT);
  if (process.env.DB_PATH) env.dbPath = process.env.DB_PATH;
  if (process.env.RETENTION_DAYS) env.retentionDays = parseInt(process.env.RETENTION_DAYS);
  if (process.env.BATCH_SIZE) env.batchSize = parseInt(process.env.BATCH_SIZE);
  
  return env;
}

class Config {
  constructor(options = {}) {
    // 优先级：代码传入 > 环境变量 > 配置文件 > 默认值
    const fileConfig = loadConfigFile();
    const envConfig = loadEnvConfig();
    
    this.config = {
      ...DEFAULT_CONFIG,
      ...fileConfig,
      ...envConfig,
      ...options,
    };
    
    // 处理路径展开
    if (this.config.dbPath?.startsWith('~')) {
      this.config.dbPath = this.config.dbPath.replace('~', os.homedir());
    }
  }
  
  get(key) {
    return this.config[key];
  }
  
  set(key, value) {
    this.config[key] = value;
    return this;
  }
  
  all() {
    return { ...this.config };
  }
  
  /**
   * 获取供应商配置
   */
  getProvider(providerId) {
    return this.config.providers?.[providerId] || null;
  }
}

// 单例
let instance = null;

export function initConfig(options = {}) {
  instance = new Config(options);
  return instance;
}

export function getConfig() {
  if (!instance) {
    instance = new Config();
  }
  return instance;
}

export default getConfig;
