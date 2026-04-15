/**
 * 供应商检测 - 根据请求信息识别目标供应商
 */
import { PROVIDERS } from './index.js';

/**
 * 检测供应商
 * 优先级：X-Provider 头 > API Key 前缀 > 路径格式
 */
export function detectProvider(req) {
  const path = req.url || '';
  const auth = (req.headers['x-api-key'] || req.headers['authorization'] || '').toLowerCase();
  const providerHeader = req.headers['x-provider']?.toLowerCase();
  
  // 1. 显式指定供应商 (X-Provider 头)
  if (providerHeader && PROVIDERS[providerHeader]) {
    return createProviderResult(providerHeader, PROVIDERS[providerHeader]);
  }
  
  // 2. 根据 API Key 前缀检测（按顺序匹配）
  for (const [id, config] of Object.entries(PROVIDERS)) {
    if (config.keyPrefix?.some(prefix => auth.includes(prefix.toLowerCase()))) {
      return createProviderResult(id, config);
    }
  }
  
  // 3. 根据路径格式检测
  for (const [id, config] of Object.entries(PROVIDERS)) {
    if (config.pathPatterns?.some(pattern => path.includes(pattern))) {
      return createProviderResult(id, config);
    }
  }
  
  // 4. 默认 OpenAI
  return createProviderResult('openai', PROVIDERS.openai);
}

/**
 * 处理路由重写
 */
export function rewritePath(req, provider) {
  let targetPath = req.url || '';
  const result = { path: targetPath, provider: { ...provider } };
  
  // /zai-cn/* → 智谱国内版
  if (targetPath.startsWith('/zai-cn')) {
    result.path = targetPath.replace('/zai-cn', '');
    result.provider.host = 'open.bigmodel.cn';
    result.provider.name = '智谱 AI (CN)';
    result.provider.providerId = 'zhipu';
  }

  // /zai-coding/* → 智谱 Coding Plan
  if (targetPath.startsWith('/zai-coding')) {
    result.path = targetPath.replace('/zai-coding', '/api/coding/paas/v4');
    result.provider.host = 'open.bigmodel.cn';
    result.provider.name = '智谱 AI (Coding Plan)';
    result.provider.providerId = 'zhipu-coding';
  }

  // /minimax/* → MiniMax
  if (targetPath.startsWith('/minimax')) {
    result.provider.host = 'api.minimaxi.com';
    result.provider.name = 'MiniMax';
    result.provider.providerId = 'minimax';
    // 根据请求路径自动选择 API 格式
    // /minimax/anthropic/* → Anthropic 兼容 API
    // /minimax/openai/* 或 /minimax/v1/* → OpenAI 兼容 API
    if (targetPath.startsWith('/minimax/anthropic')) {
      result.path = targetPath.replace('/minimax/anthropic', '/anthropic');
    } else if (targetPath.startsWith('/minimax/v1/')) {
      result.path = targetPath.replace('/minimax/v1', '/v1');
    } else {
      // 默认 OpenAI 兼容格式
      result.path = targetPath.replace('/minimax', '/v1');
    }
  }

  // /claude-proxy/* → Claude Proxy (co.yes.vg)
  if (targetPath.startsWith('/claude-proxy')) {
    result.path = targetPath.replace('/claude-proxy', '/anthropic');
    result.provider.host = 'co.yes.vg';
    result.provider.name = 'Claude Proxy';
    result.provider.providerId = 'claude-proxy';
  }

  // /zai-global/* → z.ai 全球版
  if (targetPath.startsWith('/zai-global')) {
    result.path = targetPath.replace('/zai-global', '');
  }
  
  return result;
}

/**
 * 创建供应商结果对象
 */
function createProviderResult(id, config) {
  return {
    providerId: id,
    name: config.name,
    host: config.host,
    apiFormat: config.apiFormat,
  };
}
