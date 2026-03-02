/**
 * 配置模块测试
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { initConfig, getConfig } from '../src/config/index.js';

describe('Config', () => {
  beforeEach(() => {
    // 重置配置
    initConfig({});
  });

  it('should have default values', () => {
    const config = getConfig();
    
    expect(config.get('port')).toBe(3456);
    expect(config.get('timeout')).toBe(30000);
    expect(config.get('retentionDays')).toBe(30);
    expect(config.get('batchSize')).toBe(50);
  });

  it('should allow overriding values', () => {
    initConfig({ port: 8080 });
    const config = getConfig();
    
    expect(config.get('port')).toBe(8080);
  });

  it('should return all config values', () => {
    const config = getConfig();
    const all = config.all();
    
    expect(all).toHaveProperty('port');
    expect(all).toHaveProperty('timeout');
    expect(all).toHaveProperty('dbPath');
  });

  it('should allow setting values', () => {
    const config = getConfig();
    config.set('port', 9000);
    
    expect(config.get('port')).toBe(9000);
  });
});
