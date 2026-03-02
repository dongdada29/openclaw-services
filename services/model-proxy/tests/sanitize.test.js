/**
 * 脱敏工具测试
 */
import { describe, it, expect } from 'vitest';
import { sanitizeRequest, sanitizeHeaders, truncate } from '../src/utils/sanitize.js';

// 初始化配置
import { initConfig } from '../src/config/index.js';
initConfig();

describe('sanitize', () => {
  describe('truncate', () => {
    it('should truncate long text', () => {
      const result = truncate('hello world this is a long text', 10);
      expect(result).toBe('hello worl...');
    });

    it('should not truncate short text', () => {
      const result = truncate('short', 10);
      expect(result).toBe('short');
    });

    it('should handle null/undefined', () => {
      expect(truncate(null)).toBeNull();
      expect(truncate(undefined)).toBeUndefined();
    });

    it('should handle non-string values', () => {
      expect(truncate({ key: 'value' })).toBe('[complex]');
      expect(truncate(123)).toBe('[complex]');
    });
  });

  describe('sanitizeRequest', () => {
    it('should save full message content by default', () => {
      const longContent = 'a'.repeat(200);
      const result = sanitizeRequest({
        messages: [{ role: 'user', content: longContent }]
      });

      const parsed = JSON.parse(result.messages);
      // 默认 saveFullContent=true，保存完整内容
      expect(parsed[0].content).toBe(longContent);
    });

    it('should detect images in messages', () => {
      const result = sanitizeRequest({
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: 'hello' },
            { type: 'image', url: 'data:image/png;base64,xxx' }
          ]
        }]
      });

      expect(result.hasImages).toBe(true);
    });

    it('should handle empty request', () => {
      const result = sanitizeRequest(null);
      expect(result).toBeNull();
    });

    it('should save full tools by default', () => {
      const result = sanitizeRequest({
        tools: [
          { name: 'tool1', description: 'desc' },
          { function: { name: 'tool2' } },
          { type: 'function' }
        ]
      });

      const parsed = JSON.parse(result.tools);
      // 默认 saveFullContent=true，保存完整工具定义
      expect(parsed).toHaveLength(3);
      expect(parsed[0].name).toBe('tool1');
      expect(parsed[0].description).toBe('desc');
    });
  });

  describe('sanitizeHeaders', () => {
    it('should redact authorization header', () => {
      const result = sanitizeHeaders({
        authorization: 'Bearer sk-ant-test123456789'
      });

      expect(result.authorization).toContain('...');
      expect(result.authorization).not.toContain('test123456789');
    });

    it('should redact x-api-key header', () => {
      const result = sanitizeHeaders({
        'x-api-key': 'sk-proj-secretkey123'
      });

      expect(result['x-api-key']).toContain('...');
    });

    it('should preserve other headers', () => {
      const result = sanitizeHeaders({
        'content-type': 'application/json'
      });

      expect(result['content-type']).toBe('application/json');
    });
  });
});
