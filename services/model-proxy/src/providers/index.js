/**
 * 供应商注册表 - 支持的 API 供应商定义
 */
export const PROVIDERS = {
  // z.ai 全球版
  'zai': {
    name: 'z.ai Global',
    host: 'api.z.ai',
    // 支持 z.ai 的多种 key 格式: zai_, z-ai_, 或纯 UUID 格式
    keyPrefix: ['zai_', 'z-ai_'],
    // z.ai 的 key 也可能是纯格式，需要通过路径匹配
    pathPatterns: ['/api/paas', '/api/coding/paas'],
    apiFormat: 'openai',
  },

  // 智谱国内版
  'zhipu': {
    name: '智谱 AI',
    host: 'open.bigmodel.cn',
    keyPrefix: ['zhipu_', 'bigmodel_'],
    pathPatterns: [],
    apiFormat: 'openai',
  },

  // Anthropic
  'anthropic': {
    name: 'Anthropic',
    host: 'api.anthropic.com',
    keyPrefix: ['sk-ant-'],
    pathPatterns: ['/v1/messages'],
    apiFormat: 'anthropic',
  },

  // Claude Proxy (自建代理)
  'claude-proxy': {
    name: 'Claude Proxy',
    host: 'api.anthropic.com',
    keyPrefix: ['cr_'],
    pathPatterns: [],
    apiFormat: 'anthropic',
  },

  // MiniMax
  'minimax': {
    name: 'MiniMax',
    host: 'api.minimaxi.com',
    // 支持 MiniMax 的多种 key 格式
    keyPrefix: ['minimax_', 'sk-cp-'],
    pathPatterns: [],
    apiFormat: 'openai',
  },

  // OpenAI (放在最后作为默认)
  'openai': {
    name: 'OpenAI',
    host: 'api.openai.com',
    // 注意：sk- 太宽泛，放在最后匹配
    keyPrefix: ['sk-proj-', 'sk-svca-', 'sk-'],
    pathPatterns: ['/v1/chat/completions', '/v1/completions'],
    apiFormat: 'openai',
  },
};

/**
 * 获取供应商列表
 */
export function getProviderList() {
  return Object.entries(PROVIDERS).map(([id, config]) => ({
    id,
    name: config.name,
    host: config.host,
    keyPrefix: config.keyPrefix,
    apiFormat: config.apiFormat,
  }));
}

/**
 * 获取供应商配置
 */
export function getProvider(providerId) {
  return PROVIDERS[providerId] || null;
}
