/**
 * 脱敏工具 - 处理敏感信息
 */
import { getConfig } from '../config/index.js';

/**
 * 脱敏请求数据
 */
export function sanitizeRequest(requestData) {
  if (!requestData) return null;
  
  const config = getConfig();
  const maxContent = config.get('maxContentLength');
  const maxSystem = config.get('maxSystemLength');
  const saveFullContent = config.get('saveFullContent') ?? true; // 默认保存完整内容
  
  const details = {
    messages: null,
    system: null,
    tools: null,
    hasImages: false,
  };
  
  // Messages: 保存完整或截断
  if (requestData.messages) {
    if (saveFullContent) {
      // 保存完整消息
      details.messages = JSON.stringify(requestData.messages.map(m => ({
        role: m.role,
        content: m.content,
      })));
    } else {
      // 截断版本
      details.messages = JSON.stringify(requestData.messages.map(m => ({
        role: m.role,
        content: truncate(m.content, maxContent),
      })));
    }
    
    // 检查是否有图片
    details.hasImages = requestData.messages.some(m => 
      Array.isArray(m.content) && m.content.some(c => c.type === 'image')
    );
  }
  
  // System: 保存完整或截断
  if (requestData.system) {
    const sys = typeof requestData.system === 'string' 
      ? requestData.system 
      : JSON.stringify(requestData.system);
    details.system = saveFullContent ? sys : truncate(sys, maxSystem);
  }
  
  // Tools: 保存完整或只保留名称
  if (requestData.tools) {
    if (saveFullContent) {
      // 保存完整工具定义
      details.tools = JSON.stringify(requestData.tools);
    } else {
      // 只保留名称
      details.tools = JSON.stringify(
        requestData.tools.map(t => t.name || t.function?.name || t.type || 'unknown')
      );
    }
  }
  
  return details;
}

/**
 * 脱敏 HTTP 头
 */
export function sanitizeHeaders(headers) {
  const sanitized = { ...headers };
  
  if (sanitized['authorization']) {
    sanitized['authorization'] = sanitized['authorization'].slice(0, 15) + '...';
  }
  if (sanitized['x-api-key']) {
    sanitized['x-api-key'] = sanitized['x-api-key'].slice(0, 8) + '...';
  }
  
  return sanitized;
}

/**
 * 截断文本
 */
export function truncate(text, maxLength) {
  if (!text) return text;
  if (typeof text !== 'string') return '[complex]';
  return text.length > maxLength 
    ? text.slice(0, maxLength) + '...' 
    : text;
}
