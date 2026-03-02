/**
 * 缓存层 - 内存缓存 + LRU 淘汰
 */
import { getConfig } from '../config/index.js';

class LRUCache {
  constructor(maxSize = 1000, ttlMs = 60000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
    this.cache = new Map();
  }

  get(key) {
    const item = this.cache.get(key);
    if (!item) return null;
    
    // 检查是否过期
    if (Date.now() - item.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }
    
    // LRU: 移到末尾
    this.cache.delete(key);
    this.cache.set(key, item);
    return item.value;
  }

  set(key, value) {
    // 如果已存在，先删除
    if (this.cache.has(key)) {
      this.cache.delete(key);
    }
    
    // 检查容量
    if (this.cache.size >= this.maxSize) {
      // 删除最老的（第一个）
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    
    this.cache.set(key, {
      value,
      timestamp: Date.now(),
    });
  }

  delete(key) {
    this.cache.delete(key);
  }

  clear() {
    this.cache.clear();
  }

  get size() {
    return this.cache.size;
  }
}

// 全局缓存实例
let statsCache = null;
let logsCache = null;

export function initCache() {
  const config = getConfig();
  const cacheSize = config.get('cacheSize') || 1000;
  const cacheTtl = config.get('cacheTtlMs') || 60000; // 默认 1 分钟
  
  statsCache = new LRUCache(cacheSize, cacheTtl);
  logsCache = new LRUCache(cacheSize, cacheTtl);
}

export function getStatsCache() {
  if (!statsCache) {
    initCache();
  }
  return statsCache;
}

export function getLogsCache() {
  if (!logsCache) {
    initCache();
  }
  return logsCache;
}

/**
 * 缓存装饰器
 */
export function cached(cache, keyFn) {
  return function(target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;
    
    descriptor.value = function(...args) {
      const key = keyFn(...args);
      const cached = cache.get(key);
      
      if (cached !== null) {
        return cached;
      }
      
      const result = originalMethod.apply(this, args);
      
      // 处理 Promise
      if (result instanceof Promise) {
        return result.then(r => {
          cache.set(key, r);
          return r;
        });
      }
      
      cache.set(key, result);
      return result;
    };
    
    return descriptor;
  };
}

/**
 * 手动缓存包装
 */
export function withCache(cache, key, fn) {
  const cached = cache.get(key);
  if (cached !== null) {
    return cached;
  }
  
  const result = fn();
  
  if (result instanceof Promise) {
    return result.then(r => {
      cache.set(key, r);
      return r;
    });
  }
  
  cache.set(key, result);
  return result;
}

/**
 * 使缓存失效
 */
export function invalidateStatsCache() {
  if (statsCache) {
    statsCache.clear();
  }
}

export function invalidateLogsCache() {
  if (logsCache) {
    logsCache.clear();
  }
}
