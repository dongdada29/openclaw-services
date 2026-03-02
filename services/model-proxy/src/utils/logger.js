/**
 * 日志工具 - 统一日志格式（含敏感信息脱敏）
 */
import { getConfig } from '../config/index.js';

/**
 * 输出日志
 */
export function log(message, data = null) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

/**
 * 输出分隔线
 */
export function logSeparator() {
  console.log(`\n${'='.repeat(60)}`);
}

/**
 * 格式化请求数据用于日志（脱敏）
 */
export function formatRequestLog(id, req, provider, requestData, truncate) {
  const config = getConfig();
  
  const result = {
    method: req.method,
    url: req.url,
    provider: `${provider.name} (${provider.host})`,
    model: requestData?.model,
    messages: requestData?.messages?.length || '(none)',
  };
  
  // 脱敏 API Key
  if (config.get('redactApiKeys')) {
    result.auth = redactAuth(req.headers);
  }
  
  return result;
}

/**
 * 格式化响应数据用于日志
 */
export function formatResponseLog(id, providerId, status, duration, isStreaming, usage) {
  return {
    provider: providerId,
    status,
    duration: `${duration}ms`,
    isStreaming,
    usage,
  };
}

/**
 * 格式化 Token 使用量
 */
export function formatTokenUsage(usage) {
  if (!usage) return null;
  
  const inputTokens = usage.prompt_tokens || usage.input_tokens || 0;
  const outputTokens = usage.completion_tokens || usage.output_tokens || 0;
  
  return {
    input: inputTokens,
    output: outputTokens,
    total: inputTokens + outputTokens,
  };
}

/**
 * 脱敏认证信息
 */
export function redactAuth(headers) {
  const auth = headers['authorization'] || headers['x-api-key'] || '';
  
  if (!auth) return '(none)';
  
  // 保留前缀，隐藏大部分内容
  if (auth.startsWith('Bearer ')) {
    const token = auth.slice(7);
    return `Bearer ${token.slice(0, 8)}...${token.slice(-4)}`;
  }
  
  if (auth.startsWith('sk-ant-')) {
    return `sk-ant-${auth.slice(7, 12)}...${auth.slice(-4)}`;
  }
  
  if (auth.startsWith('sk-proj-')) {
    return `sk-proj-${auth.slice(8, 13)}...${auth.slice(-4)}`;
  }
  
  if (auth.startsWith('sk-')) {
    return `sk-${auth.slice(3, 8)}...${auth.slice(-4)}`;
  }
  
  // 其他格式
  if (auth.length > 12) {
    return `${auth.slice(0, 8)}...${auth.slice(-4)}`;
  }
  
  return '(redacted)';
}

/**
 * 格式化错误日志
 */
export function logError(context, error) {
  const timestamp = new Date().toISOString();
  console.error(`[${timestamp}] ❌ ${context}:`, error.message);
  if (error.stack) {
    console.error(error.stack);
  }
}
